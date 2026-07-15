import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import idl from "../idl/stakely_escrow.json";
import type { BetSide } from "./api";
import type { InjectedSolanaWallet } from "../providers/WalletProvider";

export const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL ?? clusterApiUrl("devnet");
export const ESCROW_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_ESCROW_PROGRAM_ID ?? idl.address,
);
export const DEVNET_USDC_MINT = new PublicKey(
  import.meta.env.VITE_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

const connection = new Connection(SOLANA_RPC_URL, "confirmed");
const sideNumbers: Record<BetSide, number> = { home: 0, draw: 1, away: 2 };
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export async function getEscrowProgramStatus() {
  const account = await connection.getAccountInfo(ESCROW_PROGRAM_ID);
  return { deployed: Boolean(account?.executable), programId: ESCROW_PROGRAM_ID.toBase58() };
}

export async function createEscrowChallenge(input: {
  wallet: InjectedSolanaWallet;
  publicKey: PublicKey;
  betId: string;
  amountUsdc: number;
  side: BetSide;
}) {
  const programAccount = await connection.getAccountInfo(ESCROW_PROGRAM_ID);
  if (!programAccount?.executable) throw new Error("Stakely escrow is not deployed on devnet.");

  const [creatorTokenAccount] = PublicKey.findProgramAddressSync(
    [input.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DEVNET_USDC_MINT.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  let balance = 0;
  try {
    balance = Number((await connection.getTokenAccountBalance(creatorTokenAccount)).value.uiAmount ?? 0);
  } catch {
    throw new Error("This wallet needs devnet USDC before it can fund a challenge.");
  }
  if (balance < input.amountUsdc) {
    throw new Error(`This wallet has ${balance.toFixed(2)} devnet USDC; ${input.amountUsdc.toFixed(2)} is required.`);
  }

  const anchorWallet = {
    publicKey: input.publicKey,
    signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) =>
      input.wallet.signTransaction(transaction),
    signAllTransactions: <T extends Transaction | VersionedTransaction>(transactions: T[]) =>
      input.wallet.signAllTransactions(transactions),
  };
  const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
  const program = new Program(idl as Idl, provider);
  const betSeed = new TextEncoder().encode(input.betId);
  const [escrow] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("escrow"), betSeed],
    ESCROW_PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("vault"), betSeed],
    ESCROW_PROGRAM_ID,
  );

  const amount = new BN(Math.round(input.amountUsdc * 1_000_000));
  const signature = await program.methods
    .createEscrow(input.betId, amount, sideNumbers[input.side])
    .accounts({
      creator: input.publicKey,
      escrow,
      usdcMint: DEVNET_USDC_MINT,
      vault,
      creatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  return { signature, escrowPda: escrow.toBase58(), vaultPda: vault.toBase58() };
}
