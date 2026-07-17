# Stakely — Session Handoff

**Hackathon:** TxLINE/TxODDS FIFA World Cup 2026 | Track 1 (Markets) | $12K first prize  
**Deadline:** July 19, 2026  
**GitHub:** `geekman58748/Stakely` (private)  
**Team:** Maxx (backend) + Ola (frontend)

---

## Infrastructure — all live

| Service | URL / Location | Notes |
|---|---|---|
| API server | `https://stakely-production.up.railway.app` | Railway, auto-deploys from `main`, root dir: `api/` |
| Database | Supabase (check dashboard) | Project name: Stakely |
| Telegram bot | @StakelyAgentbot | Webhook registered to Railway URL |
| TxLINE devnet | `https://txline-dev.txodds.com` | Subscription active on devnet |
| Escrow program | `J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai` | ✅ Verified live on Solana devnet |
| GitHub | `geekman58748/Stakely` | All code lives here |

---

## What's merged and deployed (as of July 17, 2026)

### ✅ API — `https://stakely-production.up.railway.app/api/health`
```json
{ "ok": true, "supabase": true, "capabilities": { "escrowVerification": true, "contractVersion": "v1" } }
```
- All 17 routes live
- `escrowVerification: true` — frontend safety gate unlocked
- On-chain keeper settlement wired: `settle_escrow` instruction built and signed by keeper wallet
- Chain-first: DB never updates until Solana confirms
- Settle_tx stored in bets table after settlement
- Poller auto-transitions scheduled → live → finished
- Telegram pings + roasts active

### ✅ Frontend — `web/` (merged, needs Railway static service — see below)
- 6 pages: Discover, Matches, Match Detail, My Bets, Leaderboard, Receipts
- Phantom/Solflare wallet connection
- Real escrow PDA derivation + Anchor instruction construction
- Leaderboard now pulls real data from `/api/leaderboard`
- Proof-aware receipts
- Railway deploy config: `web/nixpacks.toml` + `web/railway.json` committed

### ✅ Solana escrow program
- Program ID: `J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai` — executable on devnet
- TxLINE validation program: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
- Keeper wallet: `Cgdeb6T6SshYt2eotqhwJktqGcfsEoa98kmkRkCpKqir`
- `STAKELY_DEV_WALLET` set as Replit secret ✅ — must also be set on Railway

---

## ⚠️ Manual steps still needed (before demo)

### 1. Supabase SQL editor — paste these two functions
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

### 2. Railway — API service env vars (verify these exist, add if missing)
| Var | Value |
|---|---|
| STAKELY_DEV_WALLET | [the JSON keypair array from your secrets] |
| TXLINE_API_TOKEN | `txoracle_api_2dffaac495e54767af7e1bb664778ef6` |
| TXLINE_USE_MOCK | `false` |
| TXLINE_NETWORK | `devnet` |
| SOLANA_RPC_URL | `https://api.devnet.solana.com` |
| ESCROW_PROGRAM_ID | `J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai` |

**Note:** Health is showing `"txline": "mock"` — this means TXLINE_API_TOKEN is missing or blank on Railway. Re-add it and redeploy.

### 3. Railway — add a NEW static service for the web frontend
1. Railway dashboard → New Service → GitHub repo → root dir: `web/`
2. Build command: `npm ci && npm run build`
3. Start command: `npx serve dist -l $PORT`
4. Add these env vars to the web service:
   | Var | Value |
   |---|---|
   | VITE_API_URL | `https://stakely-production.up.railway.app` |
   | VITE_SOLANA_RPC_URL | `https://api.devnet.solana.com` |
   | VITE_ESCROW_PROGRAM_ID | `J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai` |
   | VITE_USDC_MINT | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

---

## Mainnet P0 checklist (from MAINNET_READINESS.md)
- [ ] Fix on-chain settlement: poller must call `settle_escrow` ✅ DONE
- [ ] Deploy API capability contract: `escrowVerification: true` ✅ DONE
- [ ] Run full devnet end-to-end: 2 wallets, real fixture, full receipt
- [ ] Fix keeper: bind `winner_token_account` constraint + TxLINE CPI (for mainnet)
- [ ] Security review + legal/compliance before real funds

---

## Secrets location
| Secret | Where |
|---|---|
| GITHUB_PAT | Replit secrets |
| STAKELY_DEV_WALLET | Replit secrets + Railway API service |
| SUPABASE_* | Railway API service env vars |
| TXLINE_API_TOKEN | Railway API service env vars |
| TELEGRAM_BOT_TOKEN | Railway API service env vars |
