/**
 * Deploy & initialize the Stakely escrow program on devnet.
 *
 * Prerequisites:
 *   1. anchor build  (generates target/deploy/stakely_escrow.so + keypair)
 *   2. solana config set --url devnet
 *   3. STAKELY_DEV_WALLET env set (or default Solana CLI keypair funded with ~0.5 SOL)
 *
 * Run: npx ts-node scripts/deploy.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import path from "path";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Load keypair from env or default Solana CLI location
const rawKey = process.env.STAKELY_DEV_WALLET
  ? JSON.parse(process.env.STAKELY_DEV_WALLET)
  : JSON.parse(readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf8"));

const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
const wallet  = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl  = JSON.parse(readFileSync(path.resolve(__dirname, "../target/idl/stakely_escrow.json"), "utf8"));
const program = new anchor.Program(idl, provider);

const [globalConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("global_config")],
  program.programId
);

async function main() {
  console.log("Program ID:", program.programId.toBase58());
  console.log("Authority (keeper):", keypair.publicKey.toBase58());

  // Check if already initialized
  try {
    const existing = await (program.account as any).globalConfig.fetch(globalConfigPda);
    console.log("GlobalConfig already exists. Authority:", existing.authority.toBase58());
    return;
  } catch {
    // Not initialized yet
  }

  console.log("Initializing GlobalConfig...");
  const sig = await program.methods
    .initialize(keypair.publicKey) // keeper = this wallet
    .accounts({
      payer:        keypair.publicKey,
      globalConfig: globalConfigPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Initialized. Tx:", sig);
  console.log("\nAdd these to Railway / .env:");
  console.log(`ESCROW_PROGRAM_ID=${program.programId.toBase58()}`);
  console.log(`ESCROW_KEEPER_WALLET=<your-keeper-keypair-json>`);
}

main().catch(console.error);
