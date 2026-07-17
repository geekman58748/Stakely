# Stakely Web App UI Map

## Design Direction

The web app should take inspiration from the attached prediction-market references:

- **Image 6 style:** dark market discovery, category navigation, search, filter, market cards, wallet/status footer.
- **Image 7 style:** premium leaderboard, trader/user rankings, dense data table, performance cards.
- **Stakely logo:** sharp white `S` mark on black, used as the core brand signal.

The web product should feel like:

- A World Cup prediction market dashboard.
- A social challenge hub.
- A proof-based settlement product.
- A judge-friendly demo interface.

It should not feel like:

- A casino homepage.
- A generic sportsbook.
- A bloated analytics terminal.
- A marketing landing page.

## Visual Mood

Use a premium dark interface:

- Base: near-black / charcoal.
- Panels: dark graphite with subtle borders.
- Primary action: electric blue or blue-violet.
- Positive/proof accent: mint green.
- World Cup/category accent: warm gold.
- Risk/loss accent: muted rose.
- Text: white, soft gray, dim gray.

Keep the palette controlled. The web app can be dense, but it should remain calm and legible.

## Global App Shell

### Top Navigation

Left:

- Stakely logo mark.
- Primary nav:
  - Discover
  - Matches
  - My Bets
  - Leaderboard
  - Receipts

Right:

- Search input.
- Connect Wallet / Wallet badge.
- Telegram linked status.
- Profile avatar.

### Bottom Status Bar

Inspired by Image 6.

Content:

- API status: Operational.
- TxLINE status.
- Wallet network: Devnet.
- Active bets count.
- Pending settlements count.
- Current wallet balance.

This helps judges immediately understand that the app is live and connected.

## Routes

### `/discover`

Purpose:

- Main web entry point.
- Show World Cup prediction markets and social challenges.

Layout:

- Top nav.
- Category row.
- Large hero market panel.
- Right-side live/news panel.
- Market card grid.
- Open challenge cards.

Sections:

1. World Cup category strip.
2. Featured market: World Cup Winner or Live Match Challenge.
3. Live TxLINE ticker.
4. Top matches.
5. Open friend challenges.
6. Recent settlements.

Key components:

- CategoryNav.
- FeaturedMarketPanel.
- TxLineTicker.
- MarketCard.
- OpenChallengeCard.
- LiveBadge.
- ProofBadge.

### `/matches`

Purpose:

- Browse upcoming, live, and finished matches.

Layout:

- Header: Matches.
- Filters: All, Live, Upcoming, Finished.
- Search/filter controls.
- Match grid/list.

Match card content:

- Fixture.
- Kickoff/live minute.
- Score.
- Home/draw/away odds.
- Number of open challenges.
- CTA: Create Challenge.
- TxLINE synced indicator.

### `/matches/:id`

Purpose:

- Detailed match page where users create or accept challenges.

Layout:

- Match header with teams, score, status.
- Odds and prediction panel.
- Open challenges list.
- Create challenge module.
- Live events / TxLINE updates.

Sections:

- MatchSummaryHero.
- OutcomeSelector.
- CreateChallengePanel.
- OpenChallengesTable.
- TxLineFeed.
- AIInsightCard.

### `/bets`

Purpose:

- User's bet/challenge dashboard.

Layout:

- Summary cards at top.
- Tabs: Active, Live, Awaiting Settlement, Settled.
- Bet list/table.

Bet row content:

- Match.
- User pick.
- Opponent.
- Stake.
- Status.
- Escrow state.
- Result if available.
- Receipt action.

Important:

- The table should be clear enough for desktop.
- The same data should collapse into cards on mobile.

### `/bets/:id`

Purpose:

- Show the lifecycle of one challenge.

Layout:

- Bet summary.
- Timeline.
- Participants.
- Escrow details.
- Match result.
- Actions.

Timeline states:

1. Challenge created.
2. Opponent accepted.
3. Funds locked.
4. Match live.
5. TxLINE result received.
6. Settlement complete.

### `/bets/:id/receipt`

Purpose:

- Judge-facing proof page.
- This is one of the most important web screens.

Layout:

