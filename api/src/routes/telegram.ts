import { Router } from "express";
import { db } from "../lib/supabase.js";
import { txline } from "../lib/txline.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyLinkSuccess } from "../lib/telegram.js";

const router = Router();
const TG = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

function generateCode(len = 6) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

async function tgSend(chatId: number | string, text: string) {
  await fetch(`${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => null);
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

/** POST /telegram/verify — called by webhook to complete wallet linking */
router.post("/verify", async (req, res) => {
  const { code, telegram_id, telegram_handle } = req.body;
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
  res.sendStatus(200); // Acknowledge immediately — Telegram needs this fast

  const update = req.body;
  const msg = update.message ?? update.edited_message;
  if (!msg?.text) return;

  const chatId  = msg.chat.id;
  const fromId  = msg.from?.id;
  const handle  = msg.from?.username;
  const text    = msg.text.trim();
  const parts   = text.split(/\s+/);
  const command = parts[0].toLowerCase();

  // ── /start ──────────────────────────────────────────────────────────────────
  if (command === "/start") {
    await tgSend(chatId, "stakely.\n\np2p bets on World Cup matches, settled on Solana.\n\nto get started:\n1. open the app and go to Settings\n2. tap 'Link Telegram'\n3. send me /link <code>\n\ncommands:\n/scores — live scores\n/bets — open challenges");
    return;
  }

  // ── /link <code> ────────────────────────────────────────────────────────────
  if (command === "/link") {
    const code = parts[1];
    if (!code) {
      await tgSend(chatId, "usage: /link <code>\n\nget ur code from the app → Settings → Link Telegram");
      return;
    }

    // Look up code directly in Supabase
    const { data: linkCode } = await db.from("telegram_link_codes")
      .select("*")
      .eq("code", code.toUpperCase())
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!linkCode) {
      await tgSend(chatId, "that code doesn't work. either it expired (10 min limit) or it's already been used. get a fresh one from the app");
      return;
    }

    // Mark used
    await db.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code.toUpperCase());

    // Link wallet to telegram
    const { data: user, error } = await db.from("users")
      .update({ telegram_id: fromId, telegram_handle: handle ?? null })
      .eq("wallet_address", linkCode.wallet_address)
      .select().single();

    if (error || !user) {
      await tgSend(chatId, "linked the code but couldn't find ur wallet in the app. make sure u signed in first");
      return;
    }

    await tgSend(chatId, `linked ✅ ${user.display_name ?? handle ?? "anon"} ur wallet is connected. u'll get pinged here for bets, scores, and settlements`);
    return;
  }

  // ── /scores ─────────────────────────────────────────────────────────────────
  if (command === "/scores") {
    try {
      const scores = await txline.getLiveScores();
      if (!scores.length) {
        await tgSend(chatId, "no live matches rn. check back when a game's on");
        return;
      }
      const lines = scores.map(s =>
        `${s.fixtureId} | ${s.homeScore}–${s.awayScore} (${s.minute ?? "?"}')`)
        .join("\n");
      await tgSend(chatId, `live scores:\n\n${lines}`);
    } catch {
      // Fall back to Supabase cached matches
      const { data } = await db.from("matches").select("home_team,away_team,home_score,away_score,status").eq("status", "live");
      if (!data?.length) { await tgSend(chatId, "no live matches rn"); return; }
      const lines = data.map(m => `${m.home_team} ${m.home_score ?? 0}–${m.away_score ?? 0} ${m.away_team}`).join("\n");
      await tgSend(chatId, `live scores:\n\n${lines}`);
    }
    return;
  }

  // ── /bets ───────────────────────────────────────────────────────────────────
  if (command === "/bets") {
    const { data: user } = await db.from("users").select("id").eq("telegram_id", fromId).single();
    if (!user) {
      await tgSend(chatId, "ur wallet isn't linked yet. send /link <code> first");
      return;
    }

    const { data: bets } = await db.from("bets")
      .select("*, match:matches(home_team,away_team), creator:users!bets_creator_id_fkey(display_name)")
      .eq("status", "challenged")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!bets?.length) {
      await tgSend(chatId, "no open bets right now. be the one who creates one");
      return;
    }

    const lines = bets.map(b =>
      `${(b.creator as any)?.display_name ?? "anon"} — ${b.amount_usdc} USDC on ${b.creator_side} (${(b.match as any)?.home_team} vs ${(b.match as any)?.away_team})`)
      .join("\n");
    await tgSend(chatId, `open bets:\n\n${lines}\n\nopen the app to accept`);
    return;
  }
});

export { router as telegramRouter };
