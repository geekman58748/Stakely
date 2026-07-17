# Stakely Mainnet Readiness

**Date:** July 17, 2026  
**Verdict:** **NO-GO for real funds**

Stakely's core escrow lifecycle works on Solana devnet, but the current contract, keeper, deployment, and production API are not safe or complete enough for real USDC. Do not switch the web or API to mainnet until every P0 gate below is complete.

## What Was Verified

- The deployed devnet program is executable at `J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai` and is controlled by the configured deployer authority.
- A real devnet integration test passed all four stages: initialize, create/fund, accept/fund, and keeper settlement/payout.
- The escrow program builds to a 326,600-byte binary.
- The current mainnet rent estimate for that binary is at least 2.27402688 SOL, before transaction fees and deployment headroom.
- The candidate Stakely program address is not deployed on mainnet.
- The configured deployer wallet has 0 SOL on mainnet.
- The production Railway API is healthy and uses real TxLINE data, but it still does not report the escrow-verification capability required to enable wallet transactions in the web app.

The passing devnet test uses a temporary test token mint. It proves the escrow mechanics, not the complete browser/API/TxLINE/Circle-USDC production flow.

## Contract V2 Progress

Contract v2 is implemented on `codex/ola-web-integration`, but it is **not deployed to devnet or mainnet** yet.

- [x] Fixture ID and TxLINE participant ordering are stored in each escrow.
- [x] The configured token mint is enforced during creation and stored for the escrow lifecycle.
- [x] Initialization requires the deployed program's upgrade authority; the accepted mint and TxLINE verifier are immutable afterward.
- [x] Payout accounts are constrained to the creator and funded counterparty.
- [x] Escrow and vault rent always returns to the recorded creator.
- [x] `settle_escrow` constructs a fixed two-stat equality strategy and CPIs into TxLINE `validateStatV2`.
- [x] Only TxLINE stat keys `1,2` with final period `100` can settle.
- [x] The TxLINE daily scores root PDA is derived and enforced from the exact proof timestamp on-chain.
- [x] Winner selection is derived on-chain from the proven score.
- [x] Accepted escrows gain a permissionless two-party refund after their recovery deadline.
- [x] The API keeper submits settlement first, verifies confirmation and escrow closure, then updates Supabase.
- [x] Funding and settlement API signatures are bound to exact Stakely instruction discriminators.
- [x] Eight local-validator contract tests, four API proof-normalization tests, and four Rust unit tests pass.
- [ ] Install and rebuild with the pinned Anchor `0.31.1` and Solana `2.1.0` toolchain. The first download was reset, so the current Solana `3.1.15` artifact is not approved for deployment.
- [ ] Fund the devnet upgrade buffer. The current v2 upgrade estimate is approximately `2.82 SOL` plus fees.
- [ ] Deploy and initialize v2 with Circle devnet USDC and the TxLINE devnet verifier.
- [ ] Complete a real final-score proof settlement with two browser wallets.

### Devnet transaction evidence

- Create and fund: [2RYrnQ...AmeziE](https://explorer.solana.com/tx/2RYrnQL8wT3XWQVz3hrKKSxb9pZoZWGTLb8xmf1kDfNpyECJupU881TjxBJUiUZVHwpALzsnxq39hktGqPAmeziE?cluster=devnet)
- Accept and match funds: [5edH2L...jqfkry](https://explorer.solana.com/tx/5edH2LeSEoZMMnmBUJSY2iWePMWwLZveSAo8uCRfj1vq7X755BAEt8vL5729aFSPDhVrgKH8FNVBSX6ZxZjqfkry?cluster=devnet)
- Settle and pay winner: [8iW1u4...mnnYC](https://explorer.solana.com/tx/8iW1u4wNATXrnJQtautrWwQE5R3CETnXD7YZgop7EHTZmxHptKxfRGDPF9sMeAqWvTfgZK7p7rnLniKegqymnYC?cluster=devnet)

## Official Mainnet Values

| Dependency | Mainnet value |
| --- | --- |
| Solana RPC | `https://api.mainnet-beta.solana.com` |
| TxLINE API | `https://txline.txodds.com/api/` |
| TxLINE verifier program | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` |
| Circle USDC mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

Sources: [TxLINE mainnet program reference](https://github.com/txodds/tx-on-chain/blob/main/documentation/programs/mainnet.mdx), [TxLINE on-chain validation guide](https://github.com/txodds/tx-on-chain/blob/main/documentation/examples/onchain-validation.mdx), [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses), and [Solana program deployment](https://solana.com/docs/programs/deploying).

## P0 Mainnet Blockers

- [x] **Replace database-only settlement in the branch.** Contract v2 and the API still need coordinated devnet and production deployment.
- [x] **Verify TxLINE on-chain in contract v2.** Deployment and a real proof test are still pending.
- [x] **Bind payouts to the winner in contract v2.** Independent review is still pending.
- [x] **Bind rent refunds to the creator in contract v2.** Independent review is still pending.
- [x] **Enforce the configured mint in contract v2.** Devnet initialization with Circle USDC is still pending.
- [x] **Add a post-accept recovery path in contract v2.** Browser recovery controls are still pending.
- [x] **Implement the chain-first keeper.** Production deployment and a real TxLINE proof run are still pending.
- [ ] **Deploy the current API contract.** Railway must report `capabilities.escrowVerification: true` before the frontend enables real transactions.
- [ ] **Run the complete devnet product flow.** Use two browser wallets, Circle devnet USDC, the production-like API, a real TxLINE `game_finalised` proof, and the keeper. Preserve all three transaction signatures and the receipt.
- [ ] **Resolve build/toolchain warnings and audit contract v2.** Pin compatible Solana/Anchor versions, get a clean deploy build, add adversarial tests, and obtain an independent security review before real funds.
- [ ] **Complete legal/compliance review.** Real-money peer-to-peer wagering needs jurisdiction, age, geofencing, responsible-gaming, and licensing analysis outside this engineering checklist.

## Safe Promotion Sequence

1. Independently review the implemented contract v2 constraints and TxLINE CPI settlement.
2. Deploy contract v2 to devnet under a multisig-controlled upgrade authority.
3. Deploy the implemented chain-first keeper transaction flow with the v2 API.
4. Pass unit, adversarial, local-validator, and real devnet end-to-end tests.
5. Deploy the API capability contract and test the web with two wallets.
6. Complete security and legal reviews.
7. Fund the mainnet deployer, run `npm run preflight:mainnet`, and review every result.
8. Deploy and initialize mainnet with Circle USDC and the TxLINE mainnet verifier.
9. Start with strict bet and total-value caps plus monitoring and a documented incident response.

## Read-Only Preflight

From `escrow/`:

```bash
STAKELY_DEPLOYER_ADDRESS=<public-wallet-address> npm run preflight:mainnet
```

This checks the public TxLINE program, Circle USDC mint, Stakely program deployment, compiled binary, and deployer balance. It deliberately cannot certify the security and operational P0 gates above.
