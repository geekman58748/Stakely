import type { Bet, Match, UserSummary } from "./api";

export type BetResult = "won" | "lost" | "pending" | "void";

export function currentUser(bet: Bet, walletAddress: string | null): UserSummary | null {
  if (!walletAddress) return null;
  if (bet.creator?.wallet_address === walletAddress) return bet.creator;
  if (bet.counterparty?.wallet_address === walletAddress) return bet.counterparty;
  return null;
}

export function opponent(bet: Bet, walletAddress: string | null): UserSummary | null {
  if (bet.creator?.wallet_address === walletAddress) return bet.counterparty ?? null;
  return bet.creator ?? null;
}

export function isCreator(bet: Bet, walletAddress: string | null) {
  return Boolean(walletAddress && bet.creator?.wallet_address === walletAddress);
}

export function pickedOutcome(bet: Bet, match?: Match) {
  if (bet.creator_side === "draw") return "Draw";
  if (!match) return bet.creator_side === "home" ? "Home" : "Away";
  return bet.creator_side === "home" ? match.home_team : match.away_team;
}

export function userPosition(bet: Bet, walletAddress: string | null) {
  const pick = pickedOutcome(bet, bet.match);
  return isCreator(bet, walletAddress) ? pick : `Against ${pick}`;
}

export function resultFor(bet: Bet, walletAddress: string | null): BetResult {
  if (bet.status === "cancelled") return "void";
  if (bet.status !== "settled") return "pending";
  const user = currentUser(bet, walletAddress);
  if (!user || !bet.winner_id) return "pending";
  return bet.winner_id === user.id ? "won" : "lost";
}

export function hasVerifiedReceipt(bet: Bet) {
  return Boolean(bet.status === "settled" && bet.settle_tx && bet.match?.merkle_proof);
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    challenged: "Awaiting opponent",
    countered: "Counter offer",
    locked: "Funds locked",
    live: "Live now",
    settled: "Settled",
    cancelled: "Cancelled",
    disputed: "Under review",
  };
  return labels[status] ?? status;
}

export function statusGroup(status: string) {
  if (["challenged", "countered"].includes(status)) return "open";
  if (["locked", "live"].includes(status)) return "live";
  if (status === "settled") return "settled";
  return "closed";
}

export function displayName(user: UserSummary | null | undefined) {
  if (!user) return "Waiting for opponent";
  return user.display_name || shortKey(user.wallet_address);
}

export function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function shortKey(value: string | null | undefined, edge = 5) {
  if (!value) return "Not recorded";
  if (value.length <= edge * 2 + 3) return value;
  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
}

export function formatUsdc(value: number) {
  return `${Number(value || 0).toFixed(2)} USDC`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function teamCode(name: string, code?: string | null) {
  return code && /^[a-z]{2,3}$/i.test(code) ? code.toUpperCase() : name.slice(0, 3).toUpperCase();
}
