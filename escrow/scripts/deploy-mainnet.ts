/**
 * Deploy & initialize Stakely escrow on mainnet-beta.
 *
 * Prerequisites:
 *   1. anchor build                         (builds target/deploy/stakely_escrow.so)
 *   2. solana config set --url mainnet-beta
 *   3. Deployer wallet funded with ≥3 SOL   (for rent + fees)
 *   4. STAKELY_DEV_WALLET env = keeper JSON keypair array
 *      (the keeper that will sign settle_escrow transactions)
 *
 * Run from escrow/:
 *   NETWORK=mainnet npx tsx scripts/deploy-mainnet.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import path from "path";

const RPC = process.env.SOLANA_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC, "confirmed");

// Deployer = the wallet that owns the program upgrade authority.
// Can be the same as the keeper wallet for hackathon purposes.
const rawDeployer = process.env.STAKELY_DEV_WALLET
  ? JSON.parse(process.env.STAKELY_DEV_WALLET)
  : JSON.parse(readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf8"));

const deployer = Keypair.fromSecretKey(Uint8Array.from(rawDeployer));
const wallet   = new anchor.Wallet(deployer);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl = JSON.parse(
  readFileSync(path.resolve(__dirname, "../target/idl/stakely_escrow.json"), "utf8")
);
const program = new anchor.Program(idl, provider);

const [globalConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("global_config")],
  program.programId,
);

// Keeper = the wallet that will sign settle_escrow txs from the Railway API.
// For the hackathon this is the same as the deployer, but can be split later.
const keeperPubkey = deployer.publicKey;

async function main() {
  console.log("\n=== Stakely mainnet-beta deploy ===");
  console.log("RPC:          ", RPC);
  console.log("Program ID:   ", program.programId.toBase58());
  console.log("Deployer:     ", deployer.publicKey.toBase58());
  console.log("Keeper:       ", keeperPubkey.toBase58());

  const balance = await connection.getBalance(deployer.publicKey);
  console.log("Balance:      ", (balance / 1e9).toFixed(4), "SOL");
  if (balance < 0.1 * 1e9) {
    console.error("\n❌ Deployer balance too low. Fund with ≥3 SOL and retry.");
    process.exit(1);
  }

  // Check if already initialized
  try {
    const existing = await (program.account as any).globalConfig.fetch(globalConfigPda);
    console.log("\n✅ GlobalConfig already initialized.");
    console.log("   Authority:", existing.authority.toBase58());
    printEnvBlock(program.programId.toBase58());
    return;
  } catch {
    // Not initialized yet — proceed
  }

  console.log("\nInitializing GlobalConfig...");
  const sig = await program.methods
    .initialize(keeperPubkey)
    .accounts({
      payer:         deployer.publicKey,
      globalConfig:  globalConfigPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Initialized. Tx:", sig);
  printEnvBlock(program.programId.toBase58());
}

function printEnvBlock(programId: string) {
  console.log("\n=== Add these to Railway (API service) ===");
  console.log(`ESCROW_PROGRAM_ID=${programId}`);
  console.log(`SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`);
  console.log(`USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`);
  console.log(`TXLINE_NETWORK=mainnet`);
  console.log(`TXLINE_USE_MOCK=false`);
  console.log("\n=== Add these to Railway (web service build env) ===");
  console.log(`VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`);
  console.log(`VITE_ESCROW_PROGRAM_ID=${programId}`);
  console.log(`VITE_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`);
  console.log(`VITE_API_URL=https://stakely-production.up.railway.app`);
}

main().catch(e => { console.error("\n❌", e.message); process.exit(1); });
