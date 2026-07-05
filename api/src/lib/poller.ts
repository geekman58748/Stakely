import { db } from "./supabase.js";
import { txline } from "./txline.js";
import { notifySettlement, notifyLosing, notifyMatchSoon } from "./telegram.js";

const POLL_MS       = 3 * 60 * 1000;   // poll every 3 min
const ROAST_COOL_MS = 15 * 60 * 1000;  // max one roast per bet per 15 min
const lastRoasted   = new Map<string, number>();
// pinged_soon state is persisted in the matches table — survives redeployments

const FINISH_STATES = new Set(["finished", "FT", "AET", "PEN", "Ended", "ended"]);

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
      .select("id,home_team,away_team,status,home_score,away_score")
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
        await settleBetsForMatch(match.id, match.home_team, match.away_team, score.homeScore, score.awayScore, score.merkleProof);
      } else {
        await roastLosers(match.id, match.home_team, match.away_team, score.homeScore, score.awayScore, score.minute);
      }
    }));
    await pingUpcomingMatches();
  } catch (e: any) {
    console.error("[poller] tick error:", e.message);
  }
}

// ── Auto-settlement ───────────────────────────────────────────────────────────
async function settleBetsForMatch(
  matchId: string, homeTeam: string, awayTeam: string,
  homeScore: number, awayScore: number,
  merkleProof?: unknown
) {
  const { data: bets } = await db.from("bets")
    .select(`id, creator_side, amount_usdc,
      creator:users!bets_creator_id_fkey(id,telegram_id,display_name),
      counterparty:users!bets_counterparty_id_fkey(id,telegram_id,display_name)`)
    .eq("match_id", matchId)
    .in("status", ["challenged", "locked", "live"]);

  if (!bets?.length) return;

  // Store Merkle proof on the match record — cryptographic receipt of the result
  if (merkleProof) {
    await db.from("matches").update({
      merkle_proof:      merkleProof,
      merkle_stored_at:  new Date().toISOString(),
    }).eq("id", matchId);
  }

  const result: "home" | "away" | "draw" =
    homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
  const winTeam = result === "home" ? homeTeam : result === "away" ? awayTeam : "Draw";

  await Promise.all(bets.map(async (bet) => {
    const creator      = bet.creator      as any;
    const counterparty = bet.counterparty as any;
    const creatorWon   = bet.creator_side === result;
    const winner       = creatorWon ? creator      : counterparty;
    const loser        = creatorWon ? counterparty : creator;

    await db.from("bets").update({
      status:     "settled",
      winner_id:  winner?.id ?? null,
      settled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", bet.id);

    if (winner?.id && loser?.id) {
      await Promise.all([
        db.rpc("increment_streak_win", { user_id: winner.id }),
        db.rpc("reset_streak_loss",    { user_id: loser.id }),
      ]);
    }

    await notifySettlement(
      winner?.telegram_id ?? null,
      loser?.telegram_id  ?? null,
      winner?.display_name ?? "anon",
      loser?.display_name  ?? "anon",
      bet.amount_usdc,
      winTeam,
    );
  }));

  console.log(`[poller] settled ${bets.length} bet(s) — match ${matchId} ${homeScore}-${awayScore}`);
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

