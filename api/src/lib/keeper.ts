import { AnchorProvider, BN, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import bs58 from "bs58";
import idl from "../idl/stakely_escrow.json";
import { onchainBetId } from "./escrow.js";

const network = process.env.TXLINE_NETWORK === "mainnet" ? "mainnet" : "devnet";
const connection = new Connection(
  process.env.SOLANA_RPC_URL ?? clusterApiUrl(network === "mainnet" ? "mainnet-beta" : "devnet"),
  "confirmed",
);
const programId = new PublicKey(process.env.ESCROW_PROGRAM_ID ?? idl.address);
const txlineProgramId = new PublicKey(
  process.env.TXLINE_PROGRAM_ID
    ?? (network === "mainnet"
      ? "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"
      : "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
);

export type SettlementParty = {
  id: string;
  wallet_address: string;
};

export type SettlementInput = {
  betId: string;
  fixtureId: string;
  creatorSide: "home" | "draw" | "away";
  participant1IsHome: boolean;
  creator: SettlementParty;
  counterparty: SettlementParty;
  proof: unknown;
};

export async function settleEscrowOnChain(input: SettlementInput) {
  const keeper = loadKeeper();
  const provider = new AnchorProvider(connection, new Wallet(keeper), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program: any = new Program(idl as Idl, provider);
  if (!program.programId.equals(programId)) {
    throw new Error("ESCROW_PROGRAM_ID does not match the bundled contract v2 IDL");
  }
  const betId = onchainBetId(input.betId);
  const payload = normalizeSettlementProof(input.proof, input.fixtureId);
  const epochDay = Math.floor(payload.fixtureSummary.updateStats.minTimestamp.toNumber() / 86_400_000);
  if (epochDay < 0 || epochDay > 65_535) throw new Error("TxLINE proof epoch is outside the u16 PDA range");

  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config_v2")],
    programId,
  );
  const [escrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(betId)],
    programId,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(betId)],
    programId,
  );
  const [dailyScoresMerkleRoots] = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)],
    txlineProgramId,
  );
  const escrowState = await program.account.escrowState.fetch(escrow);
  const creatorWallet = new PublicKey(input.creator.wallet_address);
  const counterpartyWallet = new PublicKey(input.counterparty.wallet_address);
  if (!escrowState.creator.equals(creatorWallet)) throw new Error("Creator wallet does not match the on-chain escrow");
  if (!escrowState.counterparty.equals(counterpartyWallet)) throw new Error("Counterparty wallet does not match the on-chain escrow");

  const creatorTokenAccount = getAssociatedTokenAddressSync(escrowState.mint, creatorWallet);
  const counterpartyTokenAccount = getAssociatedTokenAddressSync(escrowState.mint, counterpartyWallet);
  const signature = await program.methods
    .settleEscrow(betId, payload)
    .accounts({
      settler: keeper.publicKey,
      globalConfig,
      txlineProgram: txlineProgramId,
      dailyScoresMerkleRoots,
      escrow,
      vault,
      creatorTokenAccount,
      counterpartyTokenAccount,
      creator: creatorWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ])
    .rpc();

  const status = (await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  })).value[0];
  if (!status || status.err || !["confirmed", "finalized"].includes(status.confirmationStatus ?? "")) {
    throw new Error("Settlement transaction did not confirm");
  }
  if (await connection.getAccountInfo(escrow, "confirmed")) {
    throw new Error("Settlement confirmed but the escrow account is still open");
  }

  const participant1Score = payload.stats[0].stat.value;
  const participant2Score = payload.stats[1].stat.value;
  const [homeScore, awayScore] = input.participant1IsHome
    ? [participant1Score, participant2Score]
    : [participant2Score, participant1Score];
  const result = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
  const winner = input.creatorSide === result ? input.creator : input.counterparty;

  return {
    signature,
    winnerId: winner.id,
    result,
    homeScore,
    awayScore,
    dailyScoresRoot: dailyScoresMerkleRoots.toBase58(),
  };
}

