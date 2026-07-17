import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Swords,
  Wallet,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import {
  displayName,
  formatDateTime,
  formatUsdc,
  hasVerifiedReceipt,
  initials,
  opponent,
  resultFor,
  statusGroup,
  statusLabel,
  teamCode,
  userPosition,
} from "../lib/betView";
import type { Bet } from "../lib/api";
import { useMyBets } from "../hooks/useMyBets";

type BetFilter = "all" | "open" | "live" | "settled";

export function MyBetsPage() {
  const data = useMyBets();
  const [filter, setFilter] = useState<BetFilter>("all");

  const visibleBets = useMemo(() => data.bets.filter((bet) => {
    if (filter === "all") return true;
    return statusGroup(bet.status) === filter;
  }), [data.bets, filter]);

  const active = data.bets.filter((bet) => ["challenged", "countered", "locked", "live"].includes(bet.status));
  const settled = data.bets.filter((bet) => bet.status === "settled");
  const won = settled.filter((bet) => resultFor(bet, data.walletAddress) === "won");
  const atRisk = active.reduce((sum, bet) => sum + Number(bet.amount_usdc || 0), 0);
  const payouts = won.reduce((sum, bet) => sum + Number(bet.amount_usdc || 0) * 2, 0);

  return (
    <AppShell activePage="my-bets">
      <div className="portfolio-page">
        <header className="portfolio-heading">
          <div className="portfolio-title">
            <span className="title-icon"><Swords size={25} /></span>
            <div>
              <span className="section-kicker">Personal challenge desk</span>
              <h1>My Bets</h1>
              <p>Every challenge, escrow state, and result in one place.</p>
            </div>
          </div>
          <div className="portfolio-heading-actions">
            {data.preview ? <span className="preview-badge">UI preview</span> : null}
            <button className="icon-action" onClick={data.refresh} type="button" title="Refresh bets" aria-label="Refresh bets">
              <RefreshCw size={18} />
            </button>
            <a className="primary-action portfolio-create" href="#matches"><Swords size={17} /> New challenge</a>
          </div>
        </header>

        <section className="portfolio-summary" aria-label="Bet summary">
          <SummaryStat icon={LockKeyhole} label="Active exposure" value={formatUsdc(atRisk)} detail={`${active.length} active challenge${active.length === 1 ? "" : "s"}`} tone="blue" />
          <SummaryStat icon={BadgeDollarSign} label="Payouts received" value={formatUsdc(payouts)} detail={`${won.length} winning receipt${won.length === 1 ? "" : "s"}`} tone="green" />
          <SummaryStat icon={ShieldCheck} label="Verified receipts" value={`${settled.filter(hasVerifiedReceipt).length}/${settled.length}`} detail="TxLINE proof plus payout" tone="cyan" />
          <SummaryStat icon={Activity} label="Win record" value={`${won.length} - ${Math.max(0, settled.length - won.length)}`} detail={settled.length ? `${Math.round((won.length / settled.length) * 100)}% resolved win rate` : "No resolved bets yet"} tone="gold" />
        </section>

        <div className="portfolio-toolbar">
          <div className="segmented-control" aria-label="Filter your bets">
            {(["all", "open", "live", "settled"] as BetFilter[]).map((item) => (
              <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">
                {filterLabel(item)}<b>{countGroup(data.bets, item)}</b>
              </button>
            ))}
          </div>
          <span className="portfolio-sync"><ShieldCheck size={15} /> Wallet-authenticated records</span>
        </div>

        {!data.connected ? <ConnectWalletState onConnect={data.connect} connecting={data.connecting} /> : null}
        {data.connected && data.loading ? <BetRowSkeletons /> : null}
        {data.connected && !data.loading && data.error ? (
          <div className="data-state error-state">
            <Activity size={30} />
            <h2>Portfolio unavailable</h2>
            <p>{data.error}</p>
            <button type="button" onClick={data.refresh}><RefreshCw size={16} /> Try again</button>
          </div>
        ) : null}
        {data.connected && !data.loading && !data.error && visibleBets.length === 0 ? (
          <div className="data-state portfolio-empty">
            <Swords size={30} />
            <h2>{data.bets.length ? `No ${filterLabel(filter).toLowerCase()} bets` : "No challenges yet"}</h2>
            <p>{data.bets.length ? "Choose another status to see the rest of your activity." : "Open a match, choose an outcome, and fund your first challenge."}</p>
            <a href="#matches">Explore matches <ArrowRight size={16} /></a>
          </div>
        ) : null}

        {data.connected && !data.loading && !data.error && visibleBets.length > 0 ? (
          <section className="bet-ledger" aria-label="Your bets">
            <header className="bet-ledger-header">
              <span>Challenge</span><span>Your position</span><span>Stake</span><span>Opponent</span><span>Settlement path</span><span>Action</span>
            </header>
            {visibleBets.map((bet) => <BetLedgerRow bet={bet} key={bet.id} walletAddress={data.walletAddress} />)}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function SummaryStat({ icon: Icon, label, value, detail, tone }: { icon: typeof Activity; label: string; value: string; detail: string; tone: string }) {
  return (
    <span className={`portfolio-stat tone-${tone}`}>
      <i><Icon size={20} /></i>
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </span>
  );
}

function BetLedgerRow({ bet, walletAddress }: { bet: Bet; walletAddress: string | null }) {
  const match = bet.match;
  const otherUser = opponent(bet, walletAddress);
  const otherName = displayName(otherUser);
  const result = resultFor(bet, walletAddress);
  const settled = bet.status === "settled";
  const verified = hasVerifiedReceipt(bet);
  const stage = statusGroup(bet.status);
  const referenceTx = bet.settle_tx || bet.accept_tx || bet.create_tx;

  return (
    <article className={`bet-ledger-row result-${result}`}>
      <div className="bet-match-cell">
        <span className={`bet-status status-${stage}`}>{statusIcon(bet.status)} {statusLabel(bet.status)}</span>
        <strong>{match?.home_team ?? "Unknown team"} <i>vs</i> {match?.away_team ?? "Unknown team"}</strong>
        <small>{match ? formatDateTime(match.kickoff_at) : `Fixture ${bet.match_id}`}</small>
        <span className="team-code-pair"><b>{teamCode(match?.home_team ?? "Home", match?.home_team_code)}</b><b>{teamCode(match?.away_team ?? "Away", match?.away_team_code)}</b></span>
      </div>

      <div className="bet-position-cell">
        <small>Your position</small>
        <strong>{userPosition(bet, walletAddress)}</strong>
        {settled ? <span className={`result-pill ${result}`}>{result === "won" ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{result}</span> : <span>{match?.status === "live" ? `${match.home_score} - ${match.away_score} live` : statusLabel(match?.status ?? "scheduled")}</span>}
      </div>

      <div className="bet-value-cell">
        <small>Your stake</small>
        <strong>{formatUsdc(Number(bet.amount_usdc))}</strong>
        <span>Vault {formatUsdc(Number(bet.amount_usdc) * (bet.accept_tx ? 2 : 1))}</span>
      </div>

      <div className="bet-opponent-cell">
        <i className="opponent-avatar">{initials(otherName)}</i>
        <span><strong>{otherName}</strong><small>{otherUser ? `${otherUser.streak} win streak` : "Share challenge to match"}</small></span>
      </div>

      <div className="bet-stage-cell" aria-label="Settlement progress">
        <span className={bet.create_tx ? "complete" : ""}><i /> Funded</span>
        <span className={bet.accept_tx ? "complete" : stage === "open" ? "current" : ""}><i /> Matched</span>
        <span className={verified ? "complete" : settled ? "current" : ""}><i /> Proof</span>
      </div>

      <div className="bet-action-cell">
        <a className={settled ? "receipt-action" : "match-action"} href={settled ? `#receipts/${encodeURIComponent(bet.id)}` : `#match/${encodeURIComponent(bet.match_id)}`}>
          {settled ? <FileCheck2 size={16} /> : <ArrowRight size={16} />}{settled ? "Receipt" : "Open"}
        </a>
        {referenceTx ? <a className="chain-mini-link" href={`https://explorer.solana.com/tx/${referenceTx}?cluster=devnet`} target="_blank" rel="noreferrer" title="View latest transaction">Explorer <ExternalLink size={12} /></a> : null}
      </div>
    </article>
  );
}

function ConnectWalletState({ onConnect, connecting }: { onConnect: () => Promise<void>; connecting: boolean }) {
  return (
    <div className="wallet-gate">
      <span className="wallet-gate-icon"><Wallet size={31} /></span>
      <div><span className="section-kicker">Private portfolio</span><h2>Connect your wallet to load your bets</h2><p>Your wallet signature identifies your Stakely record. It does not move funds.</p></div>
      <button type="button" onClick={() => onConnect().catch(() => undefined)}><Wallet size={17} /> {connecting ? "Connecting" : "Connect wallet"}</button>
    </div>
  );
}

function BetRowSkeletons() {
  return <div className="bet-ledger bet-ledger-loading" aria-label="Loading your bets">{Array.from({ length: 4 }, (_, index) => <div className="bet-row-skeleton" key={index} />)}</div>;
}

function filterLabel(filter: BetFilter) {
  return filter === "all" ? "All" : filter === "open" ? "Open" : filter === "live" ? "In play" : "Settled";
}

function countGroup(bets: Bet[], filter: BetFilter) {
  return filter === "all" ? bets.length : bets.filter((bet) => statusGroup(bet.status) === filter).length;
}

function statusIcon(status: string) {
  if (status === "settled") return <CheckCircle2 size={13} />;
  if (status === "live") return <Activity size={13} />;
  if (["locked", "countered"].includes(status)) return <LockKeyhole size={13} />;
  return <Clock3 size={13} />;
}
