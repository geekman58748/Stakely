import { createHash } from "node:crypto";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID ?? "J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai",
);
const connection = new Connection(
  process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet"),
  "confirmed",
);
const network = process.env.TXLINE_NETWORK === "mainnet" ? "mainnet" : "devnet";
const expectedMint = new PublicKey(
  process.env.USDC_MINT
    ?? (network === "mainnet"
      ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
);
const expectedTxlineProgram = new PublicKey(
  process.env.TXLINE_PROGRAM_ID
    ?? (network === "mainnet"
      ? "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"
      : "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
);
const sideNumbers: Record<string, number> = { home: 0, draw: 1, away: 2 };
const CREATE_ESCROW_DISCRIMINATOR = Buffer.from([253, 215, 165, 116, 36, 108, 68, 80]);
const ACCEPT_ESCROW_DISCRIMINATOR = Buffer.from([193, 2, 224, 245, 36, 116, 65, 154]);
const SETTLE_ESCROW_DISCRIMINATOR = Buffer.from([22, 135, 160, 194, 23, 186, 124, 110]);

type EscrowState = {
  betId: string;
  fixtureId: bigint;
  participant1IsHome: boolean;
  creator: PublicKey;
  counterparty: PublicKey;
  mint: PublicKey;
  amount: bigint;
  creatorSide: number;
  status: number;
  refundAfter: bigint;
};

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

export function onchainBetId(betId: string) {
  const compactId = betId.replaceAll("-", "");
  if (Buffer.byteLength(compactId) > 32) throw new Error("Bet ID is too long for a Solana escrow seed");
  return compactId;
}

export async function isEscrowV2Ready() {
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config_v2")],
    PROGRAM_ID,
  );
  const [programAccount, configAccount] = await connection.getMultipleAccountsInfo(
    [PROGRAM_ID, globalConfig],
    "confirmed",
  );
  if (!programAccount?.executable || !configAccount?.owner.equals(PROGRAM_ID)) return false;
  if (configAccount.data.length < 8 + 97) return false;
  if (!configAccount.data.subarray(0, 8).equals(accountDiscriminator("GlobalConfig"))) return false;

  const acceptedMint = new PublicKey(configAccount.data.subarray(8 + 32, 8 + 64));
  const txlineProgram = new PublicKey(configAccount.data.subarray(8 + 64, 8 + 96));
  return acceptedMint.equals(expectedMint) && txlineProgram.equals(expectedTxlineProgram);
}

function decodeEscrow(data: Buffer): EscrowState {
  const expected = accountDiscriminator("EscrowState");
  if (!data.subarray(0, 8).equals(expected)) throw new Error("Invalid Stakely escrow account");

  let offset = 8;
  const betIdLength = data.readUInt32LE(offset);
  offset += 4;
  const betId = data.subarray(offset, offset + betIdLength).toString("utf8");
  offset += betIdLength;
  const fixtureId = data.readBigInt64LE(offset);
  offset += 8;
  const participant1IsHome = data.readUInt8(offset) === 1;
  offset += 1;
  const creator = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const counterparty = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const mint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
  const creatorSide = data.readUInt8(offset);
  const status = data.readUInt8(offset + 1);
  offset += 2 + 8 + 8;
  const refundAfter = data.readBigInt64LE(offset);
  return { betId, fixtureId, participant1IsHome, creator, counterparty, mint, amount, creatorSide, status, refundAfter };
}

async function requireConfirmedSignature(
  signature: string,
  requiredAccounts: PublicKey[],
  instructionDiscriminator: Buffer,
) {
  const status = (await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  })).value[0];
  if (!status || status.err || !["confirmed", "finalized"].includes(status.confirmationStatus ?? "")) {
    throw new Error("Escrow transaction is not confirmed on Solana");
  }
  const transaction = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction) throw new Error("Escrow transaction details are unavailable");
  const accountKeys = transaction.transaction.message.getAccountKeys({
    accountKeysFromLookups: transaction.meta?.loadedAddresses,
  });
  for (const required of requiredAccounts) {
    if (!accountKeys.staticAccountKeys.some((key) => key.equals(required))
      && !accountKeys.accountKeysFromLookups?.writable.some((key) => key.equals(required))
      && !accountKeys.accountKeysFromLookups?.readonly.some((key) => key.equals(required))) {
      throw new Error("Escrow transaction does not reference the expected program and account");
    }
  }
  const expectedInstruction = transaction.transaction.message.compiledInstructions.some((instruction) => {
    const instructionProgram = accountKeys.get(instruction.programIdIndex);
    return Boolean(
      instructionProgram?.equals(PROGRAM_ID)
      && Buffer.from(instruction.data).subarray(0, 8).equals(instructionDiscriminator),
    );
  });
  if (!expectedInstruction) throw new Error("Escrow transaction contains the wrong Stakely instruction");
}

