import { AlertCircle, RefreshCw, Wifi } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CategoryTabs } from "../components/CategoryTabs";
import { FeaturedMarket } from "../components/FeaturedMarket";
import { LiveActivityPanel } from "../components/LiveActivityPanel";
import { DiscoverMarketGrid } from "../components/MarketCard";
import { previewBets } from "../data/previewBets";
import { stakelyApi, type Bet, type Health, type Match } from "../lib/api";

export function DiscoverPage() {
  const preview = useMemo(() => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1", []);
  const [matches, setMatches] = useState<Match[]>(preview ? previewMatches() : []);
  const [bets, setBets] = useState<Bet[]>(preview ? previewBets.filter((bet) => bet.status === "challenged") : []);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (preview) return;
    setLoading(true);
    setError(null);
    const [matchResult, betResult, healthResult] = await Promise.allSettled([
      stakelyApi.matches(signal),
      stakelyApi.openBets(undefined, signal),
      stakelyApi.health(signal),
    ]);
    if (signal?.aborted) return;
    if (matchResult.status === "fulfilled") setMatches(matchResult.value);
    if (betResult.status === "fulfilled") setBets(betResult.value);
    if (healthResult.status === "fulfilled") setHealth(healthResult.value);
    if (matchResult.status === "rejected") {
      setError(matchResult.reason instanceof Error ? matchResult.reason.message : "TxLINE fixtures are unavailable.");
    }
    setLoading(false);
  }, [preview]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const rankedMatches = useMemo(() => rankMatches(matches), [matches]);
  const featured = rankedMatches[0] ?? null;

  return (
    <AppShell activePage="discover">
      <div className="discover-page">
        <section className="discover-top">
          <div className="discover-primary">
            <div className="discover-heading-line">
              <h1>Discover</h1>
              <span className={`discover-feed-pill ${error ? "error" : ""}`}>
                {error ? <AlertCircle size={13} /> : <Wifi size={13} />}
                {preview ? "UI preview" : loading ? "Syncing" : health?.txline === "real" ? "TxLINE live" : "Feed ready"}
              </span>
              {error ? <button type="button" onClick={() => load()} title="Retry fixture feed" aria-label="Retry fixture feed"><RefreshCw size={14} /></button> : null}
            </div>
            <CategoryTabs />
            <FeaturedMarket match={featured} bets={bets} loading={loading} txlineReal={health?.txline === "real" || preview} />
          </div>
          <LiveActivityPanel matches={rankedMatches} bets={bets} loading={loading} />
        </section>
        <DiscoverMarketGrid matches={rankedMatches} bets={bets} loading={loading} />
      </div>
    </AppShell>
  );
}

function rankMatches(matches: Match[]) {
  const now = Date.now();
  const priority = (match: Match) => {
    if (["live", "halftime"].includes(match.status)) return 0;
    if (new Date(match.kickoff_at).getTime() >= now && !["finished", "cancelled", "postponed"].includes(match.status)) return 1;
    if (match.merkle_proof) return 2;
    if (match.status === "finished") return 3;
    return 4;
  };
  return [...matches].sort((left, right) => {
    const group = priority(left) - priority(right);
    if (group) return group;
    const leftTime = new Date(left.kickoff_at).getTime();
    const rightTime = new Date(right.kickoff_at).getTime();
    return priority(left) >= 2 ? rightTime - leftTime : leftTime - rightTime;
  });
}

function previewMatches() {
  const byId = new Map<string, Match>();
  previewBets.forEach((bet) => { if (bet.match) byId.set(bet.match.id, bet.match); });
  return [...byId.values()];
}
