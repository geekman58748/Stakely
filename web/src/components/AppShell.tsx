import {
  Activity,
  BarChart3,
  Box,
  CircleDot,
  CircleGauge,
  Clock3,
  Gamepad2,
  FileCheck2,
  LayoutGrid,
  ListChecks,
  Search,
  ShieldCheck,
  Trophy,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AppPage } from "../App";
import { stakelyApi, type Bet, type Health } from "../lib/api";
import { useWallet } from "../providers/WalletProvider";
import { BrandMark } from "./BrandMark";

type ShellProps = {
  activePage: AppPage;
  children: React.ReactNode;
};

const navItems: Array<{ page: AppPage; label: string; href: string; icon: typeof LayoutGrid }> = [
  { page: "discover", label: "Discover", href: "#discover", icon: LayoutGrid },
  { page: "matches", label: "Matches", href: "#matches", icon: Gamepad2 },
  { page: "my-bets", label: "My Bets", href: "#my-bets", icon: ListChecks },
  { page: "leaderboard", label: "Leaderboard", href: "#leaderboard", icon: BarChart3 },
  { page: "receipts", label: "Receipts", href: "#receipts", icon: FileCheck2 },
];

export function AppShell({ activePage, children }: ShellProps) {
  const leaderboard = activePage === "leaderboard";
  const wallet = useWallet();
  const [health, setHealth] = useState<Health | null>(null);
  const [openBets, setOpenBets] = useState<Bet[]>([]);
  const walletLabel = wallet.publicKey
    ? `${wallet.publicKey.toBase58().slice(0, 4)}...${wallet.publicKey.toBase58().slice(-4)}`
    : wallet.connecting ? "Connecting" : "Connect Wallet";

  const handleWallet = () => {
    if (wallet.connected) wallet.disconnect().catch(() => undefined);
    else wallet.connect().catch(() => undefined);
  };

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      stakelyApi.health(controller.signal),
      stakelyApi.openBets(undefined, controller.signal),
    ]).then(([healthResult, betResult]) => {
      setHealth(healthResult);
      setOpenBets(betResult);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const txlineLabel = health?.txline === "mock" ? "Mock" : health?.ok ? "Live" : "Checking";

  return (
    <div className={`app-shell page-${activePage}`}>
      <header className={`top-nav ${leaderboard ? "nav-with-icons" : ""}`}>
        <a className="brand" href="#discover" aria-label="Stakely Discover">
          <BrandMark />
          <span>Stakely</span>
        </a>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map(({ page, label, href, icon: Icon }) => {
            const active = page === activePage;
            return (
              <a className={active ? "active" : ""} href={href} key={label}>
                {leaderboard ? <Icon size={18} strokeWidth={1.8} /> : null}
                <span>{label}</span>
              </a>
            );
          })}
        </nav>

        <div className="nav-actions">
          <label className="search-box">
            <Search size={18} strokeWidth={1.8} />
            <input aria-label="Search markets" placeholder={leaderboard ? "Search markets, users..." : "Search markets, teams..."} />
          </label>
          <div className="txline-pill">
            {leaderboard ? <CircleDot size={17} /> : <Box size={18} />}
            <strong>TxLINE</strong>
            {!leaderboard ? <i /> : null}
            <span>{txlineLabel}</span>
          </div>
          <button className="wallet-button" type="button" onClick={handleWallet} title={wallet.connected ? "Disconnect wallet" : "Connect Solana wallet"}>
            <Wallet size={18} strokeWidth={1.8} />
            <span>{walletLabel}</span>
          </button>
        </div>
      </header>

      <main>{children}</main>

      {wallet.error ? <div className="wallet-error" role="status">{wallet.error}</div> : null}
      {leaderboard
        ? <LeaderboardStatus activeBets={openBets.length} txlineLabel={txlineLabel} walletLabel={walletLabel} />
        : <DiscoverStatus activeBets={openBets} onWallet={handleWallet} txlineLabel={txlineLabel} walletLabel={walletLabel} />}
    </div>
  );
}

function DiscoverStatus({
  activeBets,
  onWallet,
  txlineLabel,
  walletLabel,
}: {
  activeBets: Bet[];
  onWallet: () => void;
  txlineLabel: string;
  walletLabel: string;
}) {
  const atRisk = activeBets.reduce((sum, bet) => sum + Number(bet.amount_usdc || 0), 0);
  return (
    <footer className="status-bar discover-status" aria-label="System status">
      <div className="status-card status-operational">
        <CircleDot size={20} fill="currentColor" />
        <span>
          <strong>Operational</strong>
          <small>All systems normal</small>
        </span>
      </div>
      <div className="status-card status-wide">
        <Box size={30} />
        <span>
          <strong>TxLINE {txlineLabel}</strong>
          <small>Proofs · Escrow · Settlement</small>
        </span>
      </div>
      <div className="status-card">
        <span className="status-round">D</span>
        <span>
          <strong>Devnet</strong>
          <small>Network: devnet-2</small>
        </span>
      </div>
      <div className="status-card">
        <span className="status-square"><Activity size={24} /></span>
        <span>
          <strong>Active Bets</strong>
          <b>{activeBets.length}</b>
          <small>{atRisk.toFixed(2)} USDC open</small>
        </span>
      </div>
      <div className="status-card">
        <span className="status-square"><Wallet size={23} /></span>
        <span>
          <strong>Wallet Balance</strong>
          <b>{walletLabel === "Connect Wallet" ? "-- USDC" : "Connected"}</b>
          <small>{walletLabel}</small>
        </span>
      </div>
      <button className="wallet-button footer-wallet" type="button" onClick={onWallet}>
        <Wallet size={18} /> <span>{walletLabel}</span>
      </button>
    </footer>
  );
}

function LeaderboardStatus({ activeBets, txlineLabel, walletLabel }: { activeBets: number; txlineLabel: string; walletLabel: string }) {
  return (
    <footer className="status-bar leaderboard-status" aria-label="System status">
      <div className="leader-status-box green"><CircleDot fill="currentColor" size={18} /> Operational</div>
      <div className="leader-status-box green"><ShieldCheck size={22} /> TxLINE {txlineLabel}</div>
      <div className="leader-status-box">Devnet <CircleGauge size={16} /></div>
      <div className="leader-status-box"><BarChart3 size={21} className="blue-icon" /> Active Bets <b>{activeBets}</b></div>
      <div className="leader-status-box"><Clock3 size={21} className="gold-icon" /> Pending Settlements <b className="gold-text">--</b></div>
      <div className="leader-status-box wallet-balance"><Wallet size={20} /> Wallet <b>{walletLabel}</b></div>
    </footer>
  );
}
