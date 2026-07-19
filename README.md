# Stakely ⚡

> **P2P sports prediction markets on Solana — stake against friends, settle on-chain.**

Live demo → **[stakely-production.up.railway.app](https://stakely-production.up.railway.app/#discover)**

Built for the **TxLINE / TxODDS FIFA World Cup 2026 Hackathon — Track 1: Markets**

---

## What is Stakely?

Stakely lets two people bet directly against each other on a match outcome. No house, no bookmaker. Funds are locked in a Solana escrow smart contract, and the result is settled automatically using a **TxLINE cryptographic proof** — verified on-chain. Every payout has a permanent, auditable receipt.

- Bet as low as **$1 USDC**
- Wallet-native auth — no email, no KYC
- Settlement is trustless: oracle result → Anchor program → winner paid
- Companion **Telegram bot** for challenge alerts and match notifications

---

## Architecture

```
Browser (React + Vite)
    │
    ├── Solana Wallet Adapter ──► Anchor Escrow Program (devnet)
    │                                  ▲
    └── REST API (Express / Railway)   │ settle ix
            │                          │
            ├── Supabase (Postgres)     │
            ├── TxLINE SSE feed ────────┘
            └── Telegram Bot (webhooks)
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Solana Wallet Adapter |
| Backend | Express 5, TypeScript, Railway |
| Database | Supabase (Postgres) |
| Blockchain | Solana (devnet), Anchor framework |
| Oracle | TxLINE / TxODDS (live World Cup data + Merkle proofs) |
| Payments | Circle devnet USDC |
| Bot | Telegram Bot API |

---

## Core Flow

```
1. User A finds a live TxLINE fixture on Discover
2. User A creates a challenge → funds Stakely escrow on Solana (USDC)
3. User B receives a Telegram alert → accepts → matches the deposit
4. Escrow vault now holds 2× USDC, locked until final whistle
5. TxLINE pushes final score + Merkle proof to the API
6. Keeper validates proof and fires settle instruction on-chain
7. Winner receives full pot; settlement receipt minted permanently
```

---

## Smart Contract

Solana Anchor program — `stakely-escrow`

- **Devnet program ID:** `J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai`
- **TxLINE verifier (mainnet):** `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`
- **USDC mint (mainnet):** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

### Devnet transaction evidence

| Step | Signature |
|---|---|
| Create + fund escrow | [2RYrnQ…AmeziE](https://explorer.solana.com/tx/2RYrnQL8wT3XWQVz3hrKKSxb9pZoZWGTLb8xmf1kDfNpyECJupU881TjxBJUiUZVHwpALzsnxq39hktGqPAmeziE?cluster=devnet) |
| Accept + match funds | [5edH2L…jqfkry](https://explorer.solana.com/tx/5edH2LeSEoZMMnmBUJSY2iWePMWwLZveSAo8uCRfj1vq7X755BAEt8vL5729aFSPDhVrgKH8FNVBSX6ZxZjqfkry?cluster=devnet) |
| Settle + pay winner | [8iW1u4…mnnYC](https://explorer.solana.com/tx/8iW1u4wNATXrnJQtautrWwQE5R3CETnXD7YZgop7EHTZmxHptKxfRGDPF9sMeAqWvTfgZK7p7rnLniKegqymnYC?cluster=devnet) |

---

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | System status + capabilities |
| GET | `/api/matches` | Live TxLINE fixtures |
| GET | `/api/bets` | Open challenges |
| POST | `/api/bets` | Create a challenge |
| GET | `/api/leaderboard` | Top predictors by win streak |
| GET | `/api/users/:wallet` | User profile |
| POST | `/api/telegram` | Telegram webhook handler |

---

## Running Locally

### Prerequisites

- Node 20+ and pnpm
- Supabase project (or local Postgres)
- TxLINE API key (devnet)
- Solana CLI + Anchor

### API

```bash
cd api
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, TXLINE_API_KEY, etc.
pnpm install
pnpm dev
```

### Web

```bash
cd web
cp .env.example .env
pnpm install
pnpm dev
```

### Escrow (Anchor)

```bash
cd escrow
anchor build
anchor test
```

---

## Repo Structure

```
Stakely/
├── api/          # Express backend (deployed on Railway)
├── web/          # React + Vite frontend
├── escrow/       # Solana Anchor smart contract
├── db/           # Supabase schema
├── txline/       # TxLINE oracle client
└── design/       # UI reference assets
```

---

## Status

> **Running on Solana devnet.** The full escrow lifecycle is verified end-to-end on devnet. Mainnet promotion requires a funded deployer wallet + TxLINE mainnet subscription. See [`MAINNET_READINESS.md`](./MAINNET_READINESS.md) for the complete checklist.

---

## Team

| Name | Role |
|---|---|
| Maxx | Backend, smart contract, blockchain |
| Ola | Product, frontend, design |

---

## License

MIT
