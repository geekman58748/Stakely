/**
 * TxLINE client with mock fallback.
 * Set TXLINE_USE_MOCK=true to use mock data (dev/testing).
 * When real token is available, set TXLINE_USE_MOCK=false (or unset).
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
}

export interface LiveScore {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  minute: number | null;
  status: string;
}

export interface Odds {
  fixtureId: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number;
  timestamp: string;
}

// ── Mock data (realistic WC 2026 fixtures) ────────────────────────────────────
const MOCK_FIXTURES: Fixture[] = [
  { id: "wc_001", homeTeam: "Brazil",    awayTeam: "Argentina", homeTeamCode: "BRA", awayTeamCode: "ARG", kickoffAt: new Date(Date.now() + 2*3600000).toISOString(),  status: "scheduled", competition: "FIFA World Cup 2026" },
  { id: "wc_002", homeTeam: "France",    awayTeam: "England",   homeTeamCode: "FRA", awayTeamCode: "ENG", kickoffAt: new Date(Date.now() + 5*3600000).toISOString(),  status: "scheduled", competition: "FIFA World Cup 2026" },
  { id: "wc_003", homeTeam: "Spain",     awayTeam: "Germany",   homeTeamCode: "ESP", awayTeamCode: "GER", kickoffAt: new Date(Date.now() + 24*3600000).toISOString(), status: "scheduled", competition: "FIFA World Cup 2026" },
  { id: "wc_004", homeTeam: "Portugal",  awayTeam: "Morocco",   homeTeamCode: "POR", awayTeamCode: "MAR", kickoffAt: new Date(Date.now() - 1*3600000).toISOString(),  status: "live",      competition: "FIFA World Cup 2026" },
  { id: "wc_005", homeTeam: "Japan",     awayTeam: "USA",       homeTeamCode: "JPN", awayTeamCode: "USA", kickoffAt: new Date(Date.now() - 5*3600000).toISOString(),  status: "finished",  competition: "FIFA World Cup 2026" },
];

const MOCK_ODDS: Record<string, Odds> = {
  wc_001: { fixtureId: "wc_001", homeOdds: 2.10, awayOdds: 3.40, drawOdds: 3.20, timestamp: new Date().toISOString() },
  wc_002: { fixtureId: "wc_002", homeOdds: 2.50, awayOdds: 2.80, drawOdds: 3.10, timestamp: new Date().toISOString() },
  wc_003: { fixtureId: "wc_003", homeOdds: 2.20, awayOdds: 3.10, drawOdds: 3.30, timestamp: new Date().toISOString() },
  wc_004: { fixtureId: "wc_004", homeOdds: 1.80, awayOdds: 4.50, drawOdds: 3.60, timestamp: new Date().toISOString() },
  wc_005: { fixtureId: "wc_005", homeOdds: 3.20, awayOdds: 2.10, drawOdds: 3.40, timestamp: new Date().toISOString() },
};

// ── Real client ────────────────────────────────────────────────────────────────
class TxLineRealClient {
  private base: string;
  private token: string;

  constructor() {
    const origin = process.env.TXLINE_API_ORIGIN ?? "https://txline.txodds.com";
    this.base  = `${origin}/api`;
    this.token = process.env.TXLINE_API_TOKEN!;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`TxLINE ${path} → ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getFixtures(): Promise<Fixture[]>          { return this.get("/fixtures"); }
  async getOdds(id: string): Promise<Odds>         { return this.get(`/odds/${id}`); }
  async getLiveScores(): Promise<LiveScore[]>       { return this.get("/scores/live"); }
  async getScore(id: string): Promise<LiveScore>   { return this.get(`/scores/${id}`); }
}

// ── Mock client ────────────────────────────────────────────────────────────────
class TxLineMockClient {
  async getFixtures(): Promise<Fixture[]> { return MOCK_FIXTURES; }

  async getOdds(id: string): Promise<Odds> {
    return MOCK_ODDS[id] ?? { fixtureId: id, homeOdds: 2.0, awayOdds: 3.5, drawOdds: 3.2, timestamp: new Date().toISOString() };
  }

  async getLiveScores(): Promise<LiveScore[]> {
    return MOCK_FIXTURES.filter(f => f.status === "live").map(f => ({
      fixtureId: f.id, homeScore: 1, awayScore: 0, minute: 67, status: "live",
    }));
  }

  async getScore(id: string): Promise<LiveScore> {
    const f = MOCK_FIXTURES.find(x => x.id === id);
    return { fixtureId: id, homeScore: f?.status === "finished" ? 2 : 1, awayScore: 1, minute: f?.status === "live" ? 67 : null, status: f?.status ?? "scheduled" };
  }
}

const useMock = process.env.TXLINE_USE_MOCK === "true" || !process.env.TXLINE_API_TOKEN;
export const txline = useMock ? new TxLineMockClient() : new TxLineRealClient();
console.log(`[txline] using ${useMock ? "MOCK" : "REAL"} client`);