export async function verifyCreatedEscrow(input: {
  betId: string;
  escrowPda: string;
  signature: string;
  creatorWallet: string;
  amountUsdc: number;
  creatorSide: string;
  fixtureId: string;
  participant1IsHome: boolean;
  refundAfter: number;
}) {
  const escrowBetId = onchainBetId(input.betId);

  const [expectedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(escrowBetId)],
    PROGRAM_ID,
  );
  const suppliedPda = new PublicKey(input.escrowPda);
  if (!expectedPda.equals(suppliedPda)) throw new Error("Escrow PDA does not match the bet ID");
  await requireConfirmedSignature(input.signature, [PROGRAM_ID, suppliedPda], CREATE_ESCROW_DISCRIMINATOR);

  const account = await connection.getAccountInfo(suppliedPda, "confirmed");
  if (!account || !account.owner.equals(PROGRAM_ID)) throw new Error("Escrow account was not created by Stakely");

  const state = decodeEscrow(account.data);
  const expectedAmount = BigInt(Math.round(input.amountUsdc * 1_000_000));
  if (state.betId !== escrowBetId) throw new Error("On-chain bet ID does not match");
  if (state.fixtureId !== BigInt(input.fixtureId)) throw new Error("On-chain fixture does not match");
  if (state.participant1IsHome !== input.participant1IsHome) throw new Error("On-chain participant ordering does not match TxLINE");
  if (state.creator.toBase58() !== input.creatorWallet) throw new Error("Wallet does not own this escrow");
  if (state.amount !== expectedAmount) throw new Error("On-chain stake does not match the challenge");
  if (state.creatorSide !== sideNumbers[input.creatorSide]) throw new Error("On-chain outcome does not match the challenge");
  if (state.status !== 0) throw new Error("Escrow is not awaiting an opponent");
  if (state.refundAfter !== BigInt(input.refundAfter)) throw new Error("On-chain recovery deadline does not match");
}

export async function verifyAcceptedEscrow(input: {
  betId: string;
  escrowPda: string;
  signature: string;
  counterpartyWallet: string;
  amountUsdc: number;
}) {
  const escrowBetId = onchainBetId(input.betId);
  const [expectedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(escrowBetId)],
    PROGRAM_ID,
  );
  const suppliedPda = new PublicKey(input.escrowPda);
  if (!expectedPda.equals(suppliedPda)) throw new Error("Escrow PDA does not match the bet ID");
  await requireConfirmedSignature(input.signature, [PROGRAM_ID, suppliedPda], ACCEPT_ESCROW_DISCRIMINATOR);

  const account = await connection.getAccountInfo(suppliedPda, "confirmed");
  if (!account || !account.owner.equals(PROGRAM_ID)) throw new Error("Stakely escrow account was not found");
  const state = decodeEscrow(account.data);
  const expectedAmount = BigInt(Math.round(input.amountUsdc * 1_000_000));
  if (state.betId !== escrowBetId || state.amount !== expectedAmount) throw new Error("On-chain escrow terms do not match");
  if (state.counterparty.toBase58() !== input.counterpartyWallet) throw new Error("Wallet did not fund this escrow");
  if (state.status !== 1) throw new Error("Escrow has not been funded by both sides");
}

export async function verifySettledEscrow(input: {
  betId: string;
  escrowPda: string;
  signature: string;
}) {
  const escrowBetId = onchainBetId(input.betId);
  const [expectedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(escrowBetId)],
    PROGRAM_ID,
  );
  const suppliedPda = new PublicKey(input.escrowPda);
  if (!expectedPda.equals(suppliedPda)) throw new Error("Escrow PDA does not match the bet ID");
  await requireConfirmedSignature(input.signature, [PROGRAM_ID, suppliedPda], SETTLE_ESCROW_DISCRIMINATOR);
  if (await connection.getAccountInfo(suppliedPda, "confirmed")) {
    throw new Error("Settlement transaction did not close the escrow account");
  }
}
