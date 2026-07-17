import { Activity, Box, CheckCircle2, CirclePlus, ExternalLink, Gamepad2, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import type { Bet, Match } from "../lib/api";
import { flagForTeam, formatFixtureTime, formatOdds, teamCode, timeToKickoff } from "../lib/discoverView";
import { AvatarStack } from "./FeaturedMarket";

export function DiscoverMarketGrid({ matches, bets, loading }: { matches: Match[]; bets: Bet[]; loading: boolean }) {
  const liveCount = matches.filter((match) => ["live", "halftime"].includes(match.status)).length;
  const upcomingCount = matches.filter((match) => new Date(match.kickoff_at).getTime() >= Date.now() && !["finished", "cancelled", "postponed"].includes(match.status)).length;
  const proofCount = matches.filter((match) => match.merkle_proof).length;
  const openVolume = bets.reduce((sum, bet) => sum + Number(bet.amount_usdc || 0) * 2, 0);
  const playable = matches.filter((match) => !["finished", "cancelled", "postponed"].includes(match.status));
  const matchCards = (playable.length ? playable : matches).slice(0, 2);
  const latestFinal = matches.find((match) => match.merkle_proof) ?? matches.find((match) => match.status === "finished") ?? null;
  const firstChallenge = bets[0] ?? null;

  return (
    <section className={`market-grid ${loading ? "is-loading" : ""}`} aria-label="Prediction markets and challenges">
      <article className="market-card winner-card">
        <CardLabel tone="gold" icon={<Trophy size={13} />} label="Live Feed" />
        <div className="winner-orbit" aria-hidden="true"><span /></div>
        <h3>World Cup Markets</h3><p>TxLINE fixture coverage</p>
        <div className="option-list">
          <MarketOption label="Fixtures" value={`${matches.length}`} tone="blue" />
          <MarketOption label="Live now" value={`${liveCount}`} tone="green" />
          <MarketOption label="Upcoming" value={`${upcomingCount}`} tone="gold" />
          <MarketOption label="Proofs stored" value={`${proofCount}`} tone="green" />
          <a className="all-outcomes" href="#matches">View all fixtures <span>›</span></a>
        </div>
        <CardFooter stat={`${bets.length}`} volume={`${openVolume.toFixed(2)} USDC open`} href="#matches" />
      </article>

      {matchCards.map((match, index) => <MatchCard bets={bets} greenLeft={index === 0} key={match.id} match={match} />)}
      {matchCards.length < 2 ? Array.from({ length: 2 - matchCards.length }, (_, index) => <WaitingMatchCard key={`waiting-${index}`} />) : null}

      <article className="market-card challenge-card">
        <CardLabel tone="purple" icon={<Gamepad2 size={13} />} label={firstChallenge ? "Funded" : "Challenge"} />
        <h3>{firstChallenge ? "Open Friend Challenge" : "Start a Friend Challenge"}</h3>
        <p>{firstChallenge?.match ? `${firstChallenge.match.home_team} vs ${firstChallenge.match.away_team}` : "Create your own market"}</p>
        <div className="challenge-icon"><UsersRound size={42} /><span><CirclePlus size={21} /></span></div>
        <p className="challenge-copy">{firstChallenge ? `${Number(firstChallenge.amount_usdc).toFixed(2)} USDC waiting to be matched` : "Pick a fixture and fund your side"}</p>
        <a className="primary-action full" href={firstChallenge ? `#match/${encodeURIComponent(firstChallenge.match_id)}` : "#matches"}>{firstChallenge ? "Review Challenge" : "Create Challenge"}</a>
        <CardFooter stat={`${bets.length}`} volume={bets.length === 1 ? "Open offer" : "Open offers"} href={firstChallenge ? `#match/${encodeURIComponent(firstChallenge.match_id)}` : "#matches"} />
      </article>

      <SettlementCard match={latestFinal} />
    </section>
  );
}

function MatchCard({ match, bets, greenLeft }: { match: Match; bets: Bet[]; greenLeft?: boolean }) {
  const href = `#match/${encodeURIComponent(match.id)}`;
  const homeOdds = match.odds?.homeOdds ?? match.home_odds;
  const awayOdds = match.odds?.awayOdds ?? match.away_odds;
  const matchBets = bets.filter((bet) => bet.match_id === match.id);
  const volume = matchBets.reduce((sum, bet) => sum + Number(bet.amount_usdc || 0) * 2, 0);
  return (
    <article className="market-card match-card">
      <CardLabel tone="neutral" icon={match.status === "live" ? <Activity size={13} /> : <Gamepad2 size={13} />} label={match.status === "live" ? "Live" : "Match"} />
      <time>{timeToKickoff(match)}</time>
      <h3>{match.home_team} vs {match.away_team}</h3><p>{formatFixtureTime(match.kickoff_at)}</p>
      <div className="team-pair">
        <span>{teamCode(match.home_team, match.home_team_code)}<b>{flagForTeam(match.home_team, teamCode(match.home_team, match.home_team_code))}</b></span>
        <i>{["live", "halftime", "finished"].includes(match.status) ? `${match.home_score}-${match.away_score}` : "VS"}</i>
        <span><b>{flagForTeam(match.away_team, teamCode(match.away_team, match.away_team_code))}</b>{teamCode(match.away_team, match.away_team_code)}</span>
      </div>
      <div className="market-question">Who will win?</div>
      <div className="mini-odds">
        <a className={greenLeft ? "green" : "blue"} href={href}><span>{match.home_team}</span><strong>{formatOdds(homeOdds)}</strong></a>
        <a className="blue" href={href}><span>{match.away_team}</span><strong>{formatOdds(awayOdds)}</strong></a>
      </div>
      <CardFooter stat={`${matchBets.length}`} volume={`${volume.toFixed(2)} USDC`} href={href} />
    </article>
  );
}

function WaitingMatchCard() {
  return <article className="market-card match-card waiting-card"><CardLabel tone="neutral" icon={<ShieldCheck size={13} />} label="Syncing" /><h3>Waiting for fixture</h3><p>TxLINE feed</p><div className="waiting-market"><Activity size={27} /><span>Next market will appear here</span></div><CardFooter stat="0" volume="No fixture" href="#matches" /></article>;
}

function SettlementCard({ match }: { match: Match | null }) {
  const proof = Boolean(match?.merkle_proof);
  const result = match?.result === "home" ? match.home_team : match?.result === "away" ? match.away_team : match?.result === "draw" ? "Draw" : "Pending proof";
  return (
    <article className={`market-card settlement-card ${proof ? "" : "pending"}`}>
      <span className="settlement-corner"><Box size={24} /></span>
      <CardLabel tone={proof ? "green" : "neutral"} icon={<CheckCircle2 size={13} />} label={proof ? "Proof" : "Final"} />
      <h3>{match ? `${match.home_team} vs ${match.away_team}` : "Settlement Feed"}</h3>
      <p>{match ? formatFixtureTime(match.kickoff_at) : "Waiting for a final result"}</p>
      <div className="scoreline">
        <span>{match ? teamCode(match.home_team, match.home_team_code) : "---"}<b>{match ? flagForTeam(match.home_team, "--") : "--"}</b></span>
        <strong>{match ? `${match.home_score} - ${match.away_score}` : "--"}</strong>
        <span><b>{match ? flagForTeam(match.away_team, "--") : "--"}</b>{match ? teamCode(match.away_team, match.away_team_code) : "---"}</span>
      </div>
      <div className="market-settled-label">{proof ? "TxLINE proof stored" : "Final received; proof pending"}</div>
      <div className="settlement-row"><span><small>Result</small>{result}</span><strong>{proof ? "Verified" : "Pending"}</strong></div>
      <a className="receipt-link" href={match ? `#match/${encodeURIComponent(match.id)}` : "#receipts"}>{proof ? "View Proof" : "View Match"} <ExternalLink size={15} /></a>
    </article>
  );
}

function MarketOption({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <span className="feed-option"><span>{label}</span><strong className={`${tone}-text`}>{value}</strong></span>;
}

function CardLabel({ label, tone, icon }: { label: string; tone: string; icon: React.ReactNode }) {
  return <span className={`card-label ${tone}`}>{icon}{label}</span>;
}

function CardFooter({ stat, volume, href }: { stat: string; volume: string; href: string }) {
  return <footer className="card-footer"><AvatarStack tiny /><span>{stat}</span><span className="divider" /><span>{volume}</span><a href={href} title="Open market" aria-label="Open market"><ExternalLink size={13} /></a></footer>;
}
