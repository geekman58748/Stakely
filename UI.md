# Stakely UI Plan

## Product Shape

Stakely should feel like a **Telegram-native mobile betting/prediction companion**, not a desktop sportsbook.

The first version should be designed primarily for:

- Telegram Mini App usage.
- Mobile web usage.
- Fast match browsing.
- Quick friend challenges.
- Clear bet states.
- Trust-building settlement receipts.

Desktop can come later. The MVP should work beautifully on a phone.

## UX Positioning

Stakely is not a heavy trading terminal.

The product should feel like:

- A live World Cup match companion.
- A social challenge app between friends.
- A prediction escrow dashboard.
- A clean proof/receipt viewer after settlement.

The tone should be energetic, sharp, and social, but the UI itself should stay clear and trustworthy.

## Core Mobile Journey

The main demo flow:

1. Open Stakely inside Telegram.
2. Connect Solana wallet.
3. See live/upcoming World Cup matches.
4. Pick a match.
5. Choose home, draw, or away.
6. Set stake amount.
7. Challenge a friend or create an open challenge.
8. Friend accepts.
9. Bet moves into locked/live status.
10. TxLINE result arrives.
11. Bet settles.
12. User sees settlement receipt and Telegram notification.

## Primary Screens

### 1. Match Feed

Purpose:

- Show upcoming and live matches.
- Make it easy to pick a match and start a challenge.

Content:

- Match cards.
- Home and away teams.
- Kickoff time or live minute.
- Score if live.
- Odds for home/draw/away if available.
- Match status chip.
- Quick action: create challenge.

States:

- Upcoming.
- Live.
- Halftime.
- Finished.
- No matches.
- Loading.
- TxLINE unavailable.

### 2. Match Detail

Purpose:

- Give enough context to make a prediction.

Content:

- Team names and score.
- Kickoff/live status.
- Odds row: home, draw, away.
- Active open challenges for this match.
- CTA to create a challenge.
- Optional AI prediction panel.

### 3. Create Challenge

Purpose:

- Let a user create a simple P2P prediction.

Content:

- Selected match summary.
- Outcome selector: home, draw, away.
- Stake selector.
- Friend selector or open challenge toggle.
- Expiry/kickoff warning.
- Wallet/sign action.

Important:

- Keep this flow short.
- Avoid sportsbook complexity.
- Make the transaction state obvious.

States:

- Choosing pick.
- Choosing stake.
- Waiting for wallet signature.
- Creating challenge.
- Challenge created.
- Failed transaction/API error.

### 4. Accept Challenge

Purpose:

- Let another user accept an open or direct challenge.

Content:

- Challenger identity.
- Match.
- Challenger pick.
- User's opposite side.
- Stake amount.
- Escrow/funds explanation.
- Accept button.

States:

- Challenge open.
- Challenge already accepted.
- Challenge expired.
- Waiting for wallet signature.
- Accepted and locked.

### 5. My Bets Dashboard

Purpose:

- Give users a clean view of all active and completed bets.

Sections:

- Active.
- Live.
- Awaiting settlement.
- Settled.

Bet card content:

- Match.
- User pick.
- Opponent.
- Stake.
- Potential payout.
- Status.
- Score if live.
- CTA to view details or receipt.

Important statuses:

- Open challenge.
- Waiting for opponent.
- Waiting for escrow confirmation.
- Locked.
- Match live.
- Awaiting TxLINE result.
- Settled.
- Cancelled.
- Disputed/error.

### 6. Settlement Receipt

Purpose:

- Prove why the bet settled.

This is one of the most important screens for the hackathon.

Content:

- Final match score.
- Winning side.
- User pick.
- Opponent pick.
- Winner.
- Payout.
- Bet ID.
- Create transaction signature.
- Accept transaction signature.
- Settle transaction signature.
- TxLINE data/proof reference.
- Timestamp.

Design goal:

- It should feel like a clean receipt, not a debug log.
- The proof section can be expandable.
- Show enough detail for judges to understand TxLINE powered settlement.

### 7. Leaderboard

Purpose:

- Add social retention.

Content:

- Rank.
- Display name.
- Telegram handle if linked.
- Streak.
- Total wins/losses.
- Win percentage.

Mobile pattern:

- Compact rows.
- Sticky top user card for current user if logged in.

### 8. Telegram Link

Purpose:

- Connect wallet identity to Telegram identity.

Content:

- Link status.
- Generated 6-character code.
- Instruction to send `/link <code>` to the bot.
- Code expiry timer.
- Refresh code action.

### 9. AI Prediction Panel

Purpose:

- Support the user with fun prediction context.

Content:

- Bot archetype.
- Prediction.
- Confidence.
- Short analysis.
- Disclaimer.
- CTA: use this pick.

Important:

- This should not dominate the MVP.
- It is a support layer, not the core product.

## Component Inventory

### Navigation

- Bottom tab bar.
- Header with wallet status.
- Back button.
- Match status filter tabs.

Suggested tabs:

- Matches.
- Bets.
- Leaderboard.
- Profile.

### Match Components

- MatchCard.
- TeamRow.
- ScorePill.
- MatchStatusChip.
- OddsStrip.
- LiveMinuteBadge.
- TxLinePoweredBadge.

### Bet Components

