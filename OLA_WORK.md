# Ola's Work: Maxx Integration Handoff

**Date:** July 15, 2026
**Owners:** Ola (product and frontend), Maxx (backend and integration)
**Working branch:** `codex/ola-web-integration`

## Why This File Exists

This is the direct handoff between Ola's web work and Maxx's backend work. It records what is already built, what is still hardcoded, the API contract the frontend now expects, and the exact tasks Maxx needs to complete before the hackathon demo is end-to-end.

Mainnet is currently a **no-go for real funds**. Read `MAINNET_READINESS.md` for the verified devnet result, official mainnet addresses, security findings, and promotion checklist.

The immediate target is a judge-ready flow:

1. A user finds a real TxLINE fixture.
2. The user connects a Solana wallet.
3. The user creates a challenge and funds a Stakely escrow on devnet.
4. A second wallet accepts and funds the same escrow.
5. TxLINE provides the final score and validation proof.
6. The keeper validates the result and settles the escrow on-chain.
7. Stakely displays a permanent settlement receipt.

## Current Status

The approved web design has been translated into a working React app in `web/`. The match flow is connected to the API, and the challenge builder can construct and submit a real devnet escrow transaction through an injected Solana wallet.

The Stakely escrow program is deployed on Solana devnet:

- **Program ID:** `J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai`
- **Explorer:** https://explorer.solana.com/address/J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai?cluster=devnet
- **TxLINE validation program:** `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`

The current production API is still the older deployment. The new frontend intentionally disables challenge creation and acceptance until `/api/health` confirms that the escrow-verification contract is live.

## What Ola Has Built

### Web pages

| Route | Page | Status | Data source |
| --- | --- | --- | --- |
| `/#discover` | Discover | Functional approved design | Real TxLINE fixtures and `GET /api/bets/open` |
| `/#leaderboard` | Leaderboard | Pixel-focused approved design | Showcase data is hardcoded |
| `/#matches` | Matches | Functional | Real `GET /api/matches` |
| `/#match/:id` | Match detail | Functional | Real match, odds, open bets, create/accept wallet, and escrow flow |
| `/#my-bets` | My Bets | Functional | Real wallet-authenticated `GET /api/bets?role=mine` |
| `/#receipts/:id?` | Settlement Receipts | Functional | Derived from settled wallet bets, TxLINE proof, and Solana transaction fields |

### Frontend integration

- Real API health and capability checks.
- Real fixture loading, filters, loading states, empty states, and errors.
- Approved Discover composition mapped to live TxLINE fixtures and published open challenges.
- Phantom/Solflare injected wallet connection.
- Devnet escrow PDA derivation and Anchor instruction construction.
- Create-challenge transaction followed by API publication.
- Second-wallet challenge acceptance, on-chain funding, and API confirmation.
- Canonical Supabase UUIDs are compacted to 32 characters only for Solana PDA seeds, avoiding the chain's seed-length limit while preserving database IDs.
- My Bets filters for open, locked/live, settled, and cancelled records.
- Proof-aware receipts that only show `Verified` when both the TxLINE proof and settlement transaction are present.
- Receipt deep links, Solana Explorer references, copy controls, and clear incomplete legacy states.
- Safety gate that shows `Backend update pending` while the old API is live.
- Responsive desktop and 390px mini-app layouts for the portfolio and receipt workflow.

### API and escrow work included on this branch

- `POST /api/bets` verifies the create transaction and escrow account before writing a challenge to Supabase.
- `PATCH /api/bets/:id/accept` verifies the accept transaction and funded escrow before locking a bet.
- `POST /api/bets/:id/settle` is protected by `x-keeper-secret` and requires a settlement transaction plus a Merkle proof.
- The requested winner is no longer trusted; the API derives the winner from the stored match result.
- TxLINE responses are normalized for real snapshot wrappers and arrays.
- TxLINE sequence numbers and `Participant1IsHome` are preserved.
- Score validation requests use stat keys `1,2` for the two team scores.
- The poller only considers fully funded `locked` or `live` bets for settlement.
- The escrow workspace builds with Anchor, and the devnet program is initialized with a keeper authority.

## Backend Contract The Web Expects

### Health capability

`GET /api/health` must return this capability before the web app enables challenge creation:

```json
{
  "ok": true,
  "txline": "real",
  "capabilities": {
    "escrowVerification": true,
    "contractVersion": "v1"
  }
}
```

`txline` may be `mock` during local work, but the hackathon deployment must report `real` with a valid rotated token.

### Create challenge

`POST /api/bets` now expects:

```json
{
  "id": "uuid-v4",
  "match_id": "txline-fixture-id",
  "creator_side": "home",
  "amount_usdc": 10,
  "escrow_pda": "solana-address",
  "create_tx": "confirmed-devnet-signature"
}
```

The request also requires the existing wallet authentication headers.

### Accept challenge

`PATCH /api/bets/:id/accept` now expects:

```json
{
  "accept_tx": "confirmed-devnet-signature"
}
```

