import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

const rpcUrl = process.env.SOLANA_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const stakelyProgramId = new PublicKey(
  process.env.STAKELY_MAINNET_PROGRAM_ID ?? "J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai",
);
const txlineProgramId = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const deployerAddress = process.env.STAKELY_DEPLOYER_ADDRESS
  ? new PublicKey(process.env.STAKELY_DEPLOYER_ADDRESS)
  : null;
const binaryPath = path.resolve(process.cwd(), "target/deploy/stakely_escrow.so");

async function main() {
  const connection = new Connection(rpcUrl, "confirmed");
  const binaryBytes = existsSync(binaryPath) ? statSync(binaryPath).size : null;
  const [stakelyAccount, txlineAccount, mint, deployerLamports, rentLamports] = await Promise.all([
    connection.getAccountInfo(stakelyProgramId),
    connection.getAccountInfo(txlineProgramId),
    getMint(connection, usdcMint, "confirmed", TOKEN_PROGRAM_ID),
    deployerAddress ? connection.getBalance(deployerAddress) : Promise.resolve(null),
    binaryBytes ? connection.getMinimumBalanceForRentExemption(binaryBytes) : Promise.resolve(null),
  ]);

  const checks = [
    result("TxLINE mainnet verifier is executable", Boolean(txlineAccount?.executable), txlineProgramId.toBase58()),
    result("Circle USDC mainnet mint is valid", mint.decimals === 6, `${usdcMint.toBase58()} (${mint.decimals} decimals)`),
    result("Stakely mainnet program is executable", Boolean(stakelyAccount?.executable), stakelyProgramId.toBase58()),
    result("Compiled escrow binary exists", binaryBytes !== null, binaryBytes ? `${binaryBytes.toLocaleString()} bytes` : binaryPath),
    result(
      "Deployer can cover the program rent estimate",
      deployerLamports !== null && rentLamports !== null && deployerLamports > rentLamports,
      deployerLamports === null
        ? "Set STAKELY_DEPLOYER_ADDRESS"
        : `${toSol(deployerLamports)} SOL available; ${toSol(rentLamports ?? 0)} SOL minimum program-data rent estimate`,
    ),
  ];

  console.log("Stakely mainnet preflight\n");
  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}\n      ${check.detail}`);
  console.log("\nThis preflight checks public network state only. It does not certify contract security, TxLINE CPI settlement, legal readiness, or operational key management.");

  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

function result(name: string, ok: boolean, detail: string) {
  return { name, ok, detail };
}

function toSol(lamports: number) {
  return (lamports / 1_000_000_000).toFixed(6);
}

main().catch((error) => {
  console.error("Mainnet preflight failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
