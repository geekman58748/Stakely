import { Router } from "express";
import { db } from "../lib/supabase.js";
import { txline } from "../lib/txline.js";

const router = Router();

/** Seed / refresh matches from TxLINE into Supabase */
async function syncFixtures() {
  const fixtures = await txline.getFixtures();
  // Guard: only accept fixtures with numeric IDs (real TxLINE IDs are numeric strings)
  // This prevents mock fixtures (wc_001 etc.) from ever entering the DB
  const realFixtures = fixtures.filter(f => /^\d+$/.test(f.id));
  if (realFixtures.length !== fixtures.length) {
    console.warn('[syncFixtures] filtered out', fixtures.length - realFixtures.length, 'non-numeric fixture IDs');
  }
  const rows = realFixtures.map(f => ({
    id: f.id,
    home_team: f.homeTeam,
    away_team: f.awayTeam,
    home_team_code: f.homeTeamCode,
    away_team_code: f.awayTeamCode,
    participant1_is_home: f.participant1IsHome,
    kickoff_at: f.kickoffAt,
    status: f.status,
  }));
  const { error } = await db.from("matches").upsert(rows, { onConflict: "id" });
  if (error) console.error("[syncFixtures]", error.message);
  return realFixtures.length;
}

/** GET /matches — list upcoming + live matches */
router.get("/", async (req, res) => {
  const { status, limit = "20" } = req.query;
  let q = db.from("matches").select("*").order("kickoff_at", { ascending: true }).limit(parseInt(limit as string));
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/** GET /matches/live — live matches with scores */
router.get("/live", async (_req, res) => {
  try {
    const scores = await txline.getLiveScores();
    // Also update Supabase in background
    scores.forEach(s => {
      db.from("matches").update({ home_score: s.homeScore, away_score: s.awayScore, status: s.status }).eq("id", s.fixtureId).then();
    });
    res.json(scores);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /matches/:id — single match with odds */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const [{ data: match, error }, oddsResult] = await Promise.all([
    db.from("matches").select("*").eq("id", id).single(),
    txline.getOdds(id).catch(() => null),
  ]);
  if (error || !match) { res.status(404).json({ error: "Match not found" }); return; }
  if (oddsResult) {
    // Update odds in background
    db.from("matches").update({ home_odds: oddsResult.homeOdds, away_odds: oddsResult.awayOdds, draw_odds: oddsResult.drawOdds }).eq("id", id).then();
  }
  res.json({ ...match, odds: oddsResult });
});

/** POST /matches/sync — admin: re-seed from TxLINE */
router.post("/sync", async (_req, res) => {
  try {
    const count = await syncFixtures();
    res.json({ synced: count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as matchesRouter, syncFixtures };
