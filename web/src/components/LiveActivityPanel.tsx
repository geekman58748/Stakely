import { Activity, Box, CalendarDays, Check, ChevronRight, ShieldCheck, Swords } from "lucide-react";
import type { Bet, Match } from "../lib/api";
import { flagForTeam, teamCode, timeToKickoff } from "../lib/discoverView";

type ActivityRecord = {
  id: string;
  kind: "score" | "challenge" | "proof" | "fixture";
  label: string;
  tone: "blue" | "green";
  title: string;
  detail: string;
  time: string;
  href: string;
  match?: Match;
};

export function LiveActivityPanel({ matches, bets, loading }: { matches: Match[]; bets: Bet[]; loading: boolean }) {
  const activity = buildActivity(matches, bets).slice(0, 4);
  return (
    <aside className="activity-panel" aria-label="Live activity">
      <div className="panel-header"><h2>Live Activity</h2><span className="live-dot">{loading ? "Syncing" : "Live"}</span></div>
      <div className="activity-list">
        {activity.length ? activity.map((item) => <ActivityEntry item={item} key={item.id} />) : <ActivityEmpty loading={loading} />}
      </div>
      <a className="ghost-button" href="#matches">View all activity <ChevronRight size={15} /></a>
      <span className="activity-verification" aria-hidden="true"><ShieldCheck size={18} /></span>
    </aside>
  );
}

function ActivityEntry({ item }: { item: ActivityRecord }) {
  const score = item.match && item.kind === "score";
  return (
    <article className={`activity-item ${score ? "activity-score" : ""} ${item.kind === "proof" ? "activity-proof" : ""}`}>
      <span className={`activity-label ${item.tone}`}>{item.label}</span>
      {!score ? <ActivityIcon kind={item.kind} /> : null}
      <div className="activity-body">
        <h3>{item.kind === "score" ? <Activity size={15} /> : null}{item.title}</h3>
        <p>{item.detail}</p>
        {score && item.match ? (
          <div className="activity-scoreline">
            <span className="flag-mini">{flagForTeam(item.match.home_team, teamCode(item.match.home_team, item.match.home_team_code))}</span>
            <strong>{item.match.home_score}&nbsp; - &nbsp;{item.match.away_score}</strong>
            <span className="flag-mini">{flagForTeam(item.match.away_team, teamCode(item.match.away_team, item.match.away_team_code))}</span>
          </div>
        ) : null}
        {item.kind === "proof" ? <a href={item.href}>View proof record <ChevronRight size={13} /></a> : null}
      </div>
      <time>{item.time}</time>
    </article>
  );
}

function ActivityIcon({ kind }: { kind: ActivityRecord["kind"] }) {
  if (kind === "challenge") return <Swords className="activity-type-icon" size={17} />;
  if (kind === "proof") return <Box className="activity-type-icon green-text" size={18} />;
  if (kind === "fixture") return <CalendarDays className="activity-type-icon" size={17} />;
  return <Check className="activity-type-icon green-text" size={17} />;
}

function ActivityEmpty({ loading }: { loading: boolean }) {
  return <div className="activity-empty"><Activity size={25} /><strong>{loading ? "Loading activity" : "No active markets"}</strong><small>{loading ? "Reading the TxLINE feed" : "New challenges and live fixtures will appear here."}</small></div>;
}

function buildActivity(matches: Match[], bets: Bet[]): ActivityRecord[] {
  const live = matches.filter((match) => ["live", "halftime"].includes(match.status)).slice(0, 1).map((match) => ({
    id: `live-${match.id}`, kind: "score" as const, label: "LIVE", tone: "blue" as const,
    title: `${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team}`,
    detail: "Score update from TxLINE", time: "Now", href: `#match/${encodeURIComponent(match.id)}`, match,
  }));
  const challenges = bets.map((bet) => ({
    id: `bet-${bet.id}`, kind: "challenge" as const, label: "OPEN", tone: "blue" as const,
    title: `${bet.match?.home_team ?? "Match"} challenge`,
    detail: `${Number(bet.amount_usdc).toFixed(2)} USDC funded by ${bet.creator?.display_name || "a fan"}`,
    time: relativeTime(bet.created_at), href: `#match/${encodeURIComponent(bet.match_id)}`,
  }));
  const proofs = matches.filter((match) => match.merkle_proof).map((match) => ({
    id: `proof-${match.id}`, kind: "proof" as const, label: "PROOF", tone: "green" as const,
    title: `${match.home_team} vs ${match.away_team}`,
    detail: "TxLINE settlement proof attached", time: relativeTime(match.merkle_stored_at), href: "#receipts",
  }));
  const fixtures = uniqueMatchups(matches.filter((match) => !["live", "halftime", "finished"].includes(match.status))).map((match) => ({
    id: `fixture-${match.id}`, kind: "fixture" as const, label: "NEXT", tone: "blue" as const,
    title: `${match.home_team} vs ${match.away_team}`, detail: "Challenge market available",
    time: timeToKickoff(match), href: `#match/${encodeURIComponent(match.id)}`,
  }));
  const finals = matches.filter((match) => match.status === "finished" && !match.merkle_proof).slice(0, 1).map((match) => ({
    id: `final-${match.id}`, kind: "score" as const, label: "FINAL", tone: "blue" as const,
    title: `${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team}`,
    detail: "Final score received; proof pending", time: relativeTime(match.updated_at), href: `#match/${encodeURIComponent(match.id)}`, match,
  }));
  return [...live, ...challenges, ...proofs, ...fixtures, ...finals];
}

function uniqueMatchups(matches: Match[]) {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const matchup = `${match.home_team.trim().toLowerCase()}::${match.away_team.trim().toLowerCase()}`;
    if (seen.has(matchup)) return false;
    seen.add(matchup);
    return true;
  });
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "Recent";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 2) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
