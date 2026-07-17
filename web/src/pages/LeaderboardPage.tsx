import { useEffect, useState } from "react";
import {
  BadgeCheck, ExternalLink, Flame, Globe2,
  Info, ShieldCheck, Trophy, UsersRound,
} from "lucide-react";
import { AppShell } from "../components/AppShell";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type LeaderUser = {
  id: string;
  display_name: string | null;
  wallet_address: string;
  streak: number;
  total_wins: number;
  total_losses: number;
  total_volume_usdc: number;
};

const TONES = ["gold", "blue", "bronze", "silver", "silver", "silver", "silver", "silver", "silver", "silver"];

function shortWallet(w: string) {
  return w.slice(0, 4) + "…" + w.slice(-4);
}

function fmtVol(v: number) {
  if (v >= 1000) return "$" + (v / 1000).toFixed(1) + "K";
  return "$" + v.toFixed(2);
}

function winRate(u: LeaderUser) {
  const total = u.total_wins + u.total_losses;
  if (!total) return "—";
  return ((u.total_wins / total) * 100).toFixed(1) + "%";
}

function displayName(u: LeaderUser) {
  return u.display_name ?? shortWallet(u.wallet_address);
}

export function LeaderboardPage() {
  const [leaders, setLeaders] = useState<LeaderUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/leaderboard`)
      .then(r => { if (!r.ok) throw new Error("Failed to load leaderboard"); return r.json(); })
      .then((data: LeaderUser[]) => { setLeaders(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const top3 = leaders.slice(0, 3);
  const rest = leaders.slice(3);

  // Reorder podium: 2nd, 1st, 3rd
  const podium = top3.length >= 3
    ? [{ ...top3[1], place: 2 }, { ...top3[0], place: 1 }, { ...top3[2], place: 3 }]
    : top3.map((u, i) => ({ ...u, place: i + 1 }));

  return (
    <AppShell activePage="leaderboard">
      <div className="leaderboard-page">
        {loading && (
          <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted, #888)" }}>
            Loading leaderboard…
          </div>
        )}
        {error && (
          <div style={{ padding: "4rem", textAlign: "center", color: "#f87171" }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <>
            <section className="leaderboard-upper">
              <div className="leaderboard-main">
                <header className="leaderboard-heading">
                  <div className="leaderboard-title">
                    <span className="title-icon"><Trophy size={28} /></span>
                    <span><h1>Leaderboard</h1><p>Top Predictors</p></span>
                  </div>
                  <div className="leaderboard-filters" aria-label="Leaderboard filters">
                    <button className="active" type="button"><Globe2 size={17} /> Global</button>
                    <button type="button"><UsersRound size={17} /> Friends</button>
                  </div>
                </header>

                {podium.length > 0 ? (
                  <div className="podium-grid">
                    {podium.map((u) => (
                      <article key={u.id} className={`leader-card ${TONES[u.place - 1]} ${u.place === 1 ? "champion" : ""}`}>
                        <span className="rank-badge">{u.place}</span>
                        {u.place === 1 ? <Trophy className="leader-crown" size={24} fill="currentColor" /> : null}
                        <div className="leader-avatar">{displayName(u).slice(0, 2).toUpperCase()}</div>
                        <h2>{displayName(u)} <BadgeCheck size={17} fill="currentColor" /></h2>
                        <strong className="streak-badge">
                          <Flame size={13} /> {u.streak} WIN STREAK
                        </strong>
                        <dl className="leader-stats">
                          <div><dt>Win Rate</dt><dd>{winRate(u)}</dd></div>
                          <div><dt>Volume</dt><dd>{fmtVol(u.total_volume_usdc)}</dd></div>
                          <div><dt>W / L</dt><dd>{u.total_wins} / {u.total_losses}</dd></div>
                        </dl>
                        <div className="leader-badge">
                          <ShieldCheck size={13} /> Verified
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted, #888)" }}>
                    No ranked players yet — place a bet to get on the board.
                  </div>
                )}
              </div>

              <RecentSettlement />
            </section>

            {rest.length > 0 && <LeaderboardTable rows={rest} />}
          </>
        )}
      </div>
    </AppShell>
  );
}

function RecentSettlement() {
  return (
    <aside className="recent-settlement">
      <header><Info size={15} /> Live Settlements</header>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #888)", padding: "1rem" }}>
        Settlement receipts appear here as matches finish on-chain.
      </p>
    </aside>
  );
}

function LeaderboardTable({ rows }: { rows: (LeaderUser & { place?: number })[] }) {
  return (
    <section className="leaderboard-table-section">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>#</th><th>Player</th><th>Streak</th><th>Win Rate</th>
            <th>W</th><th>L</th><th>Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u, i) => (
            <tr key={u.id}>
              <td>{i + 4}</td>
              <td>
                <span className="table-avatar">{displayName(u).slice(0, 2).toUpperCase()}</span>
                {displayName(u)}
                <a
                  className="wallet-link"
                  href={`https://explorer.solana.com/address/${u.wallet_address}?cluster=devnet`}
                  target="_blank" rel="noreferrer"
                  aria-label="View on Solana Explorer"
                ><ExternalLink size={11} /></a>
              </td>
              <td><Flame size={12} /> {u.streak}</td>
              <td>{winRate(u)}</td>
              <td>{u.total_wins}</td>
              <td>{u.total_losses}</td>
              <td>{fmtVol(u.total_volume_usdc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
