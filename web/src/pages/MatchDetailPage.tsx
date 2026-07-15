import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Swords,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { stakelyApi, type Bet, type BetSide, type Match } from "../lib/api";
import { createEscrowChallenge, ESCROW_PROGRAM_ID, getEscrowProgramStatus } from "../lib/escrow";
import { useWallet } from "../providers/WalletProvider";

type SubmitState = "idle" | "wallet" | "funding" | "syncing" | "done";

export function MatchDetailPage({ matchId }: { matchId: string }) {
  const wallet = useWallet();
  const [match, setMatch] = useState<Match | null>(null);
  const [openBets, setOpenBets] = useState<Bet[]>([]);
  const [programReady, setProgramReady] = useState<boolean | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<BetSide>("home");
  const [amount, setAmount] = useState(1);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdBet, setCreatedBet] = useState<Bet | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [matchData, betsData, program, health] = await Promise.all([
        stakelyApi.match(matchId, signal),
        stakelyApi.openBets(matchId, signal),
        getEscrowProgramStatus(),
        stakelyApi.health(signal),
      ]);
      setMatch(matchData);
      setOpenBets(betsData);
      setProgramReady(program.deployed);
      setApiReady(Boolean(health.capabilities?.escrowVerification));
    } catch (loadError) {
      if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : "Could not load this match.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const options = useMemo(() => match ? [
    { side: "home" as const, label: match.home_team, odds: match.odds?.homeOdds ?? match.home_odds },
    { side: "draw" as const, label: "Draw", odds: match.odds?.drawOdds ?? match.draw_odds },
    { side: "away" as const, label: match.away_team, odds: match.odds?.awayOdds ?? match.away_odds },
  ] : [], [match]);

  const createChallenge = async () => {
    if (!match || submitState !== "idle") return;
    setSubmitError(null);
    setCreatedBet(null);
    try {
      if (!wallet.connected || !wallet.wallet || !wallet.publicKey) {
        setSubmitState("wallet");
        await wallet.connect();
        setSubmitState("idle");
        return;
      }

      setSubmitState("funding");
      const betId = crypto.randomUUID();
      const escrow = await createEscrowChallenge({
        wallet: wallet.wallet,
        publicKey: wallet.publicKey,
        betId,
        amountUsdc: amount,
        side,
      });

      setSubmitState("syncing");
      const auth = await wallet.getAuthHeaders();
      await stakelyApi.registerUser(auth);
      const bet = await stakelyApi.createBet(auth, {
        id: betId,
        match_id: match.id,
        creator_side: side,
        amount_usdc: amount,
        escrow_pda: escrow.escrowPda,
        create_tx: escrow.signature,
      });
      setOpenBets((current) => [bet, ...current]);
      setCreatedBet(bet);
      setSubmitState("done");
    } catch (challengeError) {
      setSubmitState("idle");
      setSubmitError(challengeError instanceof Error ? challengeError.message : "Challenge creation failed.");
    }
  };

  if (loading) return <AppShell activePage="matches"><div className="match-detail-page"><div className="match-detail-skeleton" /></div></AppShell>;
  if (error || !match) return (
    <AppShell activePage="matches">
      <div className="match-detail-page"><div className="data-state error-state"><Activity size={30} /><h2>Match unavailable</h2><p>{error}</p><button onClick={() => load()} type="button"><RefreshCw size={16} /> Try again</button></div></div>
    </AppShell>
  );

  const closed = ["finished", "cancelled", "postponed"].includes(match.status);

  return (
    <AppShell activePage="matches">
      <div className="match-detail-page">
        <a className="back-link" href="#matches"><ArrowLeft size={17} /> All matches</a>

        <section className="match-hero">
          <header>
            <span className={`fixture-status status-${match.status}`}><Activity size={13} /> {match.status}</span>
            <span>TxLINE fixture #{match.id}</span>
          </header>
          <div className="match-scoreboard">
            <MatchTeam name={match.home_team} code={match.home_team_code} />
            <div>
              <strong>{closed || match.status === "live" || match.status === "halftime" ? `${match.home_score} - ${match.away_score}` : "VS"}</strong>
              <time>{formatMatchTime(match.kickoff_at)}</time>
            </div>
            <MatchTeam name={match.away_team} code={match.away_team_code} />
          </div>
          <div className="match-trust-rail">
            <span><ShieldCheck size={17} /> TxLINE fixture feed</span>
            <span><LockKeyhole size={17} /> Solana escrow</span>
            <span className={programReady && apiReady ? "ready" : "not-ready"}><CheckCircle2 size={17} /> {programReady && apiReady ? "Funding path ready" : "Backend update pending"}</span>
          </div>
        </section>

        <div className="match-workspace">
          <section className="challenge-builder">
            <header><span><Swords size={21} /></span><div><h2>Create a challenge</h2><p>Choose your outcome and lock matching devnet USDC.</p></div></header>

            <div className="challenge-field">
              <label>Pick an outcome</label>
              <div className="outcome-selector">
                {options.map((option) => (
                  <button className={side === option.side ? "active" : ""} key={option.side} onClick={() => setSide(option.side)} type="button">
                    <span>{option.label}</span><b>{formatOdds(option.odds)}</b>
                  </button>
                ))}
              </div>
            </div>

            <div className="challenge-field">
              <label htmlFor="challenge-amount">Stake per person</label>
              <div className="amount-stepper">
                <button type="button" onClick={() => setAmount((current) => Math.max(1, current - 1))} aria-label="Decrease stake"><Minus size={17} /></button>
                <span><CircleDollarSign size={19} /><input id="challenge-amount" min="1" max="100" step="1" type="number" value={amount} onChange={(event) => setAmount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /><b>USDC</b></span>
                <button type="button" onClick={() => setAmount((current) => Math.min(100, current + 1))} aria-label="Increase stake"><Plus size={17} /></button>
              </div>
            </div>

            <div className="challenge-receipt-preview">
              <span><small>Your stake</small><strong>{amount.toFixed(2)} USDC</strong></span>
              <span><small>Opponent matches</small><strong>{amount.toFixed(2)} USDC</strong></span>
              <span><small>Winner receives</small><strong className="green-text">{(amount * 2).toFixed(2)} USDC</strong></span>
            </div>

            {submitError ? <p className="challenge-error" role="alert">{submitError}</p> : null}
            {createdBet ? <div className="challenge-success"><CheckCircle2 size={20} /><span><strong>Challenge funded</strong><small>Waiting for an opponent to match your stake.</small></span></div> : null}

            <button className="challenge-submit" disabled={closed || !programReady || !apiReady || submitState === "funding" || submitState === "syncing" || submitState === "done"} onClick={createChallenge} type="button">
              {wallet.connected ? <LockKeyhole size={18} /> : <Wallet size={18} />}{submitLabel(submitState, wallet.connected, closed, apiReady)}
            </button>
            <p className="challenge-note">The challenge is published only after the escrow transaction confirms on devnet.</p>
          </section>

          <section className="open-challenges">
            <header><div><h2>Open challenges</h2><p>Funded offers waiting for an opponent.</p></div><span>{openBets.length}</span></header>
            {openBets.length === 0 ? (
              <div className="empty-challenges"><Swords size={28} /><strong>No funded challenges yet</strong><p>Be the first person to open one for this match.</p></div>
            ) : openBets.map((bet) => <OpenChallenge key={bet.id} bet={bet} match={match} />)}
          </section>
        </div>

        <section className="settlement-path">
          <header><h2>How this match settles</h2><a href={`https://explorer.solana.com/address/${ESCROW_PROGRAM_ID.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer">View program <ExternalLink size={15} /></a></header>
          <div>
            <span><b>01</b><strong>Both wallets fund</strong><small>Equal USDC stakes enter the escrow vault.</small></span>
            <span><b>02</b><strong>TxLINE finalizes</strong><small>The final score and validation proof determine the outcome.</small></span>
            <span><b>03</b><strong>Keeper settles</strong><small>The winner receives the vault and a proof receipt.</small></span>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function MatchTeam({ name, code }: { name: string; code: string | null }) {
  const displayCode = code && /^[a-z]{2,3}$/i.test(code) ? code.toUpperCase() : name.slice(0, 3).toUpperCase();
  return <span className="match-hero-team"><b>{displayCode}</b><strong>{name}</strong></span>;
}

function OpenChallenge({ bet, match }: { bet: Bet; match: Match }) {
  const label = bet.creator_side === "draw" ? "Draw" : bet.creator_side === "home" ? match.home_team : match.away_team;
  const creator = bet.creator?.display_name || `${bet.creator?.wallet_address?.slice(0, 4) ?? "Anon"}...${bet.creator?.wallet_address?.slice(-4) ?? ""}`;
  return (
    <article className="open-challenge-row">
      <span className="challenge-avatar">{creator.slice(0, 2).toUpperCase()}</span>
      <span><strong>{creator}</strong><small>{bet.creator?.streak ?? 0} win streak</small></span>
      <span><small>Picked</small><strong>{label}</strong></span>
      <span><small>Stake</small><strong>{Number(bet.amount_usdc).toFixed(2)} USDC</strong></span>
      <button type="button" disabled>Accept</button>
    </article>
  );
}

function submitLabel(state: SubmitState, connected: boolean, closed: boolean, apiReady: boolean | null) {
  if (closed) return "Challenges closed";
  if (apiReady === false) return "Backend update pending";
  if (state === "wallet") return "Connecting wallet";
  if (state === "funding") return "Confirm in wallet";
  if (state === "syncing") return "Publishing challenge";
  if (state === "done") return "Challenge live";
  return connected ? "Fund challenge" : "Connect wallet";
}

function formatOdds(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "--";
}

function formatMatchTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
