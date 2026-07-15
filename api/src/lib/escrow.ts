import { createHash } from "node:crypto";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID ?? "J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai",
);
const connection = new Connection(
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

function decodeEscrow(data: Buffer): EscrowState {
  const expected = accountDiscriminator("EscrowState");
  if (!data.subarray(0, 8).equals(expected)) throw new Error("Invalid Stakely escrow account");

  let offset = 8;
  const betIdLength = data.readUInt32LE(offset);
  offset += 4;
  const betId = data.subarray(offset, offset + betIdLength).toString("utf8");
  offset += betIdLength;
  const creator = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const counterparty = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
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

  const [expectedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(input.betId)],
    PROGRAM_ID,
  );
  const suppliedPda = new PublicKey(input.escrowPda);
  if (!expectedPda.equals(suppliedPda)) throw new Error("Escrow PDA does not match the bet ID");

  const account = await connection.getAccountInfo(suppliedPda, "confirmed");
  if (!account || !account.owner.equals(PROGRAM_ID)) throw new Error("Escrow account was not created by Stakely");

  const state = decodeEscrow(account.data);
  const expectedAmount = BigInt(Math.round(input.amountUsdc * 1_000_000));
  if (state.betId !== input.betId) throw new Error("On-chain bet ID does not match");
  if (state.creator.toBase58() !== input.creatorWallet) throw new Error("Wallet does not own this escrow");
  if (state.amount !== expectedAmount) throw new Error("On-chain stake does not match the challenge");
  if (state.creatorSide !== sideNumbers[input.creatorSide]) throw new Error("On-chain outcome does not match the challenge");
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
  const [expectedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(input.betId)],
    PROGRAM_ID,
  );
  const suppliedPda = new PublicKey(input.escrowPda);
  if (!expectedPda.equals(suppliedPda)) throw new Error("Escrow PDA does not match the bet ID");

  const account = await connection.getAccountInfo(suppliedPda, "confirmed");
  if (!account || !account.owner.equals(PROGRAM_ID)) throw new Error("Stakely escrow account was not found");
  const state = decodeEscrow(account.data);
  const expectedAmount = BigInt(Math.round(input.amountUsdc * 1_000_000));
  if (state.betId !== input.betId || state.amount !== expectedAmount) throw new Error("On-chain escrow terms do not match");
  if (state.counterparty.toBase58() !== input.counterpartyWallet) throw new Error("Wallet did not fund this escrow");
  if (state.status !== 1) throw new Error("Escrow has not been funded by both sides");
}
