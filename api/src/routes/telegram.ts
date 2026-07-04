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
  res.sendStatus(200); // acknowledge immediately

  const update = req.body;
  const msg    = update.message ?? update.edited_message;
  if (!msg?.text) return;

  const chatId  = msg.chat.id;
  const fromId  = msg.from?.id;
  const handle  = msg.from?.username;
  const text    = msg.text.trim();
  const parts   = text.split(/\s+/);
  const command = parts[0].toLowerCase().split("@")[0]; // strip @BotName suffix

  // helper: side code -> team name
  const teamName = (side: string, homeTeam: string, awayTeam: string) =>
    side === "home" ? homeTeam : side === "away" ? awayTeam : "Draw";

  // ── /start ──────────────────────────────────────────────────────────────────
  if (command === "/start") {
    await tgSend(chatId,
      "hey! i'm Stakely \u{1F44B}\n\n" +
      "bet on World Cup matches with your friends. pick a team, put in USDC, winner takes the pot.\n\n" +
      "to get started:\n" +
      "1. open the Stakely app\n" +
      "2. tap Settings > Link Telegram\n" +
      "3. come back here and send me that code\n\n" +
      "once you're linked:\n" +
      "/scores — see live match scores\n" +
      "/bets — see bets you can jump on\n" +
      "/mybets — see your own active bets"
    );
    return;
  }

  // ── /link <code> ────────────────────────────────────────────────────────────
  if (command === "/link") {
    const code = parts[1];
    if (!code) {
      await tgSend(chatId, "to link your wallet:\n1. open the Stakely app\n2. tap Settings > Link Telegram\n3. send me: /link <your code>\n\nthe code expires in 10 minutes");
      return;
    }

    const { data: linkCode } = await db.from("telegram_link_codes")
      .select("*").eq("code", code.toUpperCase())
      .is("used_at", null).gt("expires_at", new Date().toISOString()).single();

    if (!linkCode) {
      await tgSend(chatId, "that code didn't work — it may have expired (10 min limit) or already been used. get a fresh one from the app.");
      return;
    }

    await db.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code.toUpperCase());

    const { data: user, error } = await db.from("users")
      .update({ telegram_id: fromId, telegram_handle: handle ?? null })
      .eq("wallet_address", linkCode.wallet_address)
      .select().single();

    if (error || !user) {
      await tgSend(chatId, "code worked but your wallet wasn't found. make sure you've opened the app and signed in at least once first.");
      return;
    }

    await tgSend(chatId, "linked \u2705 you're all set, " + (user.display_name ?? handle ?? "anon") + "\n\nyou'll get pinged here when:\n- someone accepts your bet\n- a match you bet on goes live\n- your bet settles\n\ntype /bets to see what's open");
    return;
  }

  // ── /scores ─────────────────────────────────────────────────────────────────
  if (command === "/scores") {
    const { data: liveMatches } = await db.from("matches")
      .select("id,home_team,away_team,home_score,away_score")
      .in("status", ["live", "halftime"])
      .order("kickoff_at", { ascending: true });

    if (!liveMatches?.length) {
      await tgSend(chatId, "no games live right now. check back when a match kicks off.");
      return;
    }

    const lines = await Promise.all(liveMatches.map(async (m) => {
      try {
        const s = await txline.getScore(m.id);
        return m.home_team + " " + s.homeScore + "\u2013" + s.awayScore + " " + m.away_team + (s.minute ? " (" + s.minute + "')" : "");
      } catch {
        return m.home_team + " " + (m.home_score ?? 0) + "\u2013" + (m.away_score ?? 0) + " " + m.away_team;
      }
    }));
    await tgSend(chatId, "live scores:\n\n" + lines.join("\n"));
    return;
  }

  // ── /bets — open challenges anyone can accept (no login needed) ─────────────
  if (command === "/bets") {
    const { data: bets } = await db.from("bets")
      .select("amount_usdc, creator_side, match:matches(home_team,away_team), creator:users!bets_creator_id_fkey(display_name)")
      .eq("status", "challenged")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!bets?.length) {
      await tgSend(chatId, "no open bets right now.\n\nbe the first — open the app and challenge someone.");
      return;
    }

    const lines = bets.map(b => {
      const m    = b.match as any;
      const name = (b.creator as any)?.display_name ?? "anon";
      const team = teamName(b.creator_side, m?.home_team, m?.away_team);
      return name + " is betting " + b.amount_usdc + " USDC on " + team + " \u2014 open the app to take it";
    }).join("\n\n");

    await tgSend(chatId, "open bets:\n\n" + lines);
    return;
  }

  // ── /mybets — your personal active bets ─────────────────────────────────────
  if (command === "/mybets") {
    const { data: user } = await db.from("users").select("id").eq("telegram_id", fromId).single();
    if (!user) {
      await tgSend(chatId, "you haven't linked your wallet yet.\n\nopen the app > Settings > Link Telegram, then send me /link <code>");
      return;
    }

    const { data: bets } = await db.from("bets")
      .select("status, amount_usdc, creator_side, creator_id, match:matches(home_team,away_team,status), counterparty:users!bets_counterparty_id_fkey(display_name)")
      .or("creator_id.eq." + user.id + ",counterparty_id.eq." + user.id)
      .in("status", ["challenged", "locked", "live"])
      .order("created_at", { ascending: false })
      .limit(5);

    if (!bets?.length) {
      await tgSend(chatId, "you don't have any active bets.\n\ntype /bets to see what's open, or create one in the app.");
      return;
    }

    const lines = bets.map(b => {
      const m      = b.match as any;
      const cp     = (b.counterparty as any)?.display_name ?? "waiting for opponent";
      const team   = teamName(b.creator_side, m?.home_team, m?.away_team);
      const isCreator = b.creator_id === user.id;
      const emoji  = b.status === "challenged" ? "\u23F3" : b.status === "locked" ? "\u2694\uFE0F" : "\u{1F525}";
      const status = b.status === "challenged" ? "waiting for someone to accept" : "vs " + cp;
      return emoji + " " + b.amount_usdc + " USDC on " + team + " (" + m?.home_team + " vs " + m?.away_team + ") \u2014 " + status;
    }).join("\n\n");

    await tgSend(chatId, "your bets:\n\n" + lines);
    return;
  }
});


export { router as telegramRouter };
