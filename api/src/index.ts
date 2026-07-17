import "dotenv/config";
import path from "path";
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


// Prevent unhandled rejections from killing the process
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
const app  = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────────────
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

// ── Web Frontend (hash-router SPA) ────────────────────────────────────────────
// Pre-built web SPA lives in api/web-dist/ (committed to repo).
// __dirname = api/dist at runtime → ../web-dist
const WEB_DIST = path.join(__dirname, "..", "web-dist");
app.use(express.static(WEB_DIST));
// SPA fallback — hash routes never hit the server, but serve index.html for /
app.use((_req, res) => {
  res.sendFile(path.join(WEB_DIST, "index.html"));
});

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[stakely-api] listening on :${PORT}`);

  try {
    const count = await syncFixtures();
    console.log(`[startup] synced ${count} fixtures from TxLINE`);
  } catch (e: any) {
    console.warn("[startup] fixture sync failed:", e.message);
  }

  startPoller();

  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (domain) {
    await registerWebhook(`https://${domain}/api/telegram/webhook`).catch(() => null);
  }
});
