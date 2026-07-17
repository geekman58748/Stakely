import { db } from "./supabase.js";
import { txline } from "./txline.js";
import { notifySettlement, notifyLosing, notifyMatchSoon } from "./telegram.js";
// Lazy-load escrow to avoid blocking startup on Solana module load
let _settleOnChain: typeof import("./escrow.js")["settleOnChain"] | null = null;
async function getSettleOnChain() {
  if (!_settleOnChain) _settleOnChain = (await import("./escrow.js")).settleOnChain;
  return _settleOnChain;
}

const POLL_MS       = 3 * 60 * 1000;
const ROAST_COOL_MS = 15 * 60 * 1000;
const lastRoasted   = new Map<string, number>();

const FINISH_STATES = new Set(["finished", "FT", "AET", "PEN", "Ended", "ended"]);

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
    const nowTs = new Date().toISOString();
    const { data: staleScheduled } = await db.from("matches")
      .select("id").eq("status", "scheduled").lt("kickoff_at", nowTs);

    if (staleScheduled?.length) {
      await Promise.all(staleScheduled.map(async (m) => {
        try {
          const score = await txline.getScore(m.id);
          const newStatus = mapGameState(score.status);
          if (newStatus !== "scheduled") {
            await db.from("matches").update({
              status: newStatus, home_score: score.homeScore,
              away_score: score.awayScore, updated_at: new Date().toISOString(),
            }).eq("id", m.id);
            console.log("[poller] status update:", m.id, "->", newStatus);
          }
        } catch { /* TxLINE may not have data yet */ }
      }));
    }

    const { data: liveMatches } = await db.from("matches")
      .select("id,home_team,away_team,status,home_score,away_score")
      .in("status", ["live", "halftime"]);

    if (!liveMatches?.length) return;

    await Promise.all(liveMatches.map(async (match) => {
      let score;
      try { score = await txline.getScore(match.id); } catch { return; }

      await db.from("matches").update({
        home_score: score.homeScore, away_score: score.awayScore,
        status: score.status, updated_at: new Date().toISOString(),
      }).eq("id", match.id);

      if (FINISH_STATES.has(score.status)) {
        await settleBetsForMatch(
          match.id, match.home_team, match.away_team,
          score.homeScore, score.awayScore, score.merkleProof
        );
      } else {
        await roastLosers(match.id, match.home_team, match.away_team,
          score.homeScore, score.awayScore, score.minute ?? undefined);
      }
    }));
    await pingUpcomingMatches();
  } catch (e: any) {
    console.error("[poller] tick error:", e.message);
  }
}

