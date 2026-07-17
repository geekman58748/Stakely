import { db } from "./supabase.js";
import { txline } from "./txline.js";
import { notifySettlement, notifyLosing, notifyMatchSoon } from "./telegram.js";
import { settleEscrowOnChain } from "./keeper.js";

const POLL_MS       = 3 * 60 * 1000;   // poll every 3 min
const ROAST_COOL_MS = 15 * 60 * 1000;  // max one roast per bet per 15 min
const lastRoasted   = new Map<string, number>();
let tickRunning = false;
// pinged_soon state is persisted in the matches table — survives redeployments

const FINISH_STATES = new Set(["finished", "FT", "AET", "PEN", "Ended", "ended"]);

async function writeWithRetry(
  label: string,
  write: () => PromiseLike<{ error: unknown }>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await write();
    if (!error) return;
    lastError = error;
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

// ── Main tick ─────────────────────────────────────────────────────────────────
// Map TxLINE GameState to our status
function mapGameState(gs: string): string {
  const s = (gs ?? "").toLowerCase();
  if (["1h","2h","live","inprogress","in_progress","in progress"].some(x => s.includes(x))) return "live";
  if (["ht","halftime","half_time","half time"].some(x => s.includes(x))) return "halftime";
  if (["ft","aet","pen","finished","ended","full time","fulltime"].some(x => s.includes(x))) return "finished";
  if (["postponed","cancelled","abandoned"].some(x => s.includes(x))) return "postponed";
  return "scheduled";
}

async function tick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    // Auto-transition: matches past kickoff still "scheduled" — check TxLINE for real status
    const nowTs = new Date().toISOString();
    const { data: staleScheduled } = await db.from("matches")
      .select("id")
      .eq("status", "scheduled")
      .lt("kickoff_at", nowTs);

    if (staleScheduled?.length) {
      await Promise.all(staleScheduled.map(async (m) => {
        try {
          const score = await txline.getScore(m.id);
          const newStatus = mapGameState(score.status);
          if (newStatus !== "scheduled") {
            await db.from("matches").update({
              status:     newStatus,
              home_score: score.homeScore,
              away_score: score.awayScore,
              updated_at: new Date().toISOString(),
            }).eq("id", m.id);
            console.log("[poller] status update:", m.id, "->", newStatus);
          }
        } catch { /* TxLINE may not have data yet — skip */ }
      }));
    }

    const { data: liveMatches } = await db
      .from("matches")
      .select("id,home_team,away_team,status,home_score,away_score,participant1_is_home")
      .in("status", ["live", "halftime"]);

    if (!liveMatches?.length) return;

    await Promise.all(liveMatches.map(async (match) => {
      let score;
      try { score = await txline.getScore(match.id); }
      catch { return; }

      // Persist fresh score
      await db.from("matches").update({
        home_score: score.homeScore,
        away_score: score.awayScore,
        status:     score.status,
        updated_at: new Date().toISOString(),
      }).eq("id", match.id);

      if (FINISH_STATES.has(score.status)) {
        if (!score.finalised || !score.seq) {
          console.warn("[poller] refusing settlement without game_finalised period 100 record:", match.id);
          return;
        }
        const proof = await txline.getSettlementProof(match.id, score.seq);
        await settleBetsForMatch(
          match.id,
          match.home_team,
          match.away_team,
          Boolean(match.participant1_is_home),
          score.seq,
          proof,
        );
      } else {
        await roastLosers(match.id, match.home_team, match.away_team, score.homeScore, score.awayScore, score.minute);
      }
    }));
    await pingUpcomingMatches();
  } catch (e: any) {
    console.error("[poller] tick error:", e.message);
  } finally {
    tickRunning = false;
  }
}

// ── Auto-settlement ───────────────────────────────────────────────────────────
async function settleBetsForMatch(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  participant1IsHome: boolean,
  txlineSeq: number,
  merkleProof: unknown,
) {
  const { data: bets } = await db.from("bets")
    .select(`id, creator_side, amount_usdc, escrow_pda,
      creator:users!bets_creator_id_fkey(id,telegram_id,display_name,wallet_address),
      counterparty:users!bets_counterparty_id_fkey(id,telegram_id,display_name,wallet_address)`)
    .eq("match_id", matchId)
    // A challenge is only settleable after both sides have funded escrow.
    .in("status", ["locked", "live"]);

  if (!bets?.length) return;

  let settledCount = 0;
  for (const bet of bets) {
    const creator      = bet.creator      as any;
    const counterparty = bet.counterparty as any;
    if (!creator?.wallet_address || !counterparty?.wallet_address || !bet.escrow_pda) {
      console.error("[poller] funded bet is missing an escrow party:", bet.id);
      continue;
    }

    const attemptedAt = new Date().toISOString();
    try {
      const settlement = await settleEscrowOnChain({
        betId: bet.id,
        fixtureId: matchId,
        creatorSide: bet.creator_side,
        participant1IsHome,
        creator,
        counterparty,
        proof: merkleProof,
      });
      const winner = settlement.winnerId === creator.id ? creator : counterparty;
      const loser = settlement.winnerId === creator.id ? counterparty : creator;
      const winTeam = settlement.result === "home"
        ? homeTeam
        : settlement.result === "away"
          ? awayTeam
          : "Draw";

      // The chain is authoritative. Persist its receipt before any secondary data
      // so a transient match or notification failure cannot trigger a second payout.
      await writeWithRetry("failed to persist settlement receipt", () => db.from("bets").update({
        status: "settled",
        settle_tx: settlement.signature,
        winner_id: settlement.winnerId,
        txline_seq: txlineSeq,
        daily_scores_root: settlement.dailyScoresRoot,
        settlement_error: null,
        settlement_attempted_at: attemptedAt,
        settled_at: attemptedAt,
        updated_at: attemptedAt,
      }).eq("id", bet.id));
      settledCount += 1;

      try {
        await writeWithRetry("failed to persist TxLINE match proof", () => db.from("matches").update({
          home_score: settlement.homeScore,
          away_score: settlement.awayScore,
          result: settlement.result,
          merkle_proof: merkleProof,
          merkle_stored_at: attemptedAt,
        }).eq("id", matchId));
      } catch (proofSyncError) {
        const message = proofSyncError instanceof Error ? proofSyncError.message : String(proofSyncError);
        await db.from("bets").update({ settlement_error: message }).eq("id", bet.id);
        console.error("[poller] chain settled but match proof sync failed:", bet.id, message);
      }

      try {
        await Promise.all([
          db.rpc("increment_streak_win", { user_id: winner.id }),
          db.rpc("reset_streak_loss", { user_id: loser.id }),
        ]);
        await notifySettlement(
          winner.telegram_id ?? null,
          loser.telegram_id ?? null,
          winner.display_name ?? "anon",
          loser.display_name ?? "anon",
          bet.amount_usdc,
          winTeam,
        );
      } catch (sideEffectError) {
        console.error("[poller] settlement recorded but follow-up failed:", bet.id, sideEffectError);
      }
    } catch (settlementError) {
      const message = settlementError instanceof Error ? settlementError.message : "Unknown settlement failure";
      await db.from("bets").update({
        settlement_error: message,
        settlement_attempted_at: attemptedAt,
        updated_at: attemptedAt,
      }).eq("id", bet.id);
      console.error("[poller] settlement failed:", bet.id, message);
    }
  }

  console.log(`[poller] settled ${settledCount}/${bets.length} bet(s) on-chain — match ${matchId}`);
}

