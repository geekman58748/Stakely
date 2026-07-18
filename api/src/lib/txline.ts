/**
 * TxLINE client with mock fallback.
 *
 * Auth: every request needs TWO headers per the TxLINE API docs:
 *   Authorization: Bearer <guest_jwt>  — refreshed from /auth/guest/start (30-day TTL)
 *   X-Api-Token: <apiToken>            — long-lived token from /api/token/activate
 *
 * Real endpoints (OpenAPI verified):
 *   GET /api/fixtures/snapshot
 *   GET /api/odds/snapshot/:fixtureId
 *   GET /api/scores/snapshot/:fixtureId
 *
 * Set TXLINE_USE_MOCK=true to use mock data.
 */

export interface Fixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode: string;
  awayTeamCode: string;
  kickoffAt: string;
  status: "scheduled" | "live" | "halftime" | "finished" | "postponed";
  competition: string;
  competitionId: number;
}

export interface Odds {
  fixtureId: string;
  homeOdds: number | null;
  awayOdds: number | null;
  drawOdds: number | null;
  timestamp: string;
}

export interface LiveScore {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  minute: number | null;
  status: string;
  merkleProof?: unknown; // raw TxLINE score payload — cryptographic receipt for settlement
}

// ── Mock data (realistic WC 2026 fixtures) ─────────────────────────────────────
const MOCK_FIXTURES: Fixture[] = [
  { id: "wc_001", homeTeam: "Brazil",   awayTeam: "Argentina", homeTeamCode: "BRA", awayTeamCode: "ARG", kickoffAt: new Date(Date.now() + 2*3600000).toISOString(),  status: "scheduled", competition: "FIFA World Cup 2026", competitionId: 500001 },
  { id: "wc_002", homeTeam: "France",   awayTeam: "England",   homeTeamCode: "FRA", awayTeamCode: "ENG", kickoffAt: new Date(Date.now() + 5*3600000).toISOString(),  status: "scheduled", competition: "FIFA World Cup 2026", competitionId: 500001 },
  { id: "wc_003", homeTeam: "Spain",    awayTeam: "Germany",   homeTeamCode: "ESP", awayTeamCode: "GER", kickoffAt: new Date(Date.now() + 24*3600000).toISOString(), status: "scheduled", competition: "FIFA World Cup 2026", competitionId: 500001 },
  { id: "wc_004", homeTeam: "Portugal", awayTeam: "Morocco",   homeTeamCode: "POR", awayTeamCode: "MAR", kickoffAt: new Date(Date.now() - 1*3600000).toISOString(),  status: "live",      competition: "FIFA World Cup 2026", competitionId: 500001 },
  { id: "wc_005", homeTeam: "Japan",    awayTeam: "USA",       homeTeamCode: "JPN", awayTeamCode: "USA", kickoffAt: new Date(Date.now() - 5*3600000).toISOString(),  status: "finished",  competition: "FIFA World Cup 2026", competitionId: 500001 },
];

// ── Real client ────────────────────────────────────────────────────────────────
class TxLineRealClient {
  private readonly apiOrigin: string;
  private guestJwt: string | null = null;
  private jwtExpiresAt: number = 0;
  private participant1IsHome = new Map<string, boolean>();

  constructor() {
    const network = process.env.TXLINE_NETWORK ?? "devnet";
    this.apiOrigin = network === "mainnet"
      ? "https://txline.txodds.com"
      : "https://txline-dev.txodds.com";
    console.log(`[txline] real client → ${this.apiOrigin}`);
  }

