# Ola's Work: Maxx Integration Handoff

**Date:** July 17, 2026
**Owners:** Ola (product and frontend), Maxx (backend and integration)
**Working branch:** `codex/ola-web-integration`

## Why This File Exists

This is the direct handoff between Ola's web work and Maxx's backend work. It records what is already built, what is still hardcoded, the API contract the frontend now expects, and the exact tasks Maxx needs to complete before the hackathon demo is end-to-end.

Mainnet is currently a **no-go for real funds**. Read `MAINNET_READINESS.md` for the verified devnet result, official mainnet addresses, security findings, and promotion checklist.

Contract v2 and the chain-first keeper are now implemented locally. They have **not** been deployed to devnet. Maxx should start with the new "Contract V2 deployment handoff" section below and must not deploy the old v1 IDL or database-only poller.

## Contract V2 deployment handoff

1. Apply `db/migrations/20260717_contract_v2.sql` to Supabase.
2. Use Node `20.18+`, Anchor `0.31.1`, and Solana `2.1.0` as pinned in `escrow/Anchor.toml`.
3. Fund the devnet deployment wallet for the approximately `2.82 SOL` upgrade buffer plus fees.
4. Build and deploy `escrow/programs/stakely-escrow`; do not deploy while the undefined-syscall warning is present.
5. Run `npm run deploy` inside `escrow/` with Circle devnet USDC and TxLINE devnet program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`.
6. Configure the API with `ESCROW_KEEPER_WALLET`, `ESCROW_PROGRAM_ID`, `SOLANA_RPC_URL`, `TXLINE_PROGRAM_ID`, `TXLINE_API_TOKEN`, and `TXLINE_NETWORK=devnet`.
7. Confirm `/api/health` returns `contractVersion: "v2"` and `txlineProofSettlement: true` before funding is enabled in the web app.
8. Run the two-wallet Circle devnet USDC flow and preserve create, accept, TxLINE proof, settlement, and receipt evidence.

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

The legacy Stakely escrow v1 program is deployed on Solana devnet. Contract v2 on this branch has not replaced it yet:

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

- `POST /api/bets` verifies the exact v2 create instruction and escrow account before writing a challenge to Supabase.
- Contract v2 enforces the TxLINE daily scores root PDA derived from the exact proof timestamp.
- Contract v2 initialization is restricted to the program upgrade authority, and the configured USDC mint and TxLINE verifier cannot be swapped after initialization.
- `PATCH /api/bets/:id/accept` verifies the exact accept instruction and funded escrow before locking a bet.
- `POST /api/bets/:id/settle` is protected by `x-keeper-secret` and requires a settlement transaction plus a Merkle proof.
- The requested winner is no longer trusted; the API derives the winner from the stored match result.
- TxLINE responses are normalized for real snapshot wrappers and arrays.
- TxLINE sequence numbers and `Participant1IsHome` are preserved.
- Score validation requests use stat keys `1,2` for the two team scores.
- The poller only considers fully funded `locked` or `live` bets for settlement, submits the TxLINE proof on-chain first, and records Supabase state only after confirmation.
- Contract v2 passes local-validator tests. The currently deployed devnet program is still v1 and must be upgraded before web funding can reopen.

## Backend Contract The Web Expects

### Health capability

`GET /api/health` must return this capability before the web app enables challenge creation:

```json
{
  "ok": true,
  "txline": "real",
  "capabilities": {
    "escrowVerification": true,
    "contractVersion": "v2",
    "txlineProofSettlement": true
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
  "refund_after": "2026-07-20T20:00:00.000Z",
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

### P0: Deploy and prove chain-first settlement

The database-only settlement implementation has been replaced on this branch. It is not live until contract v2, the database migration, and the API are deployed together.

- [x] Detect only the final TxLINE `game_finalised`, status `100`, period `100` record.
- [x] Preserve the real sequence number and request `statKeys=1,2`.
- [x] CPI into TxLINE `validateStatV2` and derive the winner inside contract v2.
- [x] Preserve `Participant1IsHome` when mapping participant scores to home/away.
- [x] Wait for Solana confirmation and escrow closure before database updates or notifications.
- [ ] Install the pinned supported compiler pair and produce a warning-free artifact.
- [ ] Deploy contract v2, apply the migration, and deploy the API together.
- [ ] Prove the flow with a real final TxLINE record and Circle devnet USDC.

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
TXLINE_NETWORK=devnet
TXLINE_PROGRAM_ID=6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
ESCROW_KEEPER_WALLET=<json-byte-array-or-base58-secret>
```

Use Node `20.18+` and a private/reliable Solana RPC for the demo if available. Keep every wallet secret and API token in Railway secrets, never in Git.

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
