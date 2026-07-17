# Stakely Hackathon Plan

## Track Decision

Stakely should primarily target the **Prediction Markets and Settlement** track, with a strong **Consumer and Fan Experiences** layer.

The current product idea is not mainly a trading-agent tool. It is a social World Cup prediction and escrow product:

- Users challenge friends around World Cup match outcomes.
- Funds are locked in Solana escrow.
- TxLINE provides live match data, scores, odds, and settlement proof inputs.
- Telegram and the app create the fan/social loop.
- AI agents can support predictions, but they should not become the core track unless we pivot fully into autonomous trading tools.

The best positioning:

> Stakely is a social P2P World Cup prediction escrow app where friends challenge each other, lock test USDC on Solana, and settle from TxLINE-verified match results, with a clear proof receipt and Telegram-powered fan loop.

## What We Are Building

Stakely should be presented as a functional devnet/testnet product, not a mockup and not a real-money gambling platform.

The demo should show:

1. A World Cup fixture loads from TxLINE.
2. A user connects a Solana wallet.
3. The user creates a match prediction challenge.
4. A friend accepts the challenge.
5. Both sides lock funds in escrow.
6. TxLINE match data determines the result.
7. The escrow settles to the winner.
8. The app shows a settlement receipt with the match result and TxLINE proof/validation reference.
9. Telegram sends the challenge, live update, and settlement alerts.

## Why This Track Fits

Prediction Markets and Settlement is the strongest fit because Stakely already includes:

- P2P prediction markets.
- Solana escrow.
- Match result settlement.
- TxLINE as the data source.
- Potential proof-based or oracle-based validation.

Consumer and Fan Experiences is the secondary angle because Stakely also includes:

- Friend challenges.
- Telegram notifications.
- Leaderboards and streaks.
- Live match status UI.
- A fan-first experience, not a purely technical trading terminal.

Trading Tools and Agents is weaker unless the product becomes:

- An autonomous odds-monitoring agent.
- An in-play market maker.
- An agent-vs-agent strategy arena.
- A tool that acts automatically without users manually approving every move.

For now, AI should support the product, not define the track.

## What Judges Will Care About

The judges will probably care less about a beautiful static UI and more about whether TxLINE meaningfully powers the product.

We need to prove:

- TxLINE data is a real live input, not decoration.
- The product updates when match data changes.
- Settlement logic is deterministic and understandable.
- Escrow state is connected to real Solana transactions, at least on devnet.
- Users can understand why a bet settled.
- The demo video clearly shows the full user flow.

The most important judging story:

> TxLINE is not just showing scores. TxLINE is the source of truth that resolves the prediction and unlocks the escrow.

## Current Code Reality

The existing repo has useful scaffolding:

- Express API.
- Supabase schema.
- Telegram routes.
- Basic TxLINE client with mock fallback.
- Anchor escrow program.
- Bot prediction routes.

But the repo is not yet submission-ready:

- The API does not truly verify on-chain escrow transactions yet.
- The database can mark bets as locked or settled without proving the escrow state.
- The settlement route is not keeper/admin-safe yet.
- TxLINE proof validation is not implemented.
- The Anchor build needs fixes before it can reliably generate IDL.
- There is no frontend yet.

So before UI polish, we need to lock the technical contract between frontend, backend, escrow, and TxLINE.

## Ola Focus

Ola should focus on the user-facing product experience, but only after the product direction is locked.

Primary responsibilities:

- Wallet connect and signed wallet auth flow.
- Main app shell and navigation.
- Match list and match detail screens.
- Create challenge flow.
- Accept challenge flow.
- Bet status dashboard.
- Settlement receipt UI.
- Leaderboard and streak UI.
- Telegram linking UI.
- AI prediction panel as an assistant feature.
- Demo-ready user flow and visual polish.

The UI should make these states obvious:

- Open challenge.
- Waiting for friend.
- Funds pending.
- Locked in escrow.
- Match live.
- Awaiting TxLINE result.
- Settled.
- Cancelled or expired.

The key UI artifact is the **settlement receipt**. It should show:

- Match.
- User picks.
- Final score/result.
- Winner.
- Payout.
- TxLINE data/proof reference.
- Escrow transaction signatures.

## Maxx / Backend Focus

Backend and escrow must validate the core trust story.

Priority backend tasks:

- Confirm the exact TxLINE endpoints and response shapes.
- Replace mock assumptions with real TxLINE response parsing.
- Implement fixture sync.
- Implement live score/odds ingestion.
- Store raw TxLINE payloads for audit/debugging.
- Implement or document proof/validation flow.
- Restrict settlement to a keeper/admin route.
- Verify create and accept escrow transactions before updating bet status.
- Add missing Supabase RPC functions or replace them with safe update logic.
- Fix Anchor build and IDL generation.
- Connect API settlement to escrow settlement.

The backend must answer:

- How do we know funds were actually locked?
- How do we know the match result is valid?
- Who is allowed to settle?
- What proof can the user see after settlement?

## Build Order

### Phase 1: Direction and Technical Contract

- Lock target track: Prediction Markets and Settlement plus social fan UX.
- Define exact MVP flow.
- List TxLINE endpoints used.
- Define frontend/backend API contract.
- Define escrow transaction lifecycle.
- Decide devnet-only asset strategy.

### Phase 2: TxLINE Audit

- Test guest JWT flow.
- Activate or confirm hackathon API access.
- Fetch fixture snapshots.
- Fetch odds snapshots.
- Test score or odds streams.
- Compare real response shapes against current code.
- Decide what proof data can be stored and shown in the UI.

### Phase 3: Backend and Escrow Correctness

- Fix settlement route authorization.
- Verify create and accept transactions.
- Fix streak update logic.
- Fix Anchor `idl-build` configuration.
- Add keeper settlement flow.
- Store proof or validation references.

### Phase 4: Ola Frontend MVP

- Build wallet sign-in.
- Build match list.
- Build create challenge flow.
- Build accept challenge flow.
- Build dashboard.
- Build settlement receipt.
- Build leaderboard.
- Build Telegram linking screen.

### Phase 5: Demo Polish

- Use mock or recorded TxLINE events if live matches are unavailable during judging.
- Make the demo flow deterministic.
- Record a clear video under 5 minutes.
- Prepare technical documentation.
- List TxLINE endpoints used.
- Explain what worked and where TxLINE integration caused friction.

## MVP Scope

Do not overbuild.

The clean MVP is:

- One market type: home win, away win, draw.
- One stake size for demo, such as 1 test USDC.
- One clean match challenge flow.
- One settlement path.
- One proof receipt.
- Telegram link and alerts if time allows.
- AI prediction panel only if core flow is already working.

## Risks

- Legal risk if framed as real-money gambling.
- TxLINE response shapes may not match the current code.
- Proof validation may take longer than expected.
- Escrow integration may not be fully wired.
- Live match availability may not line up with judging.
- A polished UI without real TxLINE-powered settlement will be weak.

Mitigation:

- Use devnet/test assets.
- Keep scope narrow.
- Make the TxLINE-powered settlement story the center of the demo.
- Record or simulate event progression when needed, but clearly explain how TxLINE powers it.

## Immediate Next Steps

1. Audit the existing backend against the real TxLINE quickstart and API docs.
2. Write a concrete API contract for the frontend.
3. Fix the backend trust gaps around settlement and escrow verification.
4. Start the frontend only after the MVP flow is technically clear.

Ola should not start with random screens. Ola should start from the demo journey:

> Connect wallet -> choose match -> challenge friend -> friend accepts -> funds locked -> TxLINE result arrives -> escrow settles -> proof receipt shown.
