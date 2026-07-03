/**
 * Keeper settle script — called by the API server after match result is confirmed.
 *
 * Usage: BET_ID=abc123 WINNER_WALLET=... npx ts-node scripts/settle.ts
 *
 * In production the API calls this logic directly via @coral-xyz/anchor in the settle route.
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "fs";
import path from "path";

const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // devnet USDC

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const rawKey = JSON.parse(process.env.STAKELY_DEV_WALLET!);
const keeper = Keypair.fromSecretKey(Uint8Array.from(rawKey));
const wallet  = new anchor.Wallet(keeper);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl  = JSON.parse(readFileSync(path.resolve(__dirname, "../target/idl/stakely_escrow.json"), "utf8"));
const program = new anchor.Program(idl, provider);

async function settleEscrow(betId: string, winnerPubkey: PublicKey) {
  const [escrowPda]    = PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(betId)], program.programId);
  const [vaultPda]     = PublicKey.findProgramAddressSync([Buffer.from("vault"),  Buffer.from(betId)], program.programId);
  const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global_config")], program.programId);

  const escrow = await program.account.escrowState.fetch(escrowPda);
  const winnerAta = getAssociatedTokenAddressSync(USDC_DEVNET, winnerPubkey);

  const sig = await program.methods
    .settleEscrow(betId, winnerPubkey)
    .accounts({
      authority:           keeper.publicKey,
      globalConfig,
      escrow:              escrowPda,
      vault:               vaultPda,
      winnerTokenAccount:  winnerAta,
      creator:             escrow.creator,
      tokenProgram:        TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ Settled. Tx:", sig);
  return sig;
}

const betId  = process.env.BET_ID!;
const winner = new PublicKey(process.env.WINNER_WALLET!);
settleEscrow(betId, winner).catch(console.error);
