/**
 * Initialize or verify Stakely escrow v2 on devnet after deployment.
 *
 * Prerequisites:
 *   1. anchor build  (generates target/deploy/stakely_escrow.so + keypair)
 *   2. solana config set --url devnet
 *   3. STAKELY_DEV_WALLET env set (or default Solana CLI keypair)
 *
 * Run: npm run deploy
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { readFileSync } from "fs";
import path from "path";

const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

const connection = new Connection(
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  "confirmed",
);
const acceptedMint = new PublicKey(
  process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const txlineProgram = new PublicKey(
  process.env.TXLINE_PROGRAM_ID ?? "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
);

// Load keypair from env or default Solana CLI location
const rawKey = process.env.STAKELY_DEV_WALLET
  ? JSON.parse(process.env.STAKELY_DEV_WALLET)
  : JSON.parse(readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf8"));

const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
const configAuthority = new PublicKey(
  process.env.STAKELY_CONFIG_AUTHORITY ?? keypair.publicKey,
);
const wallet  = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl  = JSON.parse(readFileSync(path.resolve(__dirname, "../target/idl/stakely_escrow.json"), "utf8"));
const program = new anchor.Program(idl, provider);

const [globalConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("global_config_v2")],
  program.programId
);
const [programData] = PublicKey.findProgramAddressSync(
  [program.programId.toBuffer()],
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
);

async function main() {
  console.log("Program ID:", program.programId.toBase58());
  console.log("Deployment wallet:", keypair.publicKey.toBase58());
  console.log("Config authority:", configAuthority.toBase58());
  console.log("Accepted mint:", acceptedMint.toBase58());
  console.log("TxLINE program:", txlineProgram.toBase58());

  // Check if already initialized.
  let existing: any = null;
  try {
    existing = await (program.account as any).globalConfig.fetch(globalConfigPda);
  } catch {
    existing = null;
  }
  if (existing) {
    console.log("GlobalConfig already exists. Authority:", existing.authority.toBase58());
    if (!existing.authority.equals(configAuthority)
      || !existing.acceptedMint.equals(acceptedMint)
      || !existing.txlineProgram.equals(txlineProgram)) {
      throw new Error("Existing v2 config does not match the requested authority, mint, and TxLINE program");
    }
    return;
  }

  console.log("Initializing GlobalConfig v2...");
  const sig = await program.methods
    .initialize(configAuthority)
    .accounts({
      payer:        keypair.publicKey,
      globalConfig: globalConfigPda,
      acceptedMint,
      txlineProgram,
      program: program.programId,
      programData,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("Initialized. Tx:", sig);
  console.log("\nAdd these to Railway / .env:");
  console.log(`ESCROW_PROGRAM_ID=${program.programId.toBase58()}`);
  console.log("ESCROW_KEEPER_WALLET=<your-keeper-keypair-json-or-base58-secret>");
  console.log(`STAKELY_CONFIG_AUTHORITY=${configAuthority.toBase58()}`);
  console.log(`USDC_MINT=${acceptedMint.toBase58()}`);
  console.log(`TXLINE_PROGRAM_ID=${txlineProgram.toBase58()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
