import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useMyBets } from "../hooks/useMyBets";
import {
  displayName,
  formatDateTime,
  formatUsdc,
  hasVerifiedReceipt,
  opponent,
  pickedOutcome,
  resultFor,
  shortKey,
  teamCode,
  userPosition,
} from "../lib/betView";
import type { Bet } from "../lib/api";

export function ReceiptsPage({ receiptId }: { receiptId?: string }) {
  const data = useMyBets();
  const receipts = useMemo(() => data.bets.filter((bet) => bet.status === "settled"), [data.bets]);
  const selected = receipts.find((bet) => bet.id === receiptId) ?? receipts[0] ?? null;
  const verified = receipts.filter(hasVerifiedReceipt);
  const paid = verified
    .filter((bet) => resultFor(bet, data.walletAddress) === "won")
    .reduce((sum, bet) => sum + Number(bet.amount_usdc || 0) * 2, 0);

  return (
    <AppShell activePage="receipts">
      <div className="receipts-page">
        <header className="receipts-heading">
          <div className="portfolio-title">
            <span className="title-icon receipt-title-icon"><ReceiptText size={25} /></span>
            <div>
              <span className="section-kicker">Proof archive</span>
              <h1>Settlement Receipts</h1>
              <p>Verified results, escrow payouts, and their on-chain trail.</p>
            </div>
          </div>
          <div className="receipt-summary">
            <span><ShieldCheck size={18} /><small>Verified</small><strong>{verified.length}</strong></span>
            <span><Wallet size={18} /><small>Paid to you</small><strong>{formatUsdc(paid)}</strong></span>
            <span><Fingerprint size={18} /><small>Source</small><strong>TxLINE + Solana</strong></span>
            <button className="icon-action" onClick={data.refresh} type="button" title="Refresh receipts" aria-label="Refresh receipts"><RefreshCw size={18} /></button>
          </div>
        </header>

        {data.preview ? <div className="receipt-preview-strip"><span className="preview-badge">UI preview</span><p>Showing representative proof states while the keeper integration is completed.</p></div> : null}

        {!data.connected ? <ReceiptWalletGate onConnect={data.connect} connecting={data.connecting} /> : null}
        {data.connected && data.loading ? <div className="receipt-layout receipt-loading"><div /><div /></div> : null}
        {data.connected && !data.loading && data.error ? (
          <div className="data-state error-state"><Activity size={30} /><h2>Receipt archive unavailable</h2><p>{data.error}</p><button type="button" onClick={data.refresh}><RefreshCw size={16} /> Try again</button></div>
        ) : null}
        {data.connected && !data.loading && !data.error && !selected ? (
          <div className="data-state portfolio-empty"><ReceiptText size={30} /><h2>No settlement receipts yet</h2><p>Receipts appear here after a funded challenge is paid out and recorded.</p><a href="#my-bets">View my bets <ArrowRight size={16} /></a></div>
        ) : null}

        {data.connected && !data.loading && !data.error && selected ? (
          <div className="receipt-layout">
            <aside className="receipt-index" aria-label="Settlement receipts">
              <header><div><span className="section-kicker">Archive</span><h2>Recent settlements</h2></div><b>{receipts.length}</b></header>
              <div className="receipt-index-list">
                {receipts.map((bet) => <ReceiptIndexRow bet={bet} key={bet.id} selected={bet.id === selected.id} walletAddress={data.walletAddress} />)}
              </div>
              <footer><ShieldCheck size={16} /><span><strong>Proof-aware archive</strong><small>Incomplete legacy settlements stay clearly marked.</small></span></footer>
            </aside>
            <ReceiptDocument bet={selected} walletAddress={data.walletAddress} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function ReceiptIndexRow({ bet, selected, walletAddress }: { bet: Bet; selected: boolean; walletAddress: string | null }) {
  const match = bet.match;
  const result = resultFor(bet, walletAddress);
  const verified = hasVerifiedReceipt(bet);
  return (
    <a className={`receipt-index-row ${selected ? "active" : ""}`} href={`#receipts/${encodeURIComponent(bet.id)}`}>
      <span className={`receipt-index-status ${verified ? "verified" : "pending"}`}>{verified ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}</span>
      <span className="receipt-index-copy">
        <strong>{match?.home_team ?? "Home"} vs {match?.away_team ?? "Away"}</strong>
        <small>{formatDateTime(bet.settled_at)}</small>
        <em>{verified ? "Proof verified" : "Proof incomplete"}</em>
      </span>
      <span className={`receipt-index-value result-${result}`}><strong>{result === "won" ? `+${formatUsdc(Number(bet.amount_usdc) * 2)}` : "0.00 USDC"}</strong><small>{result}</small></span>
      <ArrowRight size={16} />
    </a>
  );
}

function ReceiptDocument({ bet, walletAddress }: { bet: Bet; walletAddress: string | null }) {
  const match = bet.match;
  const verified = hasVerifiedReceipt(bet);
  const result = resultFor(bet, walletAddress);
  const otherUser = opponent(bet, walletAddress);
  const proof = match?.merkle_proof;
  const score = `${match?.home_score ?? 0} - ${match?.away_score ?? 0}`;
  const proofPayload = proof ? JSON.stringify(proof, null, 2) : "TxLINE validation proof has not been attached to this settlement record.";

  return (
    <article className={`receipt-document ${verified ? "is-verified" : "is-pending"}`}>
      <header className="receipt-document-header">
        <div><span className="receipt-document-mark"><FileCheck2 size={22} /></span><span><small>Stakely settlement receipt</small><strong>#{bet.id.slice(0, 8).toUpperCase()}</strong></span></div>
        <span className={`verification-badge ${verified ? "verified" : "pending"}`}>{verified ? <ShieldCheck size={16} /> : <Clock3 size={16} />}{verified ? "Verified" : "Proof pending"}</span>
      </header>

      <section className="receipt-score-band">
        <span className="receipt-team"><b>{teamCode(match?.home_team ?? "Home", match?.home_team_code)}</b><strong>{match?.home_team ?? "Home team"}</strong></span>
        <span className="receipt-final-score"><small>Full time</small><strong>{score}</strong><em>TxLINE fixture {bet.match_id}</em></span>
        <span className="receipt-team"><b>{teamCode(match?.away_team ?? "Away", match?.away_team_code)}</b><strong>{match?.away_team ?? "Away team"}</strong></span>
      </section>

      <section className="receipt-payout-band">
        <div><small>Your result</small><strong className={`payout-result result-${result}`}>{result}</strong><span>{userPosition(bet, walletAddress)}</span></div>
        <div className="receipt-payout-main"><small>Final payout</small><strong>{result === "won" ? formatUsdc(Number(bet.amount_usdc) * 2) : "0.00 USDC"}</strong><span>{result === "won" ? "Released to your wallet" : "Escrow paid to the winning wallet"}</span></div>
        <div><small>Settled</small><strong>{formatDateTime(bet.settled_at)}</strong><span>Solana devnet</span></div>
      </section>

      <section className="verification-rail" aria-label="Settlement verification path">
        <VerificationStep complete={Boolean(match?.result)} icon={Activity} label="Final score" detail={match?.result ? `${pickedOutcome(bet, match)} market resolved` : "Result unavailable"} />
        <VerificationStep complete={Boolean(proof)} icon={Fingerprint} label="TxLINE proof" detail={proof ? "Score proof attached" : "Awaiting validation payload"} />
        <VerificationStep complete={Boolean(bet.settle_tx)} icon={LockKeyhole} label="Keeper payout" detail={bet.settle_tx ? "Settlement confirmed" : "Transaction not recorded"} />
        <VerificationStep complete={verified} icon={ShieldCheck} label="Receipt" detail={verified ? "Evidence complete" : "Incomplete legacy record"} />
      </section>

      {!verified ? (
        <div className="proof-warning"><Clock3 size={19} /><span><strong>This receipt is not cryptographically complete</strong><small>The database marks this bet settled, but a TxLINE proof and confirmed payout transaction are both required before Stakely labels it verified.</small></span></div>
      ) : null}

      <section className="receipt-ledger-details">
        <header><h2>Settlement ledger</h2><span>Recorded terms</span></header>
        <div>
          <LedgerValue label="Your position" value={userPosition(bet, walletAddress)} />
          <LedgerValue label="Opponent" value={displayName(otherUser)} />
          <LedgerValue label="Stake per wallet" value={formatUsdc(Number(bet.amount_usdc))} />
          <LedgerValue label="Escrow vault" value={formatUsdc(Number(bet.amount_usdc) * 2)} />
          <LedgerValue label="Winning outcome" value={match?.result ? outcomeLabel(match.result, match.home_team, match.away_team) : "Pending proof"} />
          <LedgerValue label="Network" value="Solana devnet" />
        </div>
      </section>

      <section className="chain-references">
        <header><h2>On-chain references</h2><span>Open any record in Solana Explorer</span></header>
        <ChainReference label="Escrow PDA" value={bet.escrow_pda} kind="address" />
        <ChainReference label="Creator funded" value={bet.create_tx} kind="tx" />
        <ChainReference label="Opponent funded" value={bet.accept_tx} kind="tx" />
        <ChainReference label="Keeper settlement" value={bet.settle_tx} kind="tx" />
      </section>

      <details className="proof-payload" open={verified}>
        <summary><span><Fingerprint size={16} /> TxLINE validation payload</span><span>{proof ? "Attached" : "Missing"}</span></summary>
        <pre>{proofPayload}</pre>
      </details>

      <footer className="receipt-document-footer">
        <span><ShieldCheck size={17} /><strong>Stakely</strong> settlement evidence</span>
        <span>Bet ID {shortKey(bet.id, 7)}</span>
      </footer>
    </article>
  );
}

function VerificationStep({ complete, icon: Icon, label, detail }: { complete: boolean; icon: typeof Activity; label: string; detail: string }) {
  return <span className={complete ? "complete" : "pending"}><i>{complete ? <Check size={14} /> : <Icon size={15} />}</i><strong>{label}</strong><small>{detail}</small></span>;
}

function LedgerValue({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function ChainReference({ label, value, kind }: { label: string; value: string | null | undefined; kind: "tx" | "address" }) {
  const [copied, setCopied] = useState(false);
  const href = value ? `https://explorer.solana.com/${kind}/${value}?cluster=devnet` : null;
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="chain-reference-row">
      <span><small>{label}</small><strong className={!value ? "missing" : ""}>{shortKey(value, 9)}</strong></span>
      <span>
        <button disabled={!value} onClick={() => void copy()} type="button" title={`Copy ${label}`} aria-label={`Copy ${label}`}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
        {href ? <a href={href} target="_blank" rel="noreferrer" title={`Open ${label} in Solana Explorer`} aria-label={`Open ${label} in Solana Explorer`}><ExternalLink size={15} /></a> : null}
      </span>
    </div>
  );
}

function ReceiptWalletGate({ onConnect, connecting }: { onConnect: () => Promise<void>; connecting: boolean }) {
  return (
    <div className="wallet-gate receipt-wallet-gate">
      <span className="wallet-gate-icon"><ReceiptText size={31} /></span>
      <div><span className="section-kicker">Wallet-owned archive</span><h2>Connect your wallet to open your receipts</h2><p>Only challenges associated with the connected wallet are returned.</p></div>
      <button type="button" onClick={() => onConnect().catch(() => undefined)}><Wallet size={17} /> {connecting ? "Connecting" : "Connect wallet"}</button>
    </div>
  );
}

function outcomeLabel(result: "home" | "draw" | "away", home: string, away: string) {
  return result === "draw" ? "Draw" : result === "home" ? home : away;
}