### Record keeper settlement

`POST /api/bets/:id/settle` requires:

- Header: `x-keeper-secret: <KEEPER_API_SECRET>`
- A confirmed `settle_tx`
- The TxLINE `merkle_proof`

## What I Need From Maxx

### P0: Deploy and configure this backend

- [ ] Review the API and escrow changes on `codex/ola-web-integration`.
- [ ] Deploy the branch's `api/` service to Railway.
- [ ] Rotate the TxLINE API token that was previously shared in plain text.
- [ ] Put only the rotated token in Railway, never in Git or a message/document.
- [ ] Set the required Railway environment variables listed below.
- [ ] Confirm the deployed `/api/health` returns `txline: "real"` and `escrowVerification: true`.
- [ ] Tell Ola when the health capability is live so the frontend safety gate opens.

### P0: Replace database-only settlement

This is the most important remaining backend issue.

The current `settleBetsForMatch` function in `api/src/lib/poller.ts` still marks bets as settled directly in Supabase. It does **not** yet validate the TxLINE proof on-chain or call Stakely's `settle_escrow` instruction. That means the database can say `settled` while funds remain in escrow.

Maxx needs to replace that path with a real keeper worker:

- [ ] Detect the final TxLINE `game_finalised` event or final score snapshot.
- [ ] Persist the actual TxLINE sequence number. Never substitute `0`.
- [ ] Request `GET /api/scores/stat-validation` with `fixtureId`, real `seq`, and `statKeys=1,2`.
- [ ] Verify the returned proof against the TxLINE validation program on devnet.
- [ ] Preserve `Participant1IsHome` when mapping participant scores to Stakely's home/away outcome.
- [ ] Determine the winner from the verified result.
- [ ] Sign and send Stakely's `settle_escrow` instruction with the keeper wallet.
- [ ] Wait for Solana confirmation.
- [ ] Record `settle_tx`, proof, winner, and settlement time through the protected settle endpoint.
- [ ] Send Telegram settlement notifications only after the on-chain payout is confirmed.

The poller must never mark a bet settled before the escrow payout succeeds.

### P0: Run a real two-wallet devnet test

- [ ] Use two wallets with devnet SOL and devnet USDC.
- [ ] Wallet A creates and funds a challenge.
- [ ] Confirm the API rejects a fake transaction or wrong escrow PDA.
- [ ] Wallet B accepts and funds the escrow.
- [ ] Confirm the API rejects a fake accept transaction.
- [ ] Feed a final TxLINE fixture/proof through the keeper.
- [ ] Confirm the winner receives the payout on-chain.
- [ ] Confirm the bet, match proof, streaks, and receipt are correct in Supabase.
- [ ] Send Ola the fixture ID, bet ID, escrow PDA, and three transaction signatures.

### P1: Protect operational endpoints

- [ ] Add admin/keeper protection to `POST /api/matches/sync`; it should not be public in production.
- [ ] Confirm rate limits and useful error responses on wallet-authenticated bet routes.
- [ ] Confirm the Supabase `increment_streak_win` and `reset_streak_loss` RPCs exist in production.
- [ ] Confirm duplicate create, accept, and settle calls are idempotent or safely rejected.

## Railway Environment

Set these values in Railway:

```dotenv
ESCROW_PROGRAM_ID=J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai
SOLANA_RPC_URL=https://api.devnet.solana.com
KEEPER_API_SECRET=<strong-random-secret>
TXLINE_API_TOKEN=<rotated-token>
```

Use a private/reliable Solana RPC for the demo if available. The keeper wallet secret will also need a Railway secret when the worker is implemented. Agree on one environment-variable name and keep it out of Git.

## End-to-End Definition of Done

Ola is unblocked for the complete UI when all of these are true:

- [ ] Railway is running the new API contract.
- [ ] `/api/health` reports real TxLINE and escrow verification.
- [ ] A real fixture appears in the web app.
- [ ] Two wallets can fund one escrow through the web/API flow.
- [ ] A verified TxLINE result causes an on-chain payout.
- [ ] The API stores the settlement transaction and proof.
- [ ] The same result appears in My Bets, Receipts, Leaderboard, and Telegram.
- [ ] No database-only settlement path remains.

## Ola's Next UI Work

While Maxx completes the P0 backend work, Ola can continue without waiting on visual implementation:

- Connect Leaderboard to settled user records when that data is reliable.
- Adapt the stable web flow into the Telegram Mini App viewport and Telegram SDK.
- Polish mobile, loading, empty, error, wallet-rejection, and transaction-pending states.

Discover and the two-wallet Accept Challenge path are implemented on this branch. Their real transaction controls remain safely gated until Maxx deploys the new Railway capability response.

## Coordination Rule

Before either of us changes an API request or response shape, update this file and confirm the change. Ola owns the user experience and frontend integration; Maxx owns deployment, TxLINE ingestion, keeper settlement, and backend reliability. The shared goal is one provable end-to-end flow, not separate demos that only look connected.
