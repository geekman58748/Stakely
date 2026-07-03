import { Router } from "express";
import { db } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** POST /users — upsert user by wallet (called on first sign-in) */
router.post("/", requireAuth, async (req, res) => {
  const wallet = req.walletAddress!;
  const { display_name } = req.body;

  const { data, error } = await db.from("users").upsert(
    { wallet_address: wallet, display_name: display_name ?? null, updated_at: new Date().toISOString() },
    { onConflict: "wallet_address", ignoreDuplicates: false }
  ).select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/** GET /users/me — get current user by wallet */
router.get("/me", requireAuth, async (req, res) => {
  const { data, error } = await db.from("users")
    .select("*, bot_configs(*)")
    .eq("wallet_address", req.walletAddress!)
    .single();

  if (error || !data) { res.status(404).json({ error: "User not found" }); return; }
  res.json(data);
});

/** GET /users/:wallet — public profile */
router.get("/:wallet", async (req, res) => {
  const { data, error } = await db.from("users")
    .select("id, display_name, telegram_handle, streak, total_wins, total_losses, wallet_address")
    .eq("wallet_address", req.params.wallet)
    .single();

  if (error || !data) { res.status(404).json({ error: "User not found" }); return; }
  res.json(data);
});

/** PATCH /users/me — update display name */
router.patch("/me", requireAuth, async (req, res) => {
  const { display_name } = req.body;
  const { data, error } = await db.from("users")
    .update({ display_name, updated_at: new Date().toISOString() })
    .eq("wallet_address", req.walletAddress!)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export { router as usersRouter };
