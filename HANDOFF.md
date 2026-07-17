# Stakely — Session Handoff

**Hackathon:** TxLINE/TxODDS FIFA World Cup 2026 | Track 1 (Markets) | $12K first prize  
**Deadline:** July 19, 2026  
**GitHub:** `geekman58748/Stakely` (private)  
**Team:** Maxx (backend) + Ola (frontend)

---

## Infrastructure — all live, all independent of Replit

| Service | URL / Location | Notes |
|---|---|---|
| API server | `https://stakely-production.up.railway.app` | Railway, auto-deploys from `main` branch, root dir: `api/` |
| Database | Supabase (check dashboard for URL) | Project name: Stakely |
| Telegram bot | @StakelyAgentbot | Webhook registered to Railway URL |
| TxLINE devnet | `https://txline-dev.txodds.com` | Subscription active on devnet |
| GitHub | `geekman58748/Stakely` | All code lives here |

---

## Secrets — where to find each one

Re-add these to the new Replit session:

| Secret name | Where to get it |
|---|---|
| `GITHUB_PAT` | GitHub → Settings → Developer Settings → Personal Access Tokens |
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API |
| `TXLINE_API_TOKEN` | Retrieve from Railway or the TxLINE dashboard. Rotate the previously exposed token before the next deploy. |
| `STAKELY_DEV_WALLET` | The devnet keypair JSON array — check old Replit secrets or Railway |
| `TELEGRAM_BOT_TOKEN` | Already set on Railway. Get from @BotFather if needed |

