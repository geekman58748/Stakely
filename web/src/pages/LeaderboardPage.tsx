import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Flame,
  Globe2,
  Info,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import { AppShell } from "../components/AppShell";

const leaders = [
  { place: 2, initials: "AR", name: "AlphaRay", streak: "12 WIN STREAK", winRate: "67.8%", volume: "$128.43K", bets: "24", best: "+$8,420", tone: "blue" },
  { place: 1, initials: "CH", name: "ChampHunter", streak: "18 WIN STREAK", winRate: "72.4%", volume: "$215.78K", bets: "31", best: "+$12,630", tone: "gold" },
  { place: 3, initials: "KB", name: "KickBack", streak: "9 WIN STREAK", winRate: "61.2%", volume: "$96.17K", bets: "18", best: "+$6,240", tone: "bronze" },
];

const rows = [
  ["4", "BP", "BetProphet", "7", "59.1%", "65", "45", "$74.32K", "16", "+$4,210", "3h 42m"],
  ["5", "FD", "FieldDoctor", "6", "57.3%", "51", "38", "$58.91K", "14", "+$3,675", "2h 17m"],
  ["6", "NG", "NetGenius", "10", "55.6%", "50", "40", "$43.68K", "9", "+$2,980", "2h 58m"],
  ["7", "SW", "StatWhisper", "5", "54.8%", "40", "33", "$37.19K", "11", "+$2,745", "3h 05m"],
  ["8", "LK", "LeftFootKing", "4", "53.2%", "42", "37", "$31.47K", "8", "+$2,210", "2h 33m"],
  ["9", "MV", "MarketVision", "3", "51.9%", "41", "38", "$28.90K", "6", "+$1,980", "2h 05m"],
  ["10", "HB", "HalfBackHero", "7", "50.6%", "38", "37", "$26.11K", "7", "+$1,845", "1h 49m"],
];

export function LeaderboardPage() {
  return (
    <AppShell activePage="leaderboard">
      <div className="leaderboard-page">
        <section className="leaderboard-upper">
          <div className="leaderboard-main">
            <header className="leaderboard-heading">
              <div className="leaderboard-title">
                <span className="title-icon"><Trophy size={28} /></span>
                <span><h1>Leaderboard</h1><p>Top Predictors</p></span>
              </div>
              <div className="leaderboard-filters" aria-label="Leaderboard filters">
                <button className="active" type="button"><Globe2 size={17} /> Global</button>
                <button type="button">7d</button>
                <button type="button">30d</button>
                <button className="world-cup" type="button"><Trophy size={15} /> World Cup</button>
                <button type="button"><UsersRound size={17} /> Friends</button>
              </div>
            </header>

            <div className="podium-grid">
              {leaders.map((leader) => <LeaderCard key={leader.place} leader={leader} />)}
            </div>
          </div>

          <RecentSettlement />
        </section>

        <LeaderboardTable />
      </div>
    </AppShell>
  );
}

function LeaderCard({ leader }: { leader: (typeof leaders)[number] }) {
  return (
    <article className={`leader-card ${leader.tone} ${leader.place === 1 ? "champion" : ""}`}>
      <span className="rank-badge">{leader.place}</span>
      {leader.place === 1 ? <Trophy className="leader-crown" size={24} fill="currentColor" /> : null}
      <div className="leader-avatar">{leader.initials}</div>
      <h2>{leader.name} <BadgeCheck size={17} fill="currentColor" /></h2>
      <strong className="streak-badge">{leader.streak}</strong>
      <div className="leader-stats">
        <span><small>Win Rate</small><b>{leader.winRate}</b></span>
        <span><small>Total Volume</small><b>{leader.volume}</b></span>
        <span><small>Active Bets</small><b>{leader.bets}</b></span>
      </div>
      <div className="best-win">
        <span><small>Best Win</small><strong>{leader.best}</strong></span>
        <Sparkline tone={leader.tone} />
      </div>
    </article>
  );
}

function Sparkline({ tone }: { tone: string }) {
  return (
    <svg className={`sparkline ${tone}`} viewBox="0 0 116 52" aria-hidden="true">
      <path className="spark-fill" d="M0 48 L11 47 L21 41 L30 45 L40 31 L49 43 L59 26 L70 39 L79 28 L90 35 L100 19 L108 7 L116 6 L116 52 L0 52 Z" />
      <path d="M0 48 L11 47 L21 41 L30 45 L40 31 L49 43 L59 26 L70 39 L79 28 L90 35 L100 19 L108 7 L116 6" />
    </svg>
  );
}

function RecentSettlement() {
  return (
    <aside className="recent-settlement">
      <header><h2>Recent Settlement</h2><a href="#receipts">View All</a></header>
      <p>World Cup&nbsp; · &nbsp;Group Stage</p>
      <p>May 24, 2025&nbsp; · &nbsp;18:00 UTC</p>
      <div className="recent-score">
        <span><b className="large-flag">🇧🇷</b><strong>Brazil</strong></span>
        <span><strong>2 - 1</strong><small>FT</small></span>
        <span><b className="large-flag">🇨🇴</b><strong>Colombia</strong></span>
      </div>
      <div className="winning-outcome">
        <span><small>Winning Outcome</small><strong>Brazil</strong></span>
        <b>WINNER</b>
      </div>
      <div className="payout-row"><span>Payout</span><strong>+$1,245.60 <i>◉</i></strong></div>
      <div className="settlement-actions">
        <button type="button"><ShieldCheck size={16} /> TxLINE Verified <CheckCircle2 size={15} /></button>
        <a href="#receipts">View Receipt <ExternalLink size={15} /></a>
      </div>
    </aside>
  );
}

function LeaderboardTable() {
  return (
    <div className="leaderboard-table-wrap">
      <table className="leaderboard-table">
        <thead><tr><th>Rank</th><th>User</th><th>Streak</th><th>Win Rate</th><th>Wins / Losses</th><th>Volume <Info size={14} /></th><th>Open Bets</th><th>Best Win</th><th>Avg Hold</th><th>Proof</th></tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row[0]}>
              <td>{row[0]}</td>
              <td><span className={`table-avatar avatar-color-${index}`}>{row[1]}</span><strong>{row[2]}</strong><BadgeCheck size={15} fill="currentColor" /></td>
              <td><span className="green-text">{row[3]} <Flame size={16} fill="currentColor" /></span></td>
              <td>{row[4]}</td>
              <td><span className="green-text">{row[5]}</span> / <span className="loss-text">{row[6]}</span></td>
              <td>{row[7]}</td>
              <td>{row[8]}</td>
              <td><strong className="green-text">{row[9]}</strong></td>
              <td>{row[10]}</td>
              <td><span className="proof-cell"><ShieldCheck size={17} fill="currentColor" /> TxLINE</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
