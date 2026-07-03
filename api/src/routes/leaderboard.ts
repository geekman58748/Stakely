import { Router } from "express";
import { db } from "../lib/supabase.js";

const router = Router();

/** GET /leaderboard — top 50 by streak */
router.get("/", async (_req, res) => {
  const { data, error } = await db.from("leaderboard").select("*");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/** GET /leaderboard/:wallet — rank for a specific wallet */
router.get("/:wallet", async (req, res) => {
  const { data: user } = await db.from("users").select("id,streak,total_wins,total_losses,display_name").eq("wallet_address", req.params.wallet).single();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Count users with higher streak
  const { count } = await db.from("users").select("*", { count: "exact", head: true }).gt("streak", user.streak);
  res.json({ ...user, rank: (count ?? 0) + 1 });
});

export { router as leaderboardRouter };
