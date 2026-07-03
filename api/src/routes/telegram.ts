import { Router } from "express";
import { db } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyLinkSuccess, notifyChallengeSent } from "../lib/telegram.js";

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
  res.json({
    code,
    expires_in_seconds: 600,
    instructions: `Open Telegram and send this to @StakelyBot:\n\n/link ${code}`,
  });
});

/** POST /telegram/verify — called by webhook bot to complete wallet linking */
router.post("/verify", async (req, res) => {
  const { code, telegram_id, telegram_handle, display_name } = req.body;
  if (!code || !telegram_id) { res.status(400).json({ error: "code and telegram_id required" }); return; }

  const { data: linkCode } = await db.from("telegram_link_codes")
    .select("*").eq("code", code.toUpperCase())
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!linkCode) { res.status(400).json({ error: "Invalid or expired code" }); return; }

  await db.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code.toUpperCase());

  const { data, error } = await db.from("users")
    .update({ telegram_id: parseInt(telegram_id), telegram_handle: telegram_handle ?? null })
    .eq("wallet_address", linkCode.wallet_address)
    .select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Fire-and-forget welcome ping
  notifyLinkSuccess(parseInt(telegram_id), data?.display_name ?? telegram_handle ?? "anon");

  res.json({ linked: true, user: data });
});

/** GET /telegram/user/:telegramId — look up user by Telegram ID */
router.get("/user/:telegramId", async (req, res) => {
  const { data, error } = await db.from("users")
    .select("id, wallet_address, display_name, streak, total_wins, total_losses")
    .eq("telegram_id", parseInt(req.params.telegramId))
    .single();

  if (error || !data) { res.status(404).json({ error: "Telegram ID not linked" }); return; }
  res.json(data);
});

/** POST /telegram/webhook — Telegram Bot API webhook handler */
router.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately

  const update = req.body;
  const msg = update.message ?? update.edited_message;
  if (!msg?.text) return;

  const chatId   = msg.chat.id;
  const fromId   = msg.from?.id;
  const handle   = msg.from?.username;
  const text     = msg.text.trim();
  const parts    = text.split(/\s+/);
  const command  = parts[0].toLowerCase();

  const BASE_API = process.env.INTERNAL_API_URL ?? "http://localhost:4000";

  // ── /start ─────────────────────────────────────────────────────────────────
  if (command === "/start") {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "stakely.\n\np2p bets on World Cup matches, settled on Solana.\n\nto get started:\n1. open the app and go to Settings\n2. tap 'Link Telegram'\n3. send me /link <code>\n\nthat's it. u'll get pinged here for bets, scores, settlements.",
      }),
    });
    return;
  }

  // ── /link <code> ────────────────────────────────────────────────────────────
  if (command === "/link") {
    const code = parts[1];
    if (!code) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "usage: /link <code>\n\nget ur code from the app → Settings → Link Telegram" }),
      });
      return;
    }

    const verifyRes = await fetch(`${BASE_API}/api/telegram/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, telegram_id: fromId, telegram_handle: handle }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json() as any;
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: `couldn't link: ${err.error ?? "invalid code"}` }),
      });
    }
    // Success message sent by notifyLinkSuccess inside /verify
    return;
  }

  // ── /scores ─────────────────────────────────────────────────────────────────
  if (command === "/scores") {
    const scoresRes = await fetch(`${BASE_API}/api/matches/live`);
    const scores = await scoresRes.json() as any[];

    if (!scores.length) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "no live matches rn. check back when a game's on" }),
      });
      return;
    }

    const lines = scores.map((s: any) =>
      `${s.homeTeam ?? "?"} ${s.homeScore ?? 0}–${s.awayScore ?? 0} ${s.awayTeam ?? "?"} (${s.minute ?? "?"}')`)
      .join("\n");

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `live scores:\n\n${lines}` }),
    });
    return;
  }

  // ── /bets ───────────────────────────────────────────────────────────────────
  if (command === "/bets") {
    const userRes = await fetch(`${BASE_API}/api/telegram/user/${fromId}`);
    if (!userRes.ok) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "ur wallet isn't linked yet. send /link <code> first" }),
      });
      return;
    }

    const openRes = await fetch(`${BASE_API}/api/bets/open`);
    const bets = await openRes.json() as any[];

    if (!bets.length) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "no open bets right now. be the one who creates one" }),
      });
      return;
    }

    const lines = bets.slice(0, 5).map((b: any) =>
      `${b.creator?.display_name ?? "anon"} — ${b.amount_usdc} USDC on ${b.creator_side} (${b.match?.home_team} vs ${b.match?.away_team})`)
      .join("\n");

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `open bets:\n\n${lines}\n\ngo to the app to accept` }),
    });
    return;
  }
});

export { router as telegramRouter };