export function normalizeSettlementProof(rawProof: unknown, expectedFixtureId: string) {
  const proof = rawProof as any;
  const summary = proof?.summary;
  const stats = proof?.statsToProve;
  const statProofs = proof?.statProofs;
  if (!summary?.updateStats || !Array.isArray(stats) || !Array.isArray(statProofs)) {
    throw new Error("TxLINE returned an incomplete V2 settlement proof");
  }
  if (stats.length !== 2 || statProofs.length !== 2) {
    throw new Error("TxLINE settlement proof must contain statKeys 1 and 2");
  }
  const fixtureId = String(summary.fixtureId);
  if (fixtureId !== expectedFixtureId) throw new Error("TxLINE proof fixture does not match the bet");

  const normalized = {
    ts: toBn(summary.updateStats.minTimestamp, "proof timestamp"),
    fixtureSummary: {
      fixtureId: toBn(summary.fixtureId, "fixture ID"),
      updateStats: {
        updateCount: toI32(summary.updateStats.updateCount, "update count"),
        minTimestamp: toBn(summary.updateStats.minTimestamp, "minimum timestamp"),
        maxTimestamp: toBn(summary.updateStats.maxTimestamp, "maximum timestamp"),
      },
      eventsSubTreeRoot: toBytes32(summary.eventStatsSubTreeRoot),
    },
    fixtureProof: toProofNodes(proof.subTreeProof),
    mainTreeProof: toProofNodes(proof.mainTreeProof),
    eventStatRoot: toBytes32(proof.eventStatRoot),
    stats: stats.map((stat: any, index: number) => ({
      stat: {
        key: toU32(stat.key, `stat ${index} key`),
        value: toI32(stat.value, `stat ${index} value`),
        period: toI32(stat.period, `stat ${index} period`),
      },
      statProof: toProofNodes(statProofs[index]),
    })),
  };
  if (normalized.stats[0].stat.key !== 1 || normalized.stats[1].stat.key !== 2) {
    throw new Error("TxLINE settlement proof stats are not ordered as keys 1 and 2");
  }
  if (normalized.stats.some((entry) => entry.stat.period !== 100)) {
    throw new Error("TxLINE settlement proof is not a final period 100 record");
  }
  return normalized;
}

function toProofNodes(value: unknown) {
  if (!Array.isArray(value)) throw new Error("TxLINE proof nodes are missing");
  return value.map((node: any) => ({
    hash: toBytes32(node.hash),
    isRightSibling: Boolean(node.isRightSibling),
  }));
}

function toBytes32(value: unknown): number[] {
  let bytes: Uint8Array;
  if (Array.isArray(value)) {
    bytes = Uint8Array.from(value);
  } else if (value instanceof Uint8Array) {
    bytes = value;
  } else if (typeof value === "string") {
    bytes = value.startsWith("0x")
      ? Buffer.from(value.slice(2), "hex")
      : Buffer.from(value, "base64");
  } else {
    throw new Error("TxLINE proof hash has an unsupported encoding");
  }
  if (bytes.length !== 32) throw new Error(`TxLINE proof hash is ${bytes.length} bytes, expected 32`);
  return Array.from(bytes);
}

function toBn(value: unknown, label: string) {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) {
    throw new Error(`Invalid TxLINE ${label}`);
  }
  return new BN(String(value));
}

function toI32(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < -2_147_483_648 || number > 2_147_483_647) {
    throw new Error(`Invalid TxLINE ${label}`);
  }
  return number;
}

function toU32(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 4_294_967_295) {
    throw new Error(`Invalid TxLINE ${label}`);
  }
  return number;
}

function loadKeeper() {
  const raw = process.env.ESCROW_KEEPER_WALLET;
  if (!raw) throw new Error("ESCROW_KEEPER_WALLET is not configured");
  try {
    const secret = raw.trim().startsWith("[")
      ? Uint8Array.from(JSON.parse(raw) as number[])
      : bs58.decode(raw.trim());
    return Keypair.fromSecretKey(secret);
  } catch {
    throw new Error("ESCROW_KEEPER_WALLET must be a JSON byte array or base58 secret key");
  }
}
