# Stakely — Supabase Schema

## Setup

1. Go to [supabase.com](https://supabase.com) → New Project
2. Dashboard → SQL Editor → New Query
3. Paste the entire contents of `schema.sql` and click Run
4. Copy your project URL and keys:
   - `SUPABASE_URL` = `https://<your-ref>.supabase.co`
   - `SUPABASE_ANON_KEY` = from Settings → API → anon/public
   - `SUPABASE_SERVICE_ROLE_KEY` = from Settings → API → service_role (server only, never expose)

## Tables

| Table | Purpose |
|---|---|
| `users` | Wallet ↔ Telegram mapping, streaks, win/loss record |
| `matches` | TxLINE fixture cache — updated by SSE stream |
| `bets` | P2P bets, escrow PDA addresses, settlement status |
| `bot_configs` | AI agent personality + data settings per user |
| `agent_predictions` | LLM output per match per user, linked to bets |
| `match_events` | Goals, cards, kickoff/fulltime events from SSE |
| `telegram_link_codes` | One-time 6-char codes for wallet↔Telegram linking |

## Views

| View | Purpose |
|---|---|
| `leaderboard` | Top 50 users by streak + win % |

## Key design decisions

- **Service role key** is used server-side only. All writes go through Express API, not direct from client.
- **RLS enabled** on all tables. Public can read `matches` and `match_events`. Bets are visible to creator + counterparty only.
- `matches.merkle_proof` stores the TxLINE cryptographic proof — displayed in the UI as a verifiable receipt (judge differentiator).
- `bets.escrow_pda` = Solana Program Derived Address where USDC is held until settlement.
- Streak resets on loss (tracked in `users.streak`). Updated by the settle endpoint after each bet.
