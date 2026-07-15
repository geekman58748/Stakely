import { Clock3, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import type { Bet, Match } from "../lib/api";
import { flagForTeam, formatFixtureTime, formatOdds, impliedChance, teamCode, timeToKickoff } from "../lib/discoverView";

export function FeaturedMarket({ match, bets, loading, txlineReal }: { match: Match | null; bets: Bet[]; loading: boolean; txlineReal: boolean }) {
  const home = match?.home_team ?? (loading ? "Loading fixture" : "No fixture");
  const away = match?.away_team ?? "Feed syncing";
  const homeOdds = match?.odds?.homeOdds ?? match?.home_odds ?? null;
  const drawOdds = match?.odds?.drawOdds ?? match?.draw_odds ?? null;
  const awayOdds = match?.odds?.awayOdds ?? match?.away_odds ?? null;
  const matchBets = match ? bets.filter((bet) => bet.match_id === match.id) : [];
  const openVolume = matchBets.reduce((sum, bet) => sum + Number(bet.amount_usdc || 0) * 2, 0);
  const href = match ? `#match/${encodeURIComponent(match.id)}` : "#matches";

  return (
    <section className={`featured-market ${loading ? "is-loading" : ""}`} aria-label={match ? `${home} versus ${away} World Cup market` : "TxLINE fixture market"}>
      <div className="hero-reference-art" aria-hidden="true" />
      <div className="hero-shade" aria-hidden="true" />

      <div className="featured-copy">
        <span className="gold-label">World Cup 2026</span>
        <h2>
          <span className="flag">{flagForTeam(home, teamCode(home, match?.home_team_code))}</span>
          <strong>{home} vs {away}</strong>
          <span className="flag flag-france">{flagForTeam(away, teamCode(away, match?.away_team_code))}</span>
          <small>{teamCode(away, match?.away_team_code)}</small>
        </h2>
        <p className="match-meta">{match ? `${formatFixtureTime(match.kickoff_at)}  ·  ${fixtureState(match)}` : "Waiting for the TxLINE fixture feed"}</p>
        <p className="question">Who will win this match?</p>

        <div className="featured-options">
          <a className="outcome-card green" href={href}>
            <span className="kit green-kit"><i /></span>
            <span className="outcome-copy">
              <small>{home}</small>
              <strong>{impliedChance(homeOdds, drawOdds, awayOdds)}</strong>
              <em>{formatOdds(homeOdds)}</em>
            </span>
          </a>
          <span className="versus-badge">VS</span>
          <a className="outcome-card blue" href={href}>
            <span className="outcome-copy">
              <small>{away}</small>
              <strong>{impliedChance(awayOdds, drawOdds, homeOdds)}</strong>
              <em>{formatOdds(awayOdds)}</em>
            </span>
            <span className="kit blue-kit"><i /></span>
          </a>
        </div>

        <div className="featured-footer">
          <AvatarStack />
          <span>{matchBets.length} open</span>
          <span className="divider" />
          <span>{openVolume.toFixed(2)} USDC</span>
          <span className="spacer" />
          <Clock3 size={15} />
          <span>{match ? timeToKickoff(match) : "Syncing"}</span>
        </div>
      </div>

      <div className="featured-action">
        <a className="primary-action" href={href}>
          <UsersRound size={19} fill="currentColor" />
          {matchBets.length ? "View Challenges" : "Create Challenge"}
        </a>
        <span><ShieldCheck size={16} />{txlineReal ? "TxLINE Live Feed" : "TxLINE Feed"}</span>
      </div>

      <Trophy className="hero-trophy-fallback" size={170} strokeWidth={1.1} aria-hidden="true" />
    </section>
  );
}

export function AvatarStack({ tiny = false }: { tiny?: boolean }) {
  return (
    <span className={`avatar-stack ${tiny ? "tiny" : ""}`} aria-label="Participants">
      <i className="avatar-one">AO</i><i className="avatar-two">MK</i><i className="avatar-three">JR</i>
    </span>
  );
}

function fixtureState(match: Match) {
  if (["live", "halftime"].includes(match.status)) return `${match.home_score} - ${match.away_score} live`;
  if (match.status === "finished") return `Final ${match.home_score} - ${match.away_score}`;
  return "Scheduled";
}
