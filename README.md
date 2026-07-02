# Stakely Project Plan

## Product Overview

Stakely is a peer-to-peer (P2P) sports wagering web app for the World Cup. Users create and accept micro wagers (as low as $1) directly against friends using stablecoins (USDC/USDT) on Solana. Wagers are held in a secure escrow smart contract and settled automatically via decentralized data oracles (TxlineOdds). The app includes a companion Telegram bot for social mapping and real-time match alerts, alongside a gamified AI Agent track where users customize autonomous prediction bots to analyze games and trigger bets.

---

## Track 1: P2P Betting & Social Loop

### 1. Simplified Betting Engine
- **Markets supported:** Home Win, Away Win, Draw only (no prop bets — keeps oracle payload and gas costs low)
- **Escrow flow:**
  1. User A creates a bet, enters counterparty's username, deposits $1 into escrow
  2. User B gets an alert, accepts, matches the $1 deposit
  3. Funds locked in smart contract
  4. At final whistle, oracle pushes result, contract auto-transfers $2 to winner

### 2. Telegram Social Bridge
- **Username mapping:** OAuth or deep-link onboarding (`t.me/YourBot?start=id`) maps wallet ↔ `@username` ↔ Telegram Chat ID
- **In-app search:** Search a friend's Telegram username in the web app to send a bet request
- **Automated alerts via bot:**
  - Challenge Received (link to accept)
  - Match Kick-off (funds locked confirmation)
  - Match Event (goal alerts affecting active bet)
  - Settlement (payout notice + one-click "Double or Nothing")

### 3. Core Retention Features
- **Negotiation:** "Counter" button to change team/amount before signing
- **Visual bet statuses:** Challenged (countdown timer) → Locked & Loaded → Sweat Zone (live ticker) → Crowned / Ripped
- **Streaks & leaderboards:** Win streak tracked in DB, 🔥 emoji next to username, resets on loss, public leaderboard ranked by streak

---

## Track 2: Custom AI Battle Agents

### 1. Bot "Chassis" Selection
Users pick one of three archetypes governing logic parameters:
- **The Degenerate** — aggressive, prioritizes long odds/high risk
- **The Professor** — quantitative, historical metrics, safe margins
- **The Fanboy** — emotionally biased toward historic heavyweight teams

### 2. Training & Upgrading Mechanics
Saved as a JSON profile per user:
- **Risk Spectrum Slider:** 1–10
- **Data Input Toggles:** e.g. Historical Head-to-Head Stats, Twitter/X Fan Sentiment Scraping
- **Logic Weights:** math/data vs. social hype balance

### 3. Execution Loop
1. **Match Prompt:** server pulls upcoming match data + fan sentiment, combines with user's bot JSON config into an LLM prompt
2. **Output:** LLM returns structured JSON — Prediction (Home/Away/Draw), Confidence %, Technical Analysis, persona-specific NFA disclaimer
3. **Action:** frontend shows the breakdown; CTA button lets user approve a $1 escrow bet based on the agent's prediction

---

## Roles

### Maxx
1. Backend (API, server infra)
2. Blockchain / escrow smart contract & payments (Solana, USDC/USDT)
3. Telegram bot integration (username & social layer, alerts)
4. Database (schema, wallet↔Telegram mapping, streak tracking, bot configs)

### Ola
1. UI/UX (Rainbow-inspired design system)
2. Wallet sign-in & wallet features
3. Dashboards (bet statuses, leaderboard, streaks)
4. Track 2 dashboard (chassis selection, sliders, toggles, agent output display)
5. OpenAI/Anthropic background cron — feeds user/match data into the LLM and returns structured payload output

---

## Suggested Branch Structure

Working off `main`, each person branches per feature to avoid stepping on shared files (especially DB schema and API contracts — coordinate those first).

**Maxx:**
- `feature/escrow-contract`
- `feature/backend-api`
- `feature/telegram-bot`
- `feature/db-schema`

**Ola:**
- `feature/ui-design-system`
- `feature/wallet-connect`
- `feature/dashboards`
- `feature/track2-dashboard`
- `feature/llm-cron`

**Workflow:**
```bash
git checkout main
git pull
git checkout -b feature/your-branch-name
# ... work, commit ...
git push -u origin feature/your-branch-name
# open a PR into main when ready, review each other's before merging
```

---

## Suggested Build Order (MVP-first)

| Phase | Focus | Owner(s) |
|---|---|---|
| 1 | DB schema + wallet↔Telegram mapping | Maxx |
| 2 | Wallet connect + basic UI shell | Ola |
| 3 | Escrow contract (create/accept/lock) | Maxx |
| 4 | Bet creation/accept flow UI + statuses | Ola |
| 5 | Telegram bot alerts (challenge, kickoff) | Maxx |
| 6 | Oracle integration + auto-settlement | Maxx |
| 7 | Streaks & leaderboard | Maxx (DB) + Ola (UI) |
| 8 | AI Agent chassis + config sliders (UI) | Ola |
| 9 | LLM cron + prompt/output pipeline | Ola |
| 10 | Agent → $1 escrow bet CTA wired end-to-end | Maxx + Ola |

---

## Open Questions / To Decide
- [ ] Which Solana escrow framework (Anchor?) will be used
- [ ] TxlineOdds oracle integration details / API access
- [ ] Telegram bot framework (node-telegram-bot-api, grammY, etc.)
- [ ] LLM provider (OpenAI vs Anthropic) — final decision + fallback
- [ ] Hosting/infra for the cron job (serverless vs dedicated worker)
- [ ] Testnet vs mainnet for MVP/demo
