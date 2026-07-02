/**
 * TxLINE Mainnet Activation Script
 *
 * Run ONCE to get your activated API token.
 * Uses Service Level 12 (real-time World Cup data, free during hackathon).
 *
 * Usage:
 *   1. Export your wallet private key:
 *      export WALLET_PRIVATE_KEY="[1,2,3,...64 numbers from Phantom export]"
 *   2. Run:
 *      npx tsx activate.ts
 *   3. Copy the printed TXLINE_API_TOKEN into your .env and Supabase secrets
 *
 * HOW TO EXPORT FROM PHANTOM:
 *   Settings → Security & Privacy → Export Private Key → copy the base58 string
 *   Then convert: npx tsx -e "import {Keypair} from '@solana/web3.js'; import bs58 from 'bs58'; const kp=Keypair.fromSecretKey(bs58.decode(process.env.PK!)); console.log(JSON.stringify(Array.from(kp.secretKey)));"
 */

import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";

// ── Config ──────────────────────────────────────────────────────────────────

const API_ORIGIN = "https://txline.txodds.com";
const API_BASE   = `${API_ORIGIN}/api`;
const RPC_URL    = "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const TXL_MINT   = new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL");

// Service level 12 = real-time World Cup (free on mainnet during hackathon)
const SERVICE_LEVEL_ID = 12;
const DURATION_WEEKS   = 4;
const SELECTED_LEAGUES: number[] = []; // empty = standard bundle

// ── Load wallet from env ─────────────────────────────────────────────────────

function loadWallet(): Keypair {
  const raw = process.env.WALLET_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "Set WALLET_PRIVATE_KEY env var to your wallet secret key as a JSON array.\n" +
      "Example: export WALLET_PRIVATE_KEY='[12,34,...]'"
    );
  }
  try {
    const secretKey = Uint8Array.from(JSON.parse(raw));
    const kp = Keypair.fromSecretKey(secretKey);
    console.log("✅ Wallet loaded:", kp.publicKey.toBase58());
    return kp;
  } catch {
    throw new Error("WALLET_PRIVATE_KEY must be a JSON array of 64 numbers.");
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function activate() {
  const keypair   = loadWallet();
  const wallet    = new anchor.Wallet(keypair);
  const connection = new Connection(RPC_URL, "confirmed");
  const provider  = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Dynamically load IDL (download from TxLINE docs)
  const idlUrl = "https://txline.txodds.com/documentation/idl-types-mainnet";
  console.log("\n1️⃣  Loading program IDL...");

  // Use program address directly — IDL fetched from on-chain
  const program = await anchor.Program.at(PROGRAM_ID, provider);

  // ── Step 1: Get guest JWT ────────────────────────────────────────────────
  console.log("\n2️⃣  Getting guest JWT...");
  const authRes = await axios.post(`${API_ORIGIN}/auth/guest/start`);
  const jwt: string = authRes.data.token;
  console.log("   JWT obtained ✅");

  // ── Step 2: Derive PDAs ───────────────────────────────────────────────────
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")], PROGRAM_ID
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_MINT, tokenTreasuryPda, true,
    TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")], PROGRAM_ID
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_MINT, keypair.publicKey, false,
    TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // ── Step 3: Subscribe on-chain (free — no TxL payment needed) ────────────
  console.log(`\n3️⃣  Subscribing on-chain (service level ${SERVICE_LEVEL_ID}, ${DURATION_WEEKS} weeks)...`);
  const txSig = await (program.methods as any)
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accounts({
      user: keypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: TXL_MINT,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("   Subscription tx:", txSig, "✅");

  // ── Step 4: Sign activation message ──────────────────────────────────────
  console.log("\n4️⃣  Signing activation message...");
  const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, keypair.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  // ── Step 5: Activate API token ────────────────────────────────────────────
  console.log("\n5️⃣  Activating API token...");
  const activationRes = await axios.post(
    `${API_BASE}/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  const apiToken: string = activationRes.data.token ?? activationRes.data;

  console.log("\n" + "═".repeat(60));
  console.log("🎉  ACTIVATION COMPLETE");
  console.log("═".repeat(60));
  console.log("\nYour TxLINE API Token:");
  console.log(apiToken);
  console.log("\nAdd this to:");
  console.log("  1. Your .env file:          TXLINE_API_TOKEN=" + apiToken.substring(0, 20) + "...");
  console.log("  2. Replit Secrets:          TXLINE_API_TOKEN");
  console.log("  3. Railway env vars:        TXLINE_API_TOKEN");
  console.log("  4. Supabase Edge Functions: TXLINE_API_TOKEN");
  console.log("\nToken is valid for", DURATION_WEEKS, "weeks. Re-run this script to renew.");
  console.log("═".repeat(60));
}

activate().catch((err) => {
  console.error("\n❌ Activation failed:", err.message ?? err);
  if (err.response?.data) {
    console.error("   API response:", JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
