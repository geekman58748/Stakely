/**
 * Stakely Escrow — devnet integration tests
 * Run: npm test
 *
 * Requires the configured authority to have devnet SOL. The test creates a
 * temporary six-decimal token mint so it never touches real USDC.
 */
import * as anchor from "@coral-xyz/anchor";
import assert from "node:assert/strict";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo, createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("stakely-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program: any = anchor.workspace.StakelyEscrow;
  const keeper = (provider.wallet as any).payer as Keypair;

  let usdcMint:   PublicKey;
  let creator:    Keypair;
  let counterparty: Keypair;
  let creatorAta:    any;
  let counterpartyAta: any;

  const BET_ID = `test_bet_${Date.now()}`;
  const AMOUNT = 5_000_000; // 5 USDC (6 decimals)

  before(async () => {
    creator      = Keypair.generate();
    counterparty = Keypair.generate();

    // Fund both throwaway wallets from the devnet test authority. This avoids
    // rate-limited faucets and keeps the test deterministic.
    await provider.sendAndConfirm(new Transaction().add(
      SystemProgram.transfer({ fromPubkey: keeper.publicKey, toPubkey: creator.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }),
      SystemProgram.transfer({ fromPubkey: keeper.publicKey, toPubkey: counterparty.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }),
    ));

    // Create mock USDC
    usdcMint = await createMint(provider.connection, keeper, keeper.publicKey, null, 6);

    // Create ATAs + fund them
    creatorAta     = await getOrCreateAssociatedTokenAccount(provider.connection, creator, usdcMint, creator.publicKey);
    counterpartyAta = await getOrCreateAssociatedTokenAccount(provider.connection, counterparty, usdcMint, counterparty.publicKey);

    await mintTo(provider.connection, keeper, usdcMint, creatorAta.address,     keeper, AMOUNT * 2);
    await mintTo(provider.connection, keeper, usdcMint, counterpartyAta.address, keeper, AMOUNT * 2);
  });

  it("initializes global config", async () => {
    const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global_config")], program.programId);
    try {
      await program.methods.initialize(keeper.publicKey).accounts({
        payer: keeper.publicKey, globalConfig, systemProgram: anchor.web3.SystemProgram.programId,
      }).rpc();
    } catch { /* already initialized */ }
    const config = await program.account.globalConfig.fetch(globalConfig);
    assert.equal(config.authority.toBase58(), keeper.publicKey.toBase58());
  });

  it("creates escrow and locks creator funds", async () => {
    const [escrow] = PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(BET_ID)], program.programId);
    const [vault]  = PublicKey.findProgramAddressSync([Buffer.from("vault"),  Buffer.from(BET_ID)], program.programId);

    const signature = await program.methods.createEscrow(BET_ID, new anchor.BN(AMOUNT), 0).accounts({
      creator: creator.publicKey, escrow, usdcMint, vault,
      creatorTokenAccount: creatorAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).signers([creator]).rpc();
    console.log(`      create: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    const state = await program.account.escrowState.fetch(escrow);
    assert.equal(state.status, 0); // Created
    assert.equal(state.amount.toNumber(), AMOUNT);
  });

  it("counterparty accepts and vault holds 2x", async () => {
    const [escrow] = PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(BET_ID)], program.programId);
    const [vault]  = PublicKey.findProgramAddressSync([Buffer.from("vault"),  Buffer.from(BET_ID)], program.programId);

    const signature = await program.methods.acceptEscrow(BET_ID).accounts({
      counterparty: counterparty.publicKey, escrow, vault,
      counterpartyTokenAccount: counterpartyAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([counterparty]).rpc();
    console.log(`      accept: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    const vaultAccount = await provider.connection.getTokenAccountBalance(vault);
    assert.equal(parseInt(vaultAccount.value.amount), AMOUNT * 2);
  });

  it("keeper settles — winner receives full vault", async () => {
    const [escrow]      = PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(BET_ID)], program.programId);
    const [vault]       = PublicKey.findProgramAddressSync([Buffer.from("vault"),  Buffer.from(BET_ID)], program.programId);
    const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global_config")], program.programId);

    const beforeBalance = parseInt((await provider.connection.getTokenAccountBalance(creatorAta.address)).value.amount);

    const signature = await program.methods.settleEscrow(BET_ID, creator.publicKey).accounts({
      authority: keeper.publicKey, globalConfig, escrow, vault,
      winnerTokenAccount: creatorAta.address,
      creator: creator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();
    console.log(`      settle: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    const afterBalance = parseInt((await provider.connection.getTokenAccountBalance(creatorAta.address)).value.amount);
    assert.equal(afterBalance - beforeBalance, AMOUNT * 2);
  });
});
