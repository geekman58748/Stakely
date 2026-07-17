export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? "https://stakely-production.up.railway.app"
).replace(/\/$/, "");

export type BetSide = "home" | "draw" | "away";

export type Match = {
  id: string;
  home_team: string;
  away_team: string;
  home_team_code: string | null;
  away_team_code: string | null;
  kickoff_at: string;
  status: string;
  home_score: number;
  away_score: number;
  result: BetSide | null;
  home_odds: number | null;
  draw_odds: number | null;
  away_odds: number | null;
  merkle_proof: unknown | null;
  merkle_stored_at?: string | null;
  updated_at?: string;
  odds?: {
    homeOdds: number | null;
    drawOdds: number | null;
    awayOdds: number | null;
  } | null;
};

export type UserSummary = {
  id: string;
  display_name: string | null;
  wallet_address: string;
  streak: number;
};

export type Bet = {
  id: string;
  match_id: string;
  creator_id?: string;
  counterparty_id?: string | null;
  creator_side: BetSide;
  amount_usdc: number;
  status: string;
  escrow_pda: string | null;
  create_tx: string | null;
  accept_tx?: string | null;
  settle_tx?: string | null;
  winner_id?: string | null;
  expires_at?: string | null;
  settled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  creator: UserSummary;
  counterparty?: UserSummary | null;
  match?: Match;
};

export type LeaderboardEntry = {
  id: string;
  rank: number;
  display_name: string | null;
  telegram_handle: string | null;
  wallet_address: string;
  streak: number;
  total_wins: number;
  total_losses: number;
  win_pct: number;
};

export type Health = {
  ok: boolean;
  timestamp: string;
  txline: "real" | "mock";
  supabase: boolean;
  capabilities?: {
    escrowVerification?: boolean;
    contractVersion?: string;
  };
};

export type AuthHeaders = Record<
  "x-wallet-address" | "x-signature" | "x-timestamp",
  string
>;

type RequestOptions = RequestInit & { auth?: AuthHeaders };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth, headers, ...init } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...auth,
      ...headers,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload.error === "string"
      ? payload.error
      : `Stakely API returned ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export const stakelyApi = {
  health: (signal?: AbortSignal) => request<Health>("/api/health", { signal }),
  matches: (signal?: AbortSignal) => request<Match[]>("/api/matches?limit=100", { signal }),
  match: (id: string, signal?: AbortSignal) => request<Match>(`/api/matches/${encodeURIComponent(id)}`, { signal }),
  openBets: (matchId?: string, signal?: AbortSignal) => {
    const query = matchId ? `?match_id=${encodeURIComponent(matchId)}` : "";
    return request<Bet[]>(`/api/bets/open${query}`, { signal });
  },
  myBets: (auth: AuthHeaders, signal?: AbortSignal) => request<Bet[]>("/api/bets?role=mine", { auth, signal }),
  leaderboard: (signal?: AbortSignal) => request<LeaderboardEntry[]>("/api/leaderboard", { signal }),
  registerUser: (auth: AuthHeaders, displayName?: string) => request<UserSummary>("/api/users", {
    method: "POST",
    auth,
    body: JSON.stringify({ display_name: displayName }),
  }),
  createBet: (
    auth: AuthHeaders,
    payload: {
      id: string;
      match_id: string;
      creator_side: BetSide;
      amount_usdc: number;
      escrow_pda: string;
      create_tx: string;
    },
  ) => request<Bet>("/api/bets", {
    method: "POST",
    auth,
    body: JSON.stringify(payload),
  }),
  acceptBet: (auth: AuthHeaders, betId: string, acceptTx: string) => request<Bet>(`/api/bets/${encodeURIComponent(betId)}/accept`, {
    method: "PATCH",
    auth,
    body: JSON.stringify({ accept_tx: acceptTx }),
  }),
};
