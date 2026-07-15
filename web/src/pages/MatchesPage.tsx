import {
  Activity,
  ArrowRight,
  CalendarDays,
  RefreshCw,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { stakelyApi, type Match } from "../lib/api";

type Filter = "upcoming" | "live" | "finished" | "all";

const liveStatuses = new Set(["live", "halftime"]);
const finishedStatuses = new Set(["finished", "cancelled", "postponed"]);

export function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMatches = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setMatches(await stakelyApi.matches(signal));
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Could not load TxLINE fixtures.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadMatches(controller.signal);
    return () => controller.abort();
  }, [loadMatches]);

  const filtered = useMemo(() => matches.filter((match) => {
    if (filter === "all") return true;
    if (filter === "live") return liveStatuses.has(match.status);
    if (filter === "finished") return finishedStatuses.has(match.status);
    return !liveStatuses.has(match.status)
      && !finishedStatuses.has(match.status)
      && new Date(match.kickoff_at).getTime() >= Date.now();
  }), [filter, matches]);

  const nextMatch = matches.find((match) => new Date(match.kickoff_at).getTime() > Date.now());

  return (
    <AppShell activePage="matches">
      <div className="matches-page">
        <header className="matches-heading">
          <div>
            <span className="section-kicker"><Trophy size={15} /> World Cup 2026</span>
            <h1>Matches</h1>
            <p>Live fixtures and odds delivered by TxLINE.</p>
          </div>
          <div className="matches-summary" aria-label="Fixture summary">
            <span><small>Fixtures</small><strong>{matches.length}</strong></span>
            <span><small>Live now</small><strong className="green-text">{matches.filter((match) => liveStatuses.has(match.status)).length}</strong></span>
            <span><small>Next kickoff</small><strong>{nextMatch ? shortDate(nextMatch.kickoff_at) : "TBA"}</strong></span>
            <span className="source-stat"><ShieldCheck size={17} /><small>Source</small><strong>TxLINE</strong></span>
          </div>
        </header>

        <div className="match-toolbar">
          <div className="segmented-control" aria-label="Filter matches">
            {(["upcoming", "live", "finished", "all"] as Filter[]).map((item) => (
              <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">
                {item === "live" ? <Activity size={15} /> : null}{capitalize(item)}
              </button>
            ))}
          </div>
          <button className="icon-action" type="button" onClick={() => loadMatches()} title="Refresh matches" aria-label="Refresh matches">
            <RefreshCw size={18} />
          </button>
        </div>

        {loading ? <MatchSkeletons /> : null}
        {!loading && error ? (
          <div className="data-state error-state">
            <Activity size={30} />
            <h2>Fixture feed unavailable</h2>
            <p>{error}</p>
            <button type="button" onClick={() => loadMatches()}><RefreshCw size={16} /> Try again</button>
          </div>
        ) : null}
        {!loading && !error && filtered.length === 0 ? (
          <div className="data-state">
            <CalendarDays size={30} />
            <h2>No {filter} fixtures</h2>
            <p>Try another match view. The page only shows fixtures currently returned by TxLINE.</p>
          </div>
        ) : null}
        {!loading && !error && filtered.length > 0 ? (
          <section className="fixture-grid" aria-label={`${filter} fixtures`}>
            {filtered.map((match) => <FixtureCard key={match.id} match={match} />)}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function FixtureCard({ match }: { match: Match }) {
  const live = liveStatuses.has(match.status);
  const finished = finishedStatuses.has(match.status);
  const homeOdds = match.odds?.homeOdds ?? match.home_odds;
  const drawOdds = match.odds?.drawOdds ?? match.draw_odds;
  const awayOdds = match.odds?.awayOdds ?? match.away_odds;
  return (
    <article className={`fixture-card ${live ? "is-live" : ""}`}>
      <header>
        <span className={`fixture-status status-${match.status}`}>{live ? <Activity size={13} /> : <CalendarDays size={13} />}{match.status}</span>
        <time>{formatKickoff(match.kickoff_at)}</time>
      </header>
      <div className="fixture-teams">
        <Team team={match.home_team} code={match.home_team_code} />
        <div className="fixture-score">
          {live || finished ? <strong>{match.home_score} - {match.away_score}</strong> : <strong>VS</strong>}
          <small>{live ? "Live" : finished ? "Full time" : shortDate(match.kickoff_at)}</small>
        </div>
        <Team team={match.away_team} code={match.away_team_code} />
      </div>
      <div className="fixture-odds" aria-label="Match odds">
        <span><small>Home</small><b>{formatOdds(homeOdds)}</b></span>
        <span><small>Draw</small><b>{formatOdds(drawOdds)}</b></span>
        <span><small>Away</small><b>{formatOdds(awayOdds)}</b></span>
      </div>
      <a className="fixture-open" href={`#match/${encodeURIComponent(match.id)}`}>
        {finished ? "View result" : "Open match"}<ArrowRight size={16} />
      </a>
    </article>
  );
}

function Team({ team, code }: { team: string; code: string | null }) {
  return <span className="fixture-team"><b>{displayTeamCode(team, code)}</b><strong>{team}</strong></span>;
}

function MatchSkeletons() {
  return <div className="fixture-grid" aria-label="Loading fixtures">{Array.from({ length: 6 }, (_, index) => <div className="fixture-card fixture-skeleton" key={index} />)}</div>;
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatOdds(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "--";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function displayTeamCode(team: string, code: string | null) {
  return code && /^[a-z]{2,3}$/i.test(code) ? code.toUpperCase() : team.slice(0, 3).toUpperCase();
}
