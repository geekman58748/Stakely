import "dotenv/config";
import express from "express";
import cors from "cors";
import { matchesRouter, syncFixtures } from "./routes/matches.js";
import { usersRouter }     from "./routes/users.js";
import { betsRouter }      from "./routes/bets.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { botsRouter }      from "./routes/bots.js";
import { telegramRouter }  from "./routes/telegram.js";
import { registerWebhook } from "./lib/telegram.js";
import { startPoller }    from "./lib/poller.js";
import { txlineMode } from "./lib/txline.js";

const app  = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/matches",     matchesRouter);
app.use("/api/users",       usersRouter);
app.use("/api/bets",        betsRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/bots",        botsRouter);
app.use("/api/telegram",    telegramRouter);

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    txline: txlineMode,
    supabase: !!process.env.SUPABASE_URL,
    capabilities: {
      escrowVerification: true,
      contractVersion: "v1",
    },
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[stakely-api] listening on :${PORT}`);

  // Seed matches from TxLINE on startup
  try {
    const count = await syncFixtures();
    console.log(`[startup] synced ${count} fixtures from TxLINE`);
  } catch (e: any) {
    console.warn("[startup] fixture sync failed:", e.message);
  }

  // Start live match poller
  startPoller();

  // Register Telegram webhook (Railway sets RAILWAY_PUBLIC_DOMAIN)
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (domain) {
    await registerWebhook(`https://${domain}/api/telegram/webhook`).catch(() => null);
  }
});