// ── Auto-settlement (chain-first) ─────────────────────────────────────────────
async function settleBetsForMatch(
  matchId: string, homeTeam: string, awayTeam: string,
  homeScore: number, awayScore: number, merkleProof?: unknown,
) {
  const result: "home" | "away" | "draw" =
    homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";

  const { data: bets } = await db.from("bets")
    .select(`id, creator_side, amount_usdc, escrow_pda,
      creator:users!bets_creator_id_fkey(id,wallet_address,telegram_id,display_name),
      counterparty:users!bets_counterparty_id_fkey(id,wallet_address,telegram_id,display_name)`)
    .eq("match_id", matchId)
    .in("status", ["locked", "live"]);

  if (!bets?.length) return;

  await Promise.all(bets.map(async (bet: any) => {
    try {
      const creatorWon = bet.creator_side === result;
      const winner  = creatorWon ? bet.creator  : bet.counterparty;
      const loser   = creatorWon ? bet.counterparty : bet.creator;

      if (!winner || !loser) {
        console.warn("[keeper] bet", bet.id, "missing winner/loser — skipping");
        return;
      }

      // ── Chain-first settlement ───────────────────────────────────────────────
      let settle_tx: string | null = null;
      if (bet.escrow_pda && winner.wallet_address) {
        try {
          settle_tx = await (await getSettleOnChain())(bet.id, winner.wallet_address);
          console.log("[keeper] on-chain settlement tx:", settle_tx, "for bet", bet.id);
        } catch (chainErr: any) {
          console.error("[keeper] on-chain settlement FAILED for bet", bet.id, ":", chainErr.message);
          // Don't update DB — chain failed, bet stays locked pending retry
          return;
        }
      } else {
        console.warn("[keeper] bet", bet.id, "has no escrow_pda — DB-only settlement (demo mode)");
      }

      // ── DB update (only after chain confirms) ────────────────────────────────
      await db.from("bets").update({
        status:       "settled",
        winner_id:    winner.id,
        settle_tx,
        settled_at:   new Date().toISOString(),
        merkle_proof: merkleProof ?? null,
        updated_at:   new Date().toISOString(),
      }).eq("id", bet.id);

      // Update streaks (best-effort — functions may not exist yet)
      try {
        await db.rpc("increment_streak_win", { user_id: winner.id });
        await db.rpc("reset_streak_loss",    { user_id: loser.id  });
      } catch (rpcErr: any) {
        console.warn("[keeper] streak RPC failed:", rpcErr.message);
      }

      // Update match result if not stored yet
      await db.from("matches").update({
        result: result, merkle_proof: merkleProof ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", matchId).is("result", null);

      // ── Notifications ────────────────────────────────────────────────────────
      if (winner.telegram_id) {
        notifySettlement(
          winner.telegram_id, null,
          winner.display_name ?? "you", loser.display_name ?? "opponent",
          bet.amount_usdc, result === "home" ? homeTeam : result === "away" ? awayTeam : homeTeam
        ).catch(() => null);
      }
      if (loser.telegram_id) {
        notifyLosing(
          loser.telegram_id, loser.display_name ?? "you",
          result === "home" ? awayTeam : result === "away" ? homeTeam : awayTeam,
          result === "home" ? homeTeam : result === "away" ? awayTeam : homeTeam,
          result === "home" ? awayScore : homeScore,
          result === "home" ? homeScore : awayScore,
          null
        ).catch(() => null);
      }
      console.log("[keeper] settled bet", bet.id, "— winner:", winner.display_name ?? winner.wallet_address);
    } catch (e: any) {
      console.error("[keeper] error settling bet", bet.id, ":", e.message);
    }
  }));
}

// ── Roast losers mid-match ────────────────────────────────────────────────────
async function roastLosers(
  matchId: string, homeTeam: string, awayTeam: string,
  homeScore: number, awayScore: number, minute?: number,
) {
  const now = Date.now();
  const { data: bets } = await db.from("bets")
    .select(`id, creator_side,
      creator:users!bets_creator_id_fkey(telegram_id,display_name),
      counterparty:users!bets_counterparty_id_fkey(telegram_id,display_name)`)
    .eq("match_id", matchId).in("status", ["locked", "live"]);

  if (!bets?.length) return;

  await Promise.all(bets.map(async (bet: any) => {
    const creatorLeading = bet.creator_side === "home" ? homeScore > awayScore :
      bet.creator_side === "away" ? awayScore > homeScore : false;

    // Roast the losing side (but not on draws, not too frequently)
    if (homeScore !== awayScore) {
      const loser = creatorLeading ? bet.counterparty : bet.creator;
      if (loser?.telegram_id) {
        const lastTime = lastRoasted.get(`${bet.id}:${loser.telegram_id}`) ?? 0;
        if (now - lastTime > ROAST_COOL_MS) {
          lastRoasted.set(`${bet.id}:${loser.telegram_id}`, now);
          const losingTeam  = bet.creator_side === "home" ? awayTeam : homeTeam;
          const leadingTeam = bet.creator_side === "home" ? homeTeam : awayTeam;
          notifyLosing(
            loser.telegram_id, loser.display_name ?? "u",
            losingTeam, leadingTeam,
            homeScore < awayScore ? homeScore : awayScore,
            homeScore < awayScore ? awayScore : homeScore,
            minute ?? null
          ).catch(() => null);
        }
      }
    }
  }));
}

// ── Upcoming match hype pings ─────────────────────────────────────────────────
async function pingUpcomingMatches() {
  try {
    const now    = Date.now();
    const nowIso = new Date(now).toISOString();
    const hi     = new Date(now + 90 * 60 * 1000).toISOString();

    const { data: upcoming } = await db.from("matches")
      .select("id,home_team,away_team,kickoff_at,pinged_soon")
      .eq("status", "scheduled").gte("kickoff_at", nowIso).lte("kickoff_at", hi);

    if (!upcoming?.length) return;
    const unpinged = (upcoming ?? []).filter((m: any) => !m.pinged_soon);
    if (!unpinged.length) return;

    const { data: users } = await db.from("users")
      .select("telegram_id").not("telegram_id", "is", null);
    if (!users?.length) return;

    for (const match of unpinged) {
      await db.from("matches").update({ pinged_soon: true }).eq("id", match.id);
      const minsUntil = Math.round((new Date(match.kickoff_at).getTime() - now) / 60000);
      await Promise.all(
        users
          .filter((u): u is { telegram_id: number } => u.telegram_id !== null)
          .map(u => notifyMatchSoon(u.telegram_id, match.home_team, match.away_team, minsUntil))
      );
      console.log("[poller] pinged", users.length, "users for:", match.home_team, "vs", match.away_team);
    }
  } catch (e: any) {
    console.error("[poller] pingUpcomingMatches error:", e.message);
  }
}

export function startPoller() {
  console.log(`[poller] live match polling every ${POLL_MS / 60000} min`);
  tick();
  setInterval(tick, POLL_MS);
}
