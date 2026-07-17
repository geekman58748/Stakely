import { createHash } from "node:crypto";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID ?? "J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai",
);
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
export const connection = new Connection(
  process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet"),
  "confirmed",
);
const sideNumbers: Record<string, number> = { home: 0, draw: 1, away: 2 };

type EscrowState = {
  betId: string;
  creator: PublicKey;
  counterparty: PublicKey;
  amount: bigint;
  creatorSide: number;
  status: number;
};

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function instructionDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function onchainBetId(betId: string) {
  const compactId = betId.replaceAll("-", "");
  if (Buffer.byteLength(compactId) > 32) throw new Error("Bet ID too long for Solana seed");
  return compactId;
}

export function decodeEscrow(data: Buffer): EscrowState {
  const expected = accountDiscriminator("EscrowState");
  if (!data.subarray(0, 8).equals(expected)) throw new Error("Invalid Stakely escrow account");
  let offset = 8;
  const betIdLength = data.readUInt32LE(offset); offset += 4;
  const betId = data.subarray(offset, offset + betIdLength).toString("utf8"); offset += betIdLength;
  const creator = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const counterparty = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const amount = data.readBigUInt64LE(offset); offset += 8;
  const creatorSide = data.readUInt8(offset);
  const status = data.readUInt8(offset + 1);
  return { betId, creator, counterparty, amount, creatorSide, status };
}

async function requireConfirmedSignature(signature: string) {
  const status = (await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  })).value[0];
  if (!status || status.err || !["confirmed", "finalized"].includes(status.confirmationStatus ?? "")) {
    throw new Error("Escrow transaction is not confirmed on devnet");
  }
}

export async function verifyCreatedEscrow(input: {
  betId: string;
  escrowPda: string;
  signature: string;
  creatorWallet: string;
  amountUsdc: number;
  creatorSide: string;
}) {
  await requireConfirmedSignature(input.signature);
  const escrowBetId = onchainBetId(input.betId);
  const [expectedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(escrowBetId)], PROGRAM_ID,
  );
  const suppliedPda = new PublicKey(input.escrowPda);
  if (!expectedPda.equals(suppliedPda)) throw new Error("Escrow PDA does not match the bet ID");
  const account = await connection.getAccountInfo(suppliedPda, "confirmed");
  if (!account || !account.owner.equals(PROGRAM_ID)) throw new Error("Escrow not created by Stakely");
  const state = decodeEscrow(account.data);
  const expectedAmount = BigInt(Math.round(input.amountUsdc * 1_000_000));
  if (state.betId !== escrowBetId) throw new Error("On-chain bet ID mismatch");
  if (state.creator.toBase58() !== input.creatorWallet) throw new Error("Wallet does not own this escrow");
  if (state.amount !== expectedAmount) throw new Error("On-chain stake does not match challenge");
  if (state.creatorSide !== sideNumbers[input.creatorSide]) throw new Error("On-chain outcome mismatch");
  if (state.status !== 0) throw new Error("Escrow is not awaiting an opponent");
}

export async function verifyAcceptedEscrow(input: {
  betId: string;
  escrowPda: string;
  signature: string;
  counterpartyWallet: string;
  amountUsdc: number;
}) {
  await requireConfirmedSignature(input.signature);
  const escrowBetId = onchainBetId(input.betId);
  const [expectedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(escrowBetId)], PROGRAM_ID,
  );
  const suppliedPda = new PublicKey(input.escrowPda);
  if (!expectedPda.equals(suppliedPda)) throw new Error("Escrow PDA mismatch");
  const account = await connection.getAccountInfo(suppliedPda, "confirmed");
  if (!account || !account.owner.equals(PROGRAM_ID)) throw new Error("Escrow not created by Stakely");
  const state = decodeEscrow(account.data);
  if (state.betId !== escrowBetId) throw new Error("On-chain bet ID mismatch");
  if (state.counterparty.toBase58() !== input.counterpartyWallet) throw new Error("Wallet is not escrow counterparty");
  if (state.status !== 1) throw new Error("Escrow has not been accepted on-chain");
}

/**
 * Keeper: settle an on-chain escrow and send vault funds to the winner.
 * Chain-first: DB must never update until this returns a signature.
 * Returns the confirmed Solana transaction signature.
 */
export async function settleOnChain(betId: string, winnerWallet: string): Promise<string> {
  const rawKey = process.env.STAKELY_DEV_WALLET;
  if (!rawKey) throw new Error("STAKELY_DEV_WALLET not set — keeper cannot settle on-chain");

  const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(rawKey)));
  const escrowBetId = onchainBetId(betId);

  const [escrowPda] = PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(escrowBetId)], PROGRAM_ID);
  const [vaultPda]  = PublicKey.findProgramAddressSync([Buffer.from("vault"),  Buffer.from(escrowBetId)], PROGRAM_ID);
  const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global_config")], PROGRAM_ID);

  const account = await connection.getAccountInfo(escrowPda, "confirmed");
  if (!account) throw new Error(`Escrow not found on-chain for bet ${betId}`);
  const state = decodeEscrow(account.data);

  // Status 2 = already settled — idempotent guard
  if (state.status === 2) {
    console.log(`[keeper] bet ${betId} already settled on-chain, skipping`);
    return "already_settled";
  }

  const winner = new PublicKey(winnerWallet);
  const winnerAta = getAssociatedTokenAddressSync(USDC_MINT, winner);

  // Borsh encode: discriminator + String (u32 LE len + bytes) + Pubkey (32 bytes)
  const discriminator = instructionDiscriminator("settle_escrow");
  const betIdBuf = Buffer.from(escrowBetId);
  const lenBuf   = Buffer.allocUnsafe(4); lenBuf.writeUInt32LE(betIdBuf.length, 0);
  const data = Buffer.concat([discriminator, lenBuf, betIdBuf, winner.toBuffer()]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: keeper.publicKey, isSigner: true,  isWritable: true  },
      { pubkey: globalConfig,     isSigner: false, isWritable: false },
      { pubkey: escrowPda,        isSigner: false, isWritable: true  },
      { pubkey: vaultPda,         isSigner: false, isWritable: true  },
      { pubkey: winnerAta,        isSigner: false, isWritable: true  },
      { pubkey: state.creator,    isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  return await sendAndConfirmTransaction(connection, tx, [keeper], { commitment: "confirmed" });
}