- BetCard.
- BetStatusChip.
- OutcomeSelector.
- StakeStepper.
- FriendSelector.
- OpenChallengeToggle.
- EscrowStateIndicator.
- TransactionProgress.
- PayoutPreview.

### Receipt Components

- SettlementReceipt.
- ProofSummary.
- ProofDetailsAccordion.
- TransactionLink.
- ResultBreakdown.

### Social Components

- UserAvatar.
- TelegramHandle.
- StreakBadge.
- LeaderboardRow.
- EmptyStateInvite.

### Wallet Components

- ConnectWalletButton.
- WalletBadge.
- SignMessagePrompt.
- TransactionPendingModal.
- ErrorToast.

## Mobile Interaction Principles

- One primary action per screen.
- Big tap targets.
- Use bottom sheets for create/accept flows.
- Use segmented controls for match filters.
- Use chips for statuses, not long explanations.
- Use cards for individual matches and bets only.
- Avoid dense desktop tables.
- Keep the proof receipt readable but expandable.

## Visual Direction

The design should feel:

- Mobile-native.
- Sporty.
- Social.
- Trustworthy.
- Slightly playful.
- Not casino-heavy.
- Not corporate fintech-heavy.

Avoid:

- Dark blurry gambling UI.
- Neon casino overload.
- Huge desktop dashboards.
- Generic crypto gradients.
- Too much purple/blue.
- Complicated trading terminal layouts.

Good visual ingredients:

- Clean match cards.
- Strong typography.
- Team color accents.
- Clear status chips.
- Receipt-like proof screen.
- Telegram-native compact spacing.
- Small motion for live status and transaction progress.

## Design References To Research

### Dribbble Search Terms

Search these on Dribbble:

- `sports app mobile UI`
- `football match app mobile`
- `live score app mobile UI`
- `sports betting app mobile`
- `prediction app mobile UI`
- `fantasy football mobile app`
- `sports dashboard mobile`
- `betting slip mobile UI`
- `mobile wallet app UI`
- `crypto wallet mobile app`
- `transaction receipt mobile UI`
- `leaderboard mobile UI`
- `telegram mini app UI`
- `web3 sports app`
- `sports social app mobile`
- `match center mobile UI`

### Behance Search Terms

- `sports mobile app case study`
- `football app UX case study`
- `sports betting UX`
- `fantasy sports app design`
- `crypto wallet mobile UX`
- `prediction market app design`
- `live score app redesign`

### Mobbin / App Screens To Study

Look for flows from:

- ESPN.
- FotMob.
- OneFootball.
- Sofascore.
- Flashscore.
- Sleeper.
- DraftKings.
- FanDuel.
- Polymarket.
- Phantom.
- Backpack.
- Revolut.
- Cash App.

Study these patterns:

- Match cards.
- Live score rows.
- Bet slips.
- Wallet transaction states.
- Receipt screens.
- Leaderboards.
- Profile and settings.

### Telegram Mini App References

Research:

- Telegram Mini App design examples.
- TON Mini App UI.
- Telegram bot web app interfaces.
- Mobile-first crypto mini apps.
- Compact onboarding inside Telegram.

Search terms:

- `Telegram Mini App design`
- `Telegram WebApp UI`
- `TON mini app UI`
- `Telegram wallet mini app`
- `Telegram game mini app UI`

## UI Inspiration Angles

### Direction A: Live Match Companion

Best for:

- Consumer and fan experience.
- Fast mobile engagement.

Key screens:

- Live match feed.
- Match detail.
- Score updates.
- Friend challenge CTA.

Vibe:

- Sofascore/FotMob meets Telegram.

### Direction B: Social Challenge App

Best for:

- Stakely's friend-to-friend identity.

Key screens:

- Open challenges.
- Challenge friend.
- My bets.
- Telegram notifications.

Vibe:

- Sleeper meets Cash App.

### Direction C: Proof-Based Prediction Market

Best for:

- Hackathon judging.
- TxLINE settlement story.

Key screens:

- Escrow states.
- Settlement receipt.
- TxLINE proof summary.
- Transaction links.

Vibe:

- Polymarket meets Phantom receipt.

Recommended blend:

> Use Direction A for the match feed, Direction B for challenge creation, and Direction C for settlement receipts.

## First UI Milestone

The first clickable prototype should include:

1. Match feed.
2. Match detail.
3. Create challenge bottom sheet.
4. My bets dashboard.
5. Settlement receipt.
6. Telegram link screen.

Do not start with:

- Landing page.
- Desktop dashboard.
- Complex AI agent builder.
- Full profile customization.
- Advanced betting markets.

## Open Design Questions

- Should the first surface be `Matches` or `My Bets`?
- Should direct friend challenge use wallet address first, Telegram handle later, or both?
- How much proof detail should be visible by default?
- Should the app show odds prominently or keep them secondary?
- Should AI prediction be a card on match detail or a separate tab?
- Should the product language say "bet", "challenge", "prediction", or "stake"?

## Current Recommendation

Start with a mobile-first Telegram Mini App prototype.

Main tab order:

1. Matches.
2. Bets.
3. Leaderboard.
4. Profile.

Core design story:

> Pick a World Cup match, challenge a friend, lock test USDC, watch the match, and receive a TxLINE-powered settlement receipt.
