import { Router } from "express";
import { db } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** GET /bets — list bets (filter by match_id or status) */
router.get("/", requireAuth, async (req, res) => {
  const { match_id, status, role } = req.query;

  const { data: user } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  if (!user) { res.status(404).json({ error: "User not registered" }); return; }

  let q = db.from("bets").select(`
    *, 
    match:matches(id,home_team,away_team,kickoff_at,status,home_score,away_score),
    creator:users!bets_creator_id_fkey(id,display_name,wallet_address,streak),
    counterparty:users!bets_counterparty_id_fkey(id,display_name,wallet_address,streak)
  `).order("created_at", { ascending: false });

  if (match_id) q = q.eq("match_id", match_id as string);
  if (status)   q = q.eq("status", status as string);

  if (role === "mine") {
    q = q.or(`creator_id.eq.${user.id},counterparty_id.eq.${user.id}`);
  }

  const { data, error } = await q;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/** GET /bets/open — open (challenged) bets anyone can accept */
router.get("/open", async (req, res) => {
  const { match_id } = req.query;
  let q = db.from("bets").select(`
    *,
    match:matches(id,home_team,away_team,kickoff_at,home_odds,away_odds,draw_odds),
    creator:users!bets_creator_id_fkey(id,display_name,wallet_address,streak)
  `).eq("status", "challenged").order("created_at", { ascending: false }).limit(50);

  if (match_id) q = q.eq("match_id", match_id as string);
  const { data, error } = await q;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/** POST /bets — create a new bet challenge */
router.post("/", requireAuth, async (req, res) => {
  const { match_id, creator_side, amount_usdc, counterparty_wallet, expires_at } = req.body;

  if (!match_id || !creator_side || !amount_usdc) {
    res.status(400).json({ error: "match_id, creator_side, and amount_usdc are required" });
    return;
  }
  if (!["home", "away", "draw"].includes(creator_side)) {
    res.status(400).json({ error: "creator_side must be home, away, or draw" });
    return;
  }
  if (amount_usdc < 1) {
    res.status(400).json({ error: "Minimum bet is 1 USDC" });
    return;
  }

  // Verify match exists and hasn't started
  const { data: match } = await db.from("matches").select("id,kickoff_at,status").eq("id", match_id).single();
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.status !== "scheduled") { res.status(400).json({ error: "Match has already started or finished" }); return; }

  // Get creator's user ID
  const { data: creator } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  if (!creator) { res.status(404).json({ error: "User not registered. POST /users first." }); return; }

  // Resolve optional counterparty
  let counterparty_id: string | null = null;
  if (counterparty_wallet) {
    const { data: cp } = await db.from("users").select("id").eq("wallet_address", counterparty_wallet).single();
    if (!cp) { res.status(404).json({ error: "Counterparty wallet not registered" }); return; }
    counterparty_id = cp.id;
  }

  const { data, error } = await db.from("bets").insert({
    match_id,
    creator_id: creator.id,
    counterparty_id,
    creator_side,
    amount_usdc,
    status: "challenged",
    expires_at: expires_at ?? new Date(new Date(match.kickoff_at).getTime() - 5 * 60000).toISOString(),
  }).select(`
    *,
    match:matches(id,home_team,away_team,kickoff_at),
    creator:users!bets_creator_id_fkey(id,display_name,wallet_address)
  `).single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

/** PATCH /bets/:id/accept — counterparty accepts a challenged bet */
router.patch("/:id/accept", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { accept_tx } = req.body;

  const { data: bet } = await db.from("bets").select("*").eq("id", id).single();
  if (!bet) { res.status(404).json({ error: "Bet not found" }); return; }
  if (bet.status !== "challenged") { res.status(400).json({ error: `Cannot accept a bet with status: ${bet.status}` }); return; }

  const { data: user } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  if (!user) { res.status(404).json({ error: "User not registered" }); return; }
  if (user.id === bet.creator_id) { res.status(400).json({ error: "Cannot accept your own bet" }); return; }
  if (bet.counterparty_id && bet.counterparty_id !== user.id) {
    res.status(403).json({ error: "This bet was sent to a specific counterparty" }); return;
  }

  const { data, error } = await db.from("bets").update({
    counterparty_id: user.id,
    status: "locked",
    accept_tx: accept_tx ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/** PATCH /bets/:id/cancel — creator cancels a challenged bet */
router.patch("/:id/cancel", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { data: bet } = await db.from("bets").select("*").eq("id", id).single();
  if (!bet) { res.status(404).json({ error: "Bet not found" }); return; }

  const { data: user } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  if (!user || user.id !== bet.creator_id) { res.status(403).json({ error: "Only the creator can cancel" }); return; }
  if (!["challenged", "countered"].includes(bet.status)) {
    res.status(400).json({ error: "Can only cancel challenged or countered bets" }); return;
  }

  const { data, error } = await db.from("bets")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/** POST /bets/:id/settle — settle after match (called by keeper/cron) */
router.post("/:id/settle", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { settle_tx, winner_wallet, merkle_proof } = req.body;

  const { data: bet } = await db.from("bets").select("*, match:matches(result)").eq("id", id).single();
  if (!bet) { res.status(404).json({ error: "Bet not found" }); return; }
  if (bet.status !== "locked" && bet.status !== "live") {
    res.status(400).json({ error: "Bet must be locked or live to settle" }); return;
  }

  // Only a participant (creator or counterparty) can settle their own bet
  const { data: caller } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  const isParticipant = caller && (caller.id === bet.creator_id || caller.id === bet.counterparty_id);
  if (!isParticipant) { res.status(403).json({ error: "Only a bet participant can settle this bet" }); return; }

  let winner_id: string | null = null;
  if (winner_wallet) {
    const { data: w } = await db.from("users").select("id").eq("wallet_address", winner_wallet).single();
    winner_id = w?.id ?? null;
  }

  // Update bet
  await db.from("bets").update({
    status: "settled", settle_tx, winner_id,
    settled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  // Store merkle proof on match if provided
  if (merkle_proof) {
    await db.from("matches").update({ merkle_proof, merkle_stored_at: new Date().toISOString() }).eq("id", bet.match_id);
  }

  // Update streaks + win/loss record
  if (winner_id) {
    const loserId = winner_id === bet.creator_id ? bet.counterparty_id : bet.creator_id;
    await Promise.all([
      db.from("users").update({ streak: db.rpc as any, total_wins: 1 }).eq("id", winner_id),
      // Raw increment via rpc
      db.rpc("increment_streak_win", { user_id: winner_id }),
      db.rpc("reset_streak_loss",    { user_id: loserId }),
    ]);
  }

  res.json({ settled: true, winner_id, bet_id: id });
});

export { router as betsRouter };