- Receipt header.
- Final score.
- Winner/payout.
- TxLINE proof summary.
- Transaction signatures.
- Expandable raw proof payload.

Receipt content:

- Bet ID.
- Match ID.
- Final result.
- Winner.
- Stake and payout.
- Create transaction.
- Accept transaction.
- Settle transaction.
- TxLINE proof timestamp.
- Merkle/proof payload summary.

Design:

- Make it feel like a financial receipt plus sports result card.
- Use a green verified/proof accent.
- Keep raw JSON collapsed by default.

### `/leaderboard`

Purpose:

- Social proof and retention.
- Inspired by Image 7.

Layout:

- Hero cards for top 3 users.
- Search and filters.
- Ranking table.

Columns:

- Rank.
- User.
- Telegram status.
- Streak.
- Win rate.
- Wins/losses.
- Volume.
- Open bets.
- Best win.

For Stakely, do not copy trading PNL too literally. Use social sports metrics.

### `/profile`

Purpose:

- Wallet and Telegram setup.

Sections:

- Wallet identity.
- Telegram link status.
- Display name.
- Streak stats.
- Recent receipts.

## Primary Web Components

### Shell

- AppTopNav.
- AppStatusBar.
- WalletButton.
- SearchBox.
- NetworkBadge.
- TelegramStatusBadge.

### Discovery

- CategoryNav.
- FeaturedMarketPanel.
- MarketCard.
- ChallengeCard.
- LiveTicker.
- TxLinePoweredBadge.

### Matches

- MatchCard.
- MatchGrid.
- MatchStatusChip.
- OddsStrip.
- TeamPair.
- LiveScorePill.

### Bets

- BetTable.
- BetCard.
- BetStatusChip.
- EscrowStatusIndicator.
- BetLifecycleTimeline.
- ParticipantPair.

### Receipts

- SettlementReceipt.
- ProofSummaryCard.
- TransactionSignatureRow.
- RawProofAccordion.
- VerifiedResultBadge.

### Leaderboard

- TopUserCard.
- LeaderboardTable.
- StreakBadge.
- WinRatePill.
- RankBadge.

## Screen Priority

Build/design in this order:

1. Discover dashboard.
2. Match detail/create challenge.
3. My Bets dashboard.
4. Settlement receipt.
5. Leaderboard.
6. Profile/Telegram link.

## Version A: Discovery-First Web App

This version emphasizes:

- Market discovery.
- World Cup category.
- Featured match/challenge.
- Open challenges.
- Live TxLINE status.

Best for:

- First impression.
- Hackathon demo opening.
- Showing product scope quickly.

## Version B: Trust/Performance Web App

This version emphasizes:

- Leaderboard.
- User performance.
- Bet history.
- Receipts.
- Proof/settlement credibility.

Best for:

- Showing retention/social layer.
- Showing settlement and TxLINE value.
- Making the app feel serious and credible.

## Responsive Behavior

Desktop:

- Full nav.
- 3-column market grid.
- Tables for leaderboards and bets.
- Right-side activity/proof panel where useful.

Tablet:

- 2-column grid.
- Compact nav.
- Tables become semi-card layouts.

Mobile / Telegram:

- Bottom nav.
- Single-column cards.
- Create challenge as bottom sheet.
- Receipt remains full-page with collapsible proof details.

## Copy Direction

Use short, product-native labels:

- Discover
- World Cup
- Live
- Open Challenges
- My Bets
- Proof
- Receipt
- Locked
- Settled
- TxLINE Verified

Avoid overly explanatory UI text. The docs/demo can explain; the product should feel natural.

## Design Notes For Image Generation

Version A mockup should show:

- Dark Stakely top nav.
- Logo at top-left.
- World Cup category highlighted.
- Search/filter controls.
- Large featured World Cup match/challenge panel.
- Market/challenge cards.
- Right-side live TxLINE activity panel.
- Bottom operational status bar.

Version B mockup should show:

- Leaderboard page.
- Top 3 user cards.
- Ranking table.
- Streak, win rate, volume, open bets.
- Receipt/proof side panel or recent settlement module.
- Stakely branding and dark premium styling.
