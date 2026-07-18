"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const matches_js_1 = require("./routes/matches.js");
const users_js_1 = require("./routes/users.js");
const bets_js_1 = require("./routes/bets.js");
const leaderboard_js_1 = require("./routes/leaderboard.js");
const bots_js_1 = require("./routes/bots.js");
const telegram_js_1 = require("./routes/telegram.js");
const telegram_js_2 = require("./lib/telegram.js");
const poller_js_1 = require("./lib/poller.js");
const txline_js_1 = require("./lib/txline.js");
// Prevent unhandled rejections from killing the process
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT ?? 4000);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/matches", matches_js_1.matchesRouter);
app.use("/api/users", users_js_1.usersRouter);
app.use("/api/bets", bets_js_1.betsRouter);
app.use("/api/leaderboard", leaderboard_js_1.leaderboardRouter);
app.use("/api/bots", bots_js_1.botsRouter);
app.use("/api/telegram", telegram_js_1.telegramRouter);
// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        txline: txline_js_1.txlineMode,
        supabase: !!process.env.SUPABASE_URL,
        capabilities: {
            escrowVerification: true,
            contractVersion: "v1",
        },
    });
});
// ── Web Frontend (hash-router SPA) ────────────────────────────────────────────
// Pre-built web SPA lives in api/web-dist/ (committed to repo).
// Load index.html into memory at startup to avoid per-request fs calls.
const fs_1 = require("fs");
const WEB_DIST = path_1.default.join(__dirname, "..", "web-dist");
const INDEX_HTML_PATH = path_1.default.join(WEB_DIST, "index.html");
console.log(`[web] WEB_DIST=${WEB_DIST} exists=${(0, fs_1.existsSync)(WEB_DIST)} index=${(0, fs_1.existsSync)(INDEX_HTML_PATH)}`);
let indexHtml = "";
try {
    indexHtml = (0, fs_1.readFileSync)(INDEX_HTML_PATH, "utf8");
}
catch (e) {
    console.error("[web] Could not read index.html:", e.message);
}
app.use(express_1.default.static(WEB_DIST, { fallthrough: true }));
// SPA fallback — all non-API routes serve the cached index.html
app.use((_req, res) => {
    if (indexHtml) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(indexHtml);
    }
    else {
        res.status(503).send("Frontend build missing. Check api/web-dist/");
    }
});
// ── Express error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error("[express error]", err.message);
    res.status(500).json({ error: err.message });
});
// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`[stakely-api] listening on :${PORT}`);
    try {
        const count = await (0, matches_js_1.syncFixtures)();
        console.log(`[startup] synced ${count} fixtures from TxLINE`);
    }
    catch (e) {
        console.warn("[startup] fixture sync failed:", e.message);
    }
    (0, poller_js_1.startPoller)();
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (domain) {
        await (0, telegram_js_2.registerWebhook)(`https://${domain}/api/telegram/webhook`).catch(() => null);
    }
});