Railway env vars already set (don't need to re-add to Replit unless agent needs them):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `TXLINE_API_TOKEN`, `TXLINE_NETWORK=devnet`, `TXLINE_USE_MOCK=false`
- `TELEGRAM_BOT_TOKEN`
- `RAILWAY_PUBLIC_DOMAIN=stakely-production.up.railway.app`

---

## What's built

### ✅ Supabase schema (`db/schema.sql`)
7 tables: `users`, `matches`, `bets`, `bot_configs`, `agent_predictions`, `match_events`, `telegram_link_codes`  
Indexes, RLS, leaderboard view, streak trigger stubs.

**Still needs (paste in Supabase SQL editor):**
```sql
CREATE OR REPLACE FUNCTION increment_streak_win(user_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE users SET streak = streak + 1, total_wins = total_wins + 1, updated_at = now() WHERE id = user_id;
$$;

CREATE OR REPLACE FUNCTION reset_streak_loss(user_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE users SET streak = 0, total_losses = total_losses + 1, updated_at = now() WHERE id = user_id;
$$;
```

### ✅ TxLINE client (`api/src/lib/txline.ts`)
- Dual-header auth: `Authorization: Bearer <guest_jwt>` + `X-Api-Token: <apiToken>`
- Correct endpoints: `/api/fixtures/snapshot`, `/api/odds/snapshot/:id`, `/api/scores/snapshot/:id`
- Guest JWT auto-refreshes every 29 days
- Mock fallback: `TXLINE_USE_MOCK=true`
- **Currently syncing 13 real devnet fixtures on startup**

### ✅ Express API (`api/`) — live on Railway
17 routes across 6 files:

| Route | Purpose |
|---|---|
| `GET /api/health` | Status check |
| `GET /api/matches` | List matches |
| `GET /api/matches/live` | Live scores |
| `GET /api/matches/:id` | Single match + odds |
| `POST /api/matches/sync` | Re-seed from TxLINE |
| `POST /api/users` | Register wallet (first sign-in) |
| `GET /api/users/me` | Current user |
| `PATCH /api/users/me` | Update display name |
| `GET /api/users/:wallet` | Public profile |
| `GET /api/bets/open` | Open challenges |
| `POST /api/bets` | Create bet |
| `PATCH /api/bets/:id/accept` | Accept bet |
| `PATCH /api/bets/:id/cancel` | Cancel bet |
| `POST /api/bets/:id/settle` | Settle + store Merkle proof |
| `GET /api/leaderboard` | Top 50 by streak |
| `GET /api/bots/config` | Get AI agent config |
| `PUT /api/bots/config` | Set AI agent config |
| `POST /api/bots/predict/:matchId` | Run AI prediction |
| `POST /api/telegram/link-code` | Generate wallet↔Telegram code |
| `POST /api/telegram/verify` | Complete link (REST) |
| `GET /api/telegram/user/:tgId` | Look up by Telegram ID |
| `POST /api/telegram/webhook` | Telegram bot webhook handler |

**Wallet auth:** All protected routes require 3 headers:
```
x-wallet-address: <base58 pubkey>
x-signature:      <base58 nacl detached sig of "stakely-auth:<timestamp>">
x-timestamp:      <unix ms, must be within 5 min>
```

### ✅ Telegram bot
- Webhook: `https://stakely-production.up.railway.app/api/telegram/webhook`
- Commands: `/start`, `/link <code>`, `/scores`, `/bets`
- Notifications: challenge sent/received, bet accepted, goal scored, match finished, settlement (with roasts)
- Roast bank in `api/src/lib/telegram.ts` — human-sounding, not AI

### ✅ Solana Anchor escrow (`escrow/`)
Full program written in `programs/stakely-escrow/src/lib.rs`.  
Instructions: `initialize`, `create_escrow`, `accept_escrow`, `settle_escrow`, `cancel_escrow`  
The contract builds locally with Anchor 0.31.0 and is deployed on devnet at `J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai`. The keeper config is initialized.
Deploy script: `escrow/scripts/deploy.ts`

---

## What's left (priority order)

| # | Item | Notes |
|---|---|---|
| 1 | **Streak SQL functions** | Paste 2 functions above into Supabase SQL editor. 2 min. |
| 2 | **Railway escrow config** | Add `ESCROW_PROGRAM_ID`, `SOLANA_RPC_URL`, and a new `KEEPER_API_SECRET`. Keep the keeper key server-side only. |
| 3 | **Accept challenge UI** | Submit `accept_escrow`, then send the confirmed `accept_tx` to the API. |
| 4 | **Merkle proof receipts** | Validate TxLINE stat proof on-chain before the keeper settles. |
| 5 | **TxLINE token audit** | Rotate the exposed token and confirm Railway is not silently using mock mode. |
| 6 | **End-to-end test** | Full bet lifecycle with two real devnet wallets. |
| 7 | **Demo video + submission** | July 19 deadline. |

---

## Ola's frontend integration guide

**Base URL:** `https://stakely-production.up.railway.app` (set as `VITE_API_URL`)

**Packages currently used:**
```bash
npm install @coral-xyz/anchor @solana/web3.js bs58 buffer
```

**Auth pattern (every protected request):**
```ts
const ts  = Date.now().toString();
const sig = bs58.encode(await wallet.signMessage(
              new TextEncoder().encode(`stakely-auth:${ts}`)));

headers: {
  "x-wallet-address": wallet.publicKey.toBase58(),
  "x-signature":      sig,
  "x-timestamp":      ts,
}
```

**Screen → endpoint map:**
- Match list: `GET /api/matches`
- Match detail + odds: `GET /api/matches/:id`
- Live scores: `GET /api/matches/live`
- Open bets: `GET /api/bets/open`
- Create bet: `POST /api/bets` after on-chain funding, with `{ id, match_id, creator_side, amount_usdc, escrow_pda, create_tx }`
- Accept bet: `PATCH /api/bets/:id/accept` after on-chain funding, with `{ accept_tx }`
- My bets: `GET /api/bets?role=mine`
- Leaderboard: `GET /api/leaderboard`
- AI predict: `POST /api/bots/predict/:matchId`
- Link Telegram: `POST /api/telegram/link-code` → show 6-char code to user
- First sign-in: `POST /api/users` `{ display_name? }`

---

## Known quirks

- TxLINE devnet returns real Friendlies fixtures, WC 2026 fixtures appear as scheduled
- Telegram `/link` flow requires user to exist in `users` table first (frontend creates this on sign-in)
- Escrow is deployed on devnet; Railway still needs the program ID and keeper environment configuration
- Railway sets `PORT` dynamically — never hardcode 4000 in code (already handled)
- TxLINE guest JWT has 30-day TTL, auto-refreshed in client

---

## Resuming in a new session

1. Add all secrets listed above to new Replit
2. The code is all on GitHub — agent can read it directly
3. Tell the new agent: "Read HANDOFF.md in the stakely/ directory on GitHub repo geekman58748/Stakely and continue from there"
