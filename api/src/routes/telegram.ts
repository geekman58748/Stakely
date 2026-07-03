import { Router } from "express";
import { db } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function generateCode(len = 6) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

/** POST /telegram/link-code — generate a one-time code to link wallet↔Telegram */
router.post("/link-code", requireAuth, async (req, res) => {
  const code = generateCode();
  await db.from("telegram_link_codes").insert({
    code,
    wallet_address: req.walletAddress!,
    expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
  });
  res.json({ code, expires_in_seconds: 600, instructions: `Send /link ${code} to the Stakely Telegram bot` });
});

/** POST /telegram/verify — called by the Telegram bot to complete wallet linking */
router.post("/verify", async (req, res) => {
  const { code, telegram_id, telegram_handle } = req.body;
  if (!code || !telegram_id) { res.status(400).json({ error: "code and telegram_id required" }); return; }

  const { data: linkCode } = await db.from("telegram_link_codes")
    .select("*").eq("code", code.toUpperCase())
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!linkCode) { res.status(400).json({ error: "Invalid or expired code" }); return; }

  // Mark code as used
  await db.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code.toUpperCase());

  // Link wallet to telegram
  const { data, error } = await db.from("users")
    .update({ telegram_id: parseInt(telegram_id), telegram_handle: telegram_handle ?? null })
    .eq("wallet_address", linkCode.wallet_address)
    .select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ linked: true, user: data });
});

/** GET /telegram/user/:telegramId — look up user by Telegram ID (bot use) */
router.get("/user/:telegramId", async (req, res) => {
  const { data, error } = await db.from("users")
    .select("id, wallet_address, display_name, streak, total_wins, total_losses")
    .eq("telegram_id", parseInt(req.params.telegramId))
    .single();

  if (error || !data) { res.status(404).json({ error: "Telegram ID not linked to any wallet" }); return; }
  res.json(data);
});

export { router as telegramRouter };
