import { Router } from "express";
import { db } from "../lib/supabase.js";
import { txline } from "../lib/txline.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const ARCHETYPES = {
  degenerate: {
    systemPrompt: "You are THE DEGENERATE — an aggressive sports bettor who loves long shots and high-risk plays. You live for upsets and underdog glory. Your analysis is chaotic but sometimes brilliant.",
    disclaimer: "⚠️ This is not financial advice. THE DEGENERATE has no chill and even less filter.",
  },
  professor: {
    systemPrompt: "You are THE PROFESSOR — a calm, quantitative analyst. You rely on historical data, head-to-head records, and statistical models. You are precise and unemotional.",
    disclaimer: "📊 This analysis is data-driven but not investment advice. Past performance ≠ future results.",
  },
  fanboy: {
    systemPrompt: "You are THE FANBOY — you have deep emotional attachment to historic football powerhouses. You interpret every sign as destiny for your beloved teams. Your analysis is passionate and colorful.",
    disclaimer: "❤️ The Fanboy's heart sometimes overrides the numbers. Take with a grain of salt.",
  },
};

/** GET /bots/config — get current user's bot config */
router.get("/config", requireAuth, async (req, res) => {
  const { data: user } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  if (!user) { res.status(404).json({ error: "User not registered" }); return; }

  const { data } = await db.from("bot_configs").select("*").eq("user_id", user.id).single();
  res.json(data ?? null);
});

/** PUT /bots/config — upsert bot config */
router.put("/config", requireAuth, async (req, res) => {
  const { data: user } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  if (!user) { res.status(404).json({ error: "User not registered" }); return; }

  const { archetype, risk_level, use_head_to_head, use_form_table, use_odds_movement, use_sentiment, weight_data, weight_hype } = req.body;

  const { data, error } = await db.from("bot_configs").upsert({
    user_id: user.id,
    archetype:        archetype        ?? "professor",
    risk_level:       risk_level       ?? 5,
    use_head_to_head: use_head_to_head ?? true,
    use_form_table:   use_form_table   ?? true,
    use_odds_movement: use_odds_movement ?? true,
    use_sentiment:    use_sentiment    ?? false,
    weight_data:      weight_data      ?? 0.7,
    weight_hype:      weight_hype      ?? 0.3,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" }).select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/** POST /bots/predict/:matchId — run AI prediction for a match */
router.post("/predict/:matchId", requireAuth, async (req, res) => {
  const { matchId } = req.params;

  const { data: user } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  if (!user) { res.status(404).json({ error: "User not registered" }); return; }

  const { data: config } = await db.from("bot_configs").select("*").eq("user_id", user.id).single();
  const archetype = (config?.archetype ?? "professor") as keyof typeof ARCHETYPES;
  const riskLevel = config?.risk_level ?? 5;

  // Fetch match + odds
  const [{ data: match }, odds] = await Promise.all([
    db.from("matches").select("*").eq("id", matchId).single(),
    txline.getOdds(String(matchId)).catch(() => null),
  ]);
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }

  const { systemPrompt, disclaimer } = ARCHETYPES[archetype];
  const matchContext = `Match: ${match.home_team} vs ${match.away_team} | Kickoff: ${match.kickoff_at} | Odds: Home ${odds?.homeOdds ?? "?"}, Draw ${odds?.drawOdds ?? "?"}, Away ${odds?.awayOdds ?? "?"} | Risk level: ${riskLevel}/10`;

  // Call Anthropic via Replit AI proxy
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  let analysis = "";
  let prediction: "home" | "away" | "draw" = "draw";
  let confidence = 50;

  if (anthropicKey) {
    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 400,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: `Analyze this World Cup match and give me your prediction. ${matchContext}\n\nRespond ONLY in this exact JSON format:\n{"prediction":"home|away|draw","confidence":0-100,"analysis":"2-3 sentence analysis"}`
          }]
        })
      });
      const aiData = await aiRes.json() as any;
      const raw = aiData.content?.[0]?.text ?? "";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      prediction = parsed.prediction ?? "draw";
      confidence = parsed.confidence ?? 50;
      analysis   = parsed.analysis ?? "Insufficient data for analysis.";
    } catch {
      analysis = `${archetype === "degenerate" ? "Trust the chaos — go with the underdog!" : archetype === "professor" ? "Insufficient data. Recommend abstaining." : "My heart says bet on the fan favorite!"}`;
    }
  } else {
    // Fallback analysis without LLM
    analysis = `${match.home_team} vs ${match.away_team}: Based on current odds (Home ${odds?.homeOdds}, Draw ${odds?.drawOdds}, Away ${odds?.awayOdds}), risk level ${riskLevel}/10 suggests ${(odds?.homeOdds ?? 99) < (odds?.awayOdds ?? 99) ? match.home_team : match.away_team} as the value pick.`;
    prediction = (odds?.homeOdds ?? 2) < (odds?.awayOdds ?? 2) ? "home" : "away";
    confidence = 60 + riskLevel * 2;
  }

  // Store prediction
  const { data: stored } = await db.from("agent_predictions").insert({
    user_id: user.id,
    match_id: matchId,
    archetype,
    prediction,
    confidence,
    analysis,
    disclaimer,
  }).select().single();

  res.json({ prediction, confidence, analysis, disclaimer, id: stored?.id });
});

/** GET /bots/predictions — past predictions for current user */
router.get("/predictions", requireAuth, async (req, res) => {
  const { data: user } = await db.from("users").select("id").eq("wallet_address", req.walletAddress!).single();
  if (!user) { res.status(404).json({ error: "User not registered" }); return; }

  const { data, error } = await db.from("agent_predictions")
    .select("*, match:matches(home_team,away_team,kickoff_at,status,result)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export { router as botsRouter };