// ── Mid-game roasting ─────────────────────────────────────────────────────────
async function roastLosers(
  matchId: string, homeTeam: string, awayTeam: string,
  homeScore: number, awayScore: number, minute: number | null
) {
  if (homeScore === awayScore) return;

  const losingSide: "home" | "away" = homeScore > awayScore ? "away" : "home";
  const losingTeam  = losingSide === "home" ? homeTeam : awayTeam;
  const leadingTeam = losingSide === "home" ? awayTeam : homeTeam;
  const leadScore   = Math.max(homeScore, awayScore);
  const loseScore   = Math.min(homeScore, awayScore);

  const { data: bets } = await db.from("bets")
    .select(`id, creator_side,
      creator:users!bets_creator_id_fkey(telegram_id,display_name),
      counterparty:users!bets_counterparty_id_fkey(telegram_id,display_name)`)
    .eq("match_id", matchId)
    .eq("status", "locked");

  if (!bets?.length) return;

  await Promise.all(bets.map(async (bet) => {
    const creator      = bet.creator      as any;
    const counterparty = bet.counterparty as any;

    // Opposite side for counterparty (draw stays draw)
    const cpSide = bet.creator_side === "home" ? "away"
                 : bet.creator_side === "away" ? "home"
                 : "draw";

    const losingUser = bet.creator_side === losingSide ? creator
                     : cpSide           === losingSide ? counterparty
                     : null;

    if (!losingUser?.telegram_id) return;

    const now = Date.now();
    if (now - (lastRoasted.get(bet.id) ?? 0) < ROAST_COOL_MS) return;
    lastRoasted.set(bet.id, now);

    await notifyLosing(
      losingUser.telegram_id,
      losingUser.display_name,
      losingTeam, leadingTeam,
      loseScore, leadScore, minute,
    );
  }));
}


// ── Upcoming match hype pings ─────────────────────────────────────────────────
// Fires once per match when kickoff is 30–45 min away
// Pings every user with a linked Telegram — tells them to get a bet in before it starts
async function pingUpcomingMatches() {
  try {
    const now    = Date.now();
    const nowIso = new Date(now).toISOString();
    const hi     = new Date(now + 90 * 60 * 1000).toISOString(); // 90 min from now

    const { data: upcoming } = await db.from("matches")
      .select("id,home_team,away_team,kickoff_at,pinged_soon")
      .eq("status", "scheduled")
      .gte("kickoff_at", nowIso)
      .lte("kickoff_at", hi);

    if (!upcoming?.length) return;

    // Filter out matches already pinged — DB-persisted, survives redeploys
    const unpinged = (upcoming ?? []).filter((m: any) => !m.pinged_soon);
    if (!unpinged.length) return;

    // Get all users with linked Telegram
    const { data: users } = await db.from("users")
      .select("telegram_id")
      .not("telegram_id", "is", null);

    if (!users?.length) return;

    for (const match of unpinged) {
      // Mark as pinged in DB immediately (before sending) to prevent race on redeploy
      await db.from("matches").update({ pinged_soon: true }).eq("id", match.id);
      const minsUntil = Math.round((new Date(match.kickoff_at).getTime() - now) / 60000);
      await Promise.all(
        users
          .filter((u): u is { telegram_id: number } => u.telegram_id !== null)
          .map(u => notifyMatchSoon(u.telegram_id, match.home_team, match.away_team, minsUntil))
      );
      console.log("[poller] pinged", users.length, "users — match soon:", match.home_team, "vs", match.away_team);
    }
  } catch (e: any) {
    console.error("[poller] pingUpcomingMatches error:", e.message);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────
export function startPoller() {
  console.log(`[poller] live match polling every ${POLL_MS / 60000} min`);
  tick();
  setInterval(tick, POLL_MS);
}
