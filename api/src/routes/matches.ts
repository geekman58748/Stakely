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
    kickoff_at: f.kickoffAt,
    status: f.status,
  }));
  const { error } = await db.from("matches").upsert(rows, { onConflict: "id" });
  if (error) console.error("[syncFixtures]", error.message);

  // Backfill final scores for finished/past fixtures that still show 0-0.
  // syncFixtures() only writes schedule fields (no scores), so any match that
  // was already finished when seeded lands with home_score=0, away_score=0 and
  // is never touched again by the poller. Fetch real scores here to fix that.
  const pastIds = realFixtures
    .filter(f => f.status === "finished" || new Date(f.kickoffAt) < new Date())
    .map(f => f.id);

  if (pastIds.length) {
    const { data: zeroRows } = await db.from("matches")
      .select("id")
      .in("id", pastIds)
      .eq("home_score", 0)
      .eq("away_score", 0);

    if (zeroRows?.length) {
      console.log(`[syncFixtures] backfilling scores for ${zeroRows.length} finished 0-0 matches`);
      await Promise.allSettled(zeroRows.map(async (m) => {
        try {
          const score = await txline.getScore(m.id);
          if (score.homeScore !== 0 || score.awayScore !== 0) {
            await db.from("matches").update({
              home_score: score.homeScore,
              away_score: score.awayScore,
              status: score.status,
              updated_at: new Date().toISOString(),
            }).eq("id", m.id);
            console.log(`[syncFixtures] backfilled ${m.id}: ${score.homeScore}-${score.awayScore}`);
          }
        } catch (e: any) {
          console.warn(`[syncFixtures] score fetch failed for ${m.id}:`, e.message);
        }
      }));
    }
  }

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
