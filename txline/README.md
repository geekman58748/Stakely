# TxLINE Integration

## One-time Setup (Mainnet)

### Prerequisites
- Node.js 18+
- Your Solana wallet private key (64-number JSON array)
- SOL in wallet for transaction fees (~0.001 SOL)

### Install dependencies
```bash
cd txline && npm install
```

### Export your private key

**From Phantom:**
1. Settings → Security & Privacy → Export Private Key → copy base58 string
2. Convert to JSON array:
```bash
export PK="your_base58_private_key_here"
npx tsx -e "
import {Keypair} from '@solana/web3.js';
import bs58 from 'bs58';
const kp = Keypair.fromSecretKey(bs58.decode(process.env.PK));
console.log(JSON.stringify(Array.from(kp.secretKey)));
"
```
3. Set env var:
```bash
export WALLET_PRIVATE_KEY='[1,2,3,...64 numbers]'
```

### Activate API token
```bash
npm run activate
```

Copy the printed `TXLINE_API_TOKEN` to:
- `.env` → `TXLINE_API_TOKEN=...`
- Replit Secrets → `TXLINE_API_TOKEN`
- Railway → Environment Variables → `TXLINE_API_TOKEN`

Token is valid for **4 weeks**. Re-run activate to renew.

---

## Usage in your Express server

```typescript
import { getTxLineClient } from './client/txline';

const txline = getTxLineClient(); // reads TXLINE_API_TOKEN from env

// REST snapshot
const fixtures = await txline.getFixtures();
const score = await txline.getScore('fixture-id-123');
const odds = await txline.getOdds('fixture-id-123');

// SSE stream — runs forever, reconnects on drop
const stopScores = txline.streamScores(null, async (event) => {
  // Update Supabase matches table
  await supabase.from('matches').upsert({
    id: event.data.fixtureId,
    home_score: event.data.homeScore,
    away_score: event.data.awayScore,
    status: event.data.status,
    updated_at: new Date().toISOString(),
  });
});

// Clean up on server shutdown
process.on('SIGTERM', () => stopScores());
```

## API Surface Mapped

| Method | Endpoint | Used for |
|---|---|---|
| `getFixtures()` | `GET /api/fixtures` | Seed matches table on startup |
| `getScore(id)` | `GET /api/scores/:id` | Single match score fetch |
| `getLiveScores()` | `GET /api/scores/live` | Live match dashboard |
| `getOdds(id)` | `GET /api/odds/:id` | Odds for a specific match |
| `getAllOdds()` | `GET /api/odds` | Odds overview dashboard |
| `streamScores()` | `GET /api/scores/stream` | Live score updates → Supabase |
| `streamOdds()` | `GET /api/odds/stream` | Live odds → Supabase |