  /** Fetch or return cached guest JWT (refreshes ~1 day before expiry) */
  private async jwt(): Promise<string> {
    if (this.guestJwt && Date.now() < this.jwtExpiresAt - 86_400_000) {
      return this.guestJwt;
    }
    const res = await fetch(`${this.apiOrigin}/auth/guest/start`, {
      method: "POST",
      headers: { "X-Api-Token": process.env.TXLINE_API_TOKEN! },
    });
    if (!res.ok) throw new Error(`Failed to obtain guest JWT: ${res.status}`);
    const data = await res.json() as { token: string };
    this.guestJwt    = data.token;
    this.jwtExpiresAt = Date.now() + 30 * 24 * 3600_000; // 30-day TTL per docs
    return this.guestJwt;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.apiOrigin}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const jwt = await this.jwt();
    const res = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "X-Api-Token":   process.env.TXLINE_API_TOKEN!,
        "Accept":        "application/json",
      },
    });
    if (!res.ok) throw new Error(`TxLINE ${path} → ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async getFixtures(competitionId?: number): Promise<Fixture[]> {
    const params = competitionId ? { competitionId: String(competitionId) } : undefined;
    const response = await this.get<any>("/api/fixtures/snapshot", params);
    const raw = normalizeRecords(response);
    return raw.map(f => {
      const id = String(f.FixtureId ?? f.fixtureId);
      const participant1IsHome = f.Participant1IsHome ?? f.participant1IsHome ?? true;
      this.participant1IsHome.set(id, Boolean(participant1IsHome));
      return {
      id,
      homeTeam:      participant1IsHome ? f.Participant1 : f.Participant2,
      awayTeam:      participant1IsHome ? f.Participant2 : f.Participant1,
      homeTeamCode:  participant1IsHome ? String(f.Participant1Code ?? f.Participant1Id ?? "") : String(f.Participant2Code ?? f.Participant2Id ?? ""),
      awayTeamCode:  participant1IsHome ? String(f.Participant2Code ?? f.Participant2Id ?? "") : String(f.Participant1Code ?? f.Participant1Id ?? ""),
      kickoffAt:     new Date(f.StartTime).toISOString(),
      status:        mapFixtureStatus(f),
      competition:   f.Competition ?? "Unknown",
      competitionId: f.CompetitionId ?? 0,
      };
    });
  }

  async getOdds(fixtureId: string): Promise<Odds> {
    const response = await this.get<any>(`/api/odds/snapshot/${fixtureId}`);
    const records = normalizeRecords(response);
    const raw = records.at(-1) ?? response;
    return {
      fixtureId,
      homeOdds: raw.HomeOdds  ?? raw.home_odds  ?? null,
      awayOdds: raw.AwayOdds  ?? raw.away_odds  ?? null,
      drawOdds: raw.DrawOdds  ?? raw.draw_odds  ?? null,
      timestamp: new Date(raw.Ts ?? Date.now()).toISOString(),
    };
  }

  async getLiveScores(): Promise<LiveScore[]> {
    const now = Date.now();
    const fixtures = await this.getFixtures();
    const candidates = fixtures.filter(fixture => {
      const kickoff = new Date(fixture.kickoffAt).getTime();
      return ["live", "halftime"].includes(fixture.status)
        || (kickoff <= now + 30 * 60_000 && kickoff >= now - 4 * 60 * 60_000);
    });
    const scores = await Promise.allSettled(candidates.map(fixture => this.getScore(fixture.id)));
    return scores
      .filter((result): result is PromiseFulfilledResult<LiveScore> => result.status === "fulfilled")
      .map(result => result.value)
      .filter(score => ["live", "halftime"].includes(score.status));
  }

  async getScore(fixtureId: string): Promise<LiveScore> {
    const response = await this.get<any>(`/api/scores/snapshot/${fixtureId}`);
    const records = normalizeRecords(response);
    const latest = records.at(-1) ?? response;
    const statValues = new Map<number, number>();
    for (const record of records) {
      const key = Number(record.StatKey ?? record.statKey ?? record.Key ?? record.key);
      const value = Number(record.StatValue ?? record.statValue ?? record.Value ?? record.value);
      if (Number.isFinite(key) && Number.isFinite(value)) statValues.set(key, value);
    }
    const participant1Goals = firstNumber(
      statValues.get(1), latest.Participant1Goals, latest.participant1Goals, latest.HomeScore,
    );
    const participant2Goals = firstNumber(
      statValues.get(2), latest.Participant2Goals, latest.participant2Goals, latest.AwayScore,
    );
    const participant1IsHome = this.participant1IsHome.get(fixtureId) ?? true;
    const status = mapScoreStatus(latest);
    return {
      fixtureId,
      homeScore:   participant1IsHome ? participant1Goals : participant2Goals,
      awayScore:   participant1IsHome ? participant2Goals : participant1Goals,
      minute:      firstNumberOrNull(latest.Minute, latest.minute, latest.MatchMinute),
      status,
      merkleProof: {
        fixtureId,
        seq: latest.Seq ?? latest.seq ?? null,
        participant1IsHome,
        snapshot: records,
      },
    };
  }

  async getSettlementProof(fixtureId: string, seq: number): Promise<unknown> {
    if (!Number.isInteger(seq) || seq <= 0) throw new Error("A real TxLINE score sequence is required");
    return this.get("/api/scores/stat-validation", {
      fixtureId,
      seq: String(seq),
      statKeys: "1,2",
    });
  }
}

function normalizeRecords(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "records", "items", "snapshot", "result"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return payload ? [payload] : [];
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function firstNumberOrNull(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function mapFixtureStatus(fixture: any): Fixture["status"] {
  const value = String(fixture.GameState ?? fixture.Status ?? fixture.FixtureStatus ?? "").toLowerCase();
  if (value.includes("postpon") || value.includes("cancel")) return "postponed";
  if (value.includes("finish") || value.includes("final") || value === "ft") return "finished";
  if (value.includes("half")) return "halftime";
  if (value.includes("live") || value.includes("progress") || value.includes("playing")) return "live";
  return "scheduled";
}

function mapScoreStatus(score: any): LiveScore["status"] {
  const action = String(score.Action ?? score.action ?? "").toLowerCase();
  const value = String(score.GamePhase ?? score.gamePhase ?? score.Status ?? score.status ?? "").toLowerCase();
  const period = Number(score.Period ?? score.period);
  if (action === "game_finalised" || value.includes("finish") || value === "ft" || period === 100) return "finished";
  if (value.includes("half")) return "halftime";
  if (value.includes("live") || value.includes("progress") || Number.isFinite(period)) return "live";
  return "scheduled";
}

// ── Mock client ────────────────────────────────────────────────────────────────
class TxLineMockClient {
  async getFixtures(): Promise<Fixture[]> { return MOCK_FIXTURES; }
  async getOdds(id: string): Promise<Odds> {
    const map: Record<string, Odds> = {
      wc_001: { fixtureId: "wc_001", homeOdds: 2.10, awayOdds: 3.40, drawOdds: 3.20, timestamp: new Date().toISOString() },
      wc_002: { fixtureId: "wc_002", homeOdds: 2.50, awayOdds: 2.80, drawOdds: 3.10, timestamp: new Date().toISOString() },
      wc_003: { fixtureId: "wc_003", homeOdds: 2.20, awayOdds: 3.10, drawOdds: 3.30, timestamp: new Date().toISOString() },
      wc_004: { fixtureId: "wc_004", homeOdds: 1.80, awayOdds: 4.50, drawOdds: 3.60, timestamp: new Date().toISOString() },
      wc_005: { fixtureId: "wc_005", homeOdds: 3.20, awayOdds: 2.10, drawOdds: 3.40, timestamp: new Date().toISOString() },
    };
    return map[id] ?? { fixtureId: id, homeOdds: 2.0, awayOdds: 3.5, drawOdds: 3.2, timestamp: new Date().toISOString() };
  }
  async getLiveScores(): Promise<LiveScore[]> {
    return MOCK_FIXTURES.filter(f => f.status === "live").map(f => ({
      fixtureId: f.id, homeScore: 1, awayScore: 0, minute: 67, status: "live",
    }));
  }
  async getScore(id: string): Promise<LiveScore> {
    const f = MOCK_FIXTURES.find(x => x.id === id);
    const finished = f?.status === "finished";
    return {
      fixtureId: id,
      homeScore: finished ? 2 : 1,
      awayScore: 1,
      minute:    f?.status === "live" ? 67 : null,
      status:    f?.status ?? "scheduled",
      merkleProof: finished ? { fixtureId: id, merkleRoot: `mock_root_${id}`, signature: `mock_sig_${Date.now()}`, ts: new Date().toISOString() } : undefined,
    };
  }
}

const useMock = process.env.TXLINE_USE_MOCK === "true" || !process.env.TXLINE_API_TOKEN;
export const txline = useMock ? new TxLineMockClient() : new TxLineRealClient();
export const txlineMode = useMock ? "mock" : "real";
console.log(`[txline] using ${useMock ? "MOCK" : "REAL"} client`);
