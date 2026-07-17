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

- [ ] **Replace database-only settlement.** `api/src/lib/poller.ts` currently marks bets settled in Supabase without sending `settle_escrow`; funds can remain locked while the UI says settled.
- [ ] **Verify TxLINE on-chain.** The contract does not CPI into TxLINE's `validateStatV2` instruction. A final `game_finalised` score record, its real sequence, proof timestamp, daily scores root PDA, and the ordered `statKeys=1,2` proof must determine settlement.
- [ ] **Bind payouts to the winner.** `winner_token_account` is not constrained to be owned by the selected creator/counterparty. A keeper can currently redirect vault funds to another token account.
- [ ] **Bind rent refunds to the creator.** The settlement `creator` account is not constrained to `escrow.creator`.
- [ ] **Enforce Circle USDC.** The program accepts any SPL mint, while the database and UI label every challenge as USDC. The accepted mint must be stored in global config and enforced in create, accept, settle, and cancel.
- [ ] **Add a post-accept recovery path.** There is no timeout/refund or dispute path if the keeper becomes unavailable after both wallets fund.
- [ ] **Finish the keeper.** It must validate the proof, settle on-chain, wait for confirmation, then record `settle_tx`, proof, winner, and notifications. The database must never lead the chain.
- [ ] **Deploy the current API contract.** Railway must report `capabilities.escrowVerification: true` before the frontend enables real transactions.
- [ ] **Run the complete devnet product flow.** Use two browser wallets, Circle devnet USDC, the production-like API, a real TxLINE `game_finalised` proof, and the keeper. Preserve all three transaction signatures and the receipt.
- [ ] **Resolve build/toolchain warnings and audit contract v2.** Pin compatible Solana/Anchor versions, get a clean deploy build, add adversarial tests, and obtain an independent security review before real funds.
- [ ] **Complete legal/compliance review.** Real-money peer-to-peer wagering needs jurisdiction, age, geofencing, responsible-gaming, and licensing analysis outside this engineering checklist.

## Safe Promotion Sequence

1. Fix the contract account constraints and add TxLINE CPI settlement.
2. Deploy contract v2 to devnet under a multisig-controlled upgrade authority.
3. Replace the database-only poller with the keeper transaction flow.
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
