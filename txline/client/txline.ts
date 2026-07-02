/**
 * TxLINE API Client
 * Plug-and-play wrapper for REST snapshots + SSE streams.
 * Import this into your Express server or Supabase Edge Function.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TxLineFixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode: string;
  awayTeamCode: string;
  kickoffAt: string;         // ISO 8601
  status: "scheduled" | "live" | "halftime" | "finished" | "postponed";
  competition: string;
}

export interface TxLineScore {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  minute: number | null;
  status: string;
  events: TxLineMatchEvent[];
  merkleProof?: TxLineMerkleProof;
}

export interface TxLineMatchEvent {
  type: "goal" | "red_card" | "yellow_card" | "kickoff" | "fulltime" | "halftime" | "substitution";
  minute: number;
  team: "home" | "away";
  player?: string;
  description?: string;
}

export interface TxLineOdds {
  fixtureId: string;
  homeOdds: number;     // decimal odds e.g. 2.10
  awayOdds: number;
  drawOdds: number;
  timestamp: string;
  isStable: boolean;    // StablePrice consensus flag
}

export interface TxLineMerkleProof {
  root: string;
  proof: string[];
  leaf: string;
  signature: string;    // cryptographic sig from TxLINE
}

export interface StreamEvent<T> {
  type: string;
  data: T;
  timestamp: string;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class TxLineClient {
  private readonly apiBase: string;
  private readonly token: string;

  constructor(token: string, opts?: { devnet?: boolean }) {
    const origin = opts?.devnet
      ? "https://txline-dev.txodds.com"
      : "https://txline.txodds.com";
    this.apiBase = `${origin}/api`;
    this.token   = token;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`TxLINE ${path} → ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  // ── REST Snapshots ─────────────────────────────────────────────────────────

  /** All World Cup fixtures (schedule) */
  async getFixtures(): Promise<TxLineFixture[]> {
    return this.get<TxLineFixture[]>("/fixtures");
  }

  /** Current score snapshot for a specific fixture */
  async getScore(fixtureId: string): Promise<TxLineScore> {
    return this.get<TxLineScore>(`/scores/${fixtureId}`);
  }

  /** All live scores snapshot */
  async getLiveScores(): Promise<TxLineScore[]> {
    return this.get<TxLineScore[]>("/scores/live");
  }

  /** Current odds snapshot for a fixture */
  async getOdds(fixtureId: string): Promise<TxLineOdds> {
    return this.get<TxLineOdds>(`/odds/${fixtureId}`);
  }

  /** All current odds snapshot */
  async getAllOdds(): Promise<TxLineOdds[]> {
    return this.get<TxLineOdds[]>("/odds");
  }

  // ── SSE Streams ────────────────────────────────────────────────────────────

  /**
   * Stream live score events for one or all fixtures.
   * Calls onEvent for each SSE message. Calls onError on connection failure.
   * Returns a cleanup function — call it to close the stream.
   *
   * Usage:
   *   const stop = txline.streamScores(null, (event) => {
   *     updateMatchInDB(event.data);
   *   });
   *   // later: stop();
   */
  streamScores(
    fixtureId: string | null,
    onEvent: (event: StreamEvent<TxLineScore>) => void,
    onError?: (err: Error) => void
  ): () => void {
    const path = fixtureId
      ? `${this.apiBase}/scores/${fixtureId}/stream`
      : `${this.apiBase}/scores/stream`;
    return this.openSSE(path, onEvent, onError);
  }

  /**
   * Stream live odds updates.
   */
  streamOdds(
    fixtureId: string | null,
    onEvent: (event: StreamEvent<TxLineOdds>) => void,
    onError?: (err: Error) => void
  ): () => void {
    const path = fixtureId
      ? `${this.apiBase}/odds/${fixtureId}/stream`
      : `${this.apiBase}/odds/stream`;
    return this.openSSE(path, onEvent, onError);
  }

  // ── Internal SSE handler ───────────────────────────────────────────────────

  private openSSE<T>(
    url: string,
    onEvent: (event: StreamEvent<T>) => void,
    onError?: (err: Error) => void
  ): () => void {
    let closed = false;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (closed) return;

      // EventSource doesn't support custom headers — use fetch + ReadableStream
      const controller = new AbortController();

      fetch(url, {
        headers: { ...this.headers(), Accept: "text/event-stream" },
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!closed) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let eventType = "message";
            let dataLines: string[] = [];

            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
              } else if (line === "" && dataLines.length > 0) {
                try {
                  const parsed = JSON.parse(dataLines.join("\n")) as T;
                  onEvent({ type: eventType, data: parsed, timestamp: new Date().toISOString() });
                } catch {
                  // skip malformed SSE frame
                }
                dataLines = [];
                eventType = "message";
              }
            }
          }
        })
        .catch((err) => {
          if (closed) return;
          onError?.(err instanceof Error ? err : new Error(String(err)));
          // exponential backoff reconnect (max 30s)
          retryTimeout = setTimeout(connect, Math.min(30000, 3000));
        });

      return () => controller.abort();
    };

    const abort = connect();

    return () => {
      closed = true;
      clearTimeout(retryTimeout);
      abort?.();
    };
  }
}

// ── Singleton factory ────────────────────────────────────────────────────────

let _client: TxLineClient | null = null;

export function getTxLineClient(): TxLineClient {
  if (!_client) {
    const token = process.env.TXLINE_API_TOKEN;
    if (!token) throw new Error("TXLINE_API_TOKEN env var is not set");
    _client = new TxLineClient(token);
  }
  return _client;
}
