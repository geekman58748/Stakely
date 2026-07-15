import type { Match } from "./api";

const flags: Record<string, string> = {
  algeria: "🇩🇿", argentina: "🇦🇷", australia: "🇦🇺", brazil: "🇧🇷", canada: "🇨🇦",
  "cape verde": "🇨🇻", colombia: "🇨🇴", egypt: "🇪🇬", england: "🇬🇧", france: "🇫🇷",
  ghana: "🇬🇭", japan: "🇯🇵", mexico: "🇲🇽", morocco: "🇲🇦", nigeria: "🇳🇬",
  norway: "🇳🇴", paraguay: "🇵🇾", portugal: "🇵🇹", spain: "🇪🇸", switzerland: "🇨🇭",
  usa: "🇺🇸", "united states": "🇺🇸",
};

export function teamCode(name: string, code?: string | null) {
  return code && /^[a-z]{2,3}$/i.test(code) ? code.toUpperCase() : name.slice(0, 3).toUpperCase();
}

export function flagForTeam(name: string, fallback: string) {
  return flags[name.toLowerCase()] ?? fallback;
}

export function formatOdds(value: number | null | undefined) {
  return typeof value === "number" && value > 0 ? value.toFixed(2) : "Odds pending";
}

export function impliedChance(value: number | null, second: number | null, third: number | null) {
  if (!value || value <= 0) return "--";
  const inverse = [value, second, third].filter((odd): odd is number => Boolean(odd && odd > 0)).map((odd) => 1 / odd);
  const total = inverse.reduce((sum, part) => sum + part, 0);
  return total ? `${Math.round((1 / value / total) * 100)}%` : "--";
}

export function formatFixtureTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function timeToKickoff(match: Match) {
  if (["live", "halftime"].includes(match.status)) return "Live now";
  if (match.status === "finished") return "Full time";
  const difference = new Date(match.kickoff_at).getTime() - Date.now();
  if (difference <= 0) return "Awaiting update";
  const hours = Math.floor(difference / 3_600_000);
  const days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h` : `${hours}h ${Math.max(0, Math.floor((difference % 3_600_000) / 60_000))}m`;
}
