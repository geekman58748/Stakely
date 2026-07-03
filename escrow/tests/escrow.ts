/**
 * Stakely Escrow — devnet integration tests
 * Run: anchor test --skip-local-validator
 *
 * Requires funded devnet wallets and devnet USDC.
 * Devnet USDC faucet: https://spl-token-faucet.com/?token-name=USDC
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo, createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";

describe("stakely-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StakelyEscrow as Program<any>;
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

    // Airdrop SOL
    await Promise.all([
      provider.connection.confirmTransaction(await provider.connection.requestAirdrop(creator.key(), 1e9)),
      provider.connection.confirmTransaction(await provider.connection.requestAirdrop(counterparty.key(), 1e9)),
    ]);

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
    expect(config.authority.toBase58()).to.equal(keeper.publicKey.toBase58());
  });

  it("creates escrow and locks creator funds", async () => {
    const [escrow] = PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(BET_ID)], program.programId);
    const [vault]  = PublicKey.findProgramAddressSync([Buffer.from("vault"),  Buffer.from(BET_ID)], program.programId);

    await program.methods.createEscrow(BET_ID, new anchor.BN(AMOUNT), 0).accounts({
      creator: creator.publicKey, escrow, usdcMint, vault,
      creatorTokenAccount: creatorAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).signers([creator]).rpc();

    const state = await program.account.escrowState.fetch(escrow);
    expect(state.status).to.equal(0); // Created
    expect(state.amount.toNumber()).to.equal(AMOUNT);
  });

  it("counterparty accepts and vault holds 2x", async () => {
    const [escrow] = PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(BET_ID)], program.programId);
    const [vault]  = PublicKey.findProgramAddressSync([Buffer.from("vault"),  Buffer.from(BET_ID)], program.programId);

    await program.methods.acceptEscrow(BET_ID).accounts({
      counterparty: counterparty.publicKey, escrow, vault,
      counterpartyTokenAccount: counterpartyAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([counterparty]).rpc();

    const vaultAccount = await provider.connection.getTokenAccountBalance(vault);
    expect(parseInt(vaultAccount.value.amount)).to.equal(AMOUNT * 2);
  });

  it("keeper settles — winner receives full vault", async () => {
    const [escrow]      = PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(BET_ID)], program.programId);
    const [vault]       = PublicKey.findProgramAddressSync([Buffer.from("vault"),  Buffer.from(BET_ID)], program.programId);
    const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global_config")], program.programId);

    const beforeBalance = parseInt((await provider.connection.getTokenAccountBalance(creatorAta.address)).value.amount);

    await program.methods.settleEscrow(BET_ID, creator.publicKey).accounts({
      authority: keeper.publicKey, globalConfig, escrow, vault,
      winnerTokenAccount: creatorAta.address,
      creator: creator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();

    const afterBalance = parseInt((await provider.connection.getTokenAccountBalance(creatorAta.address)).value.amount);
    expect(afterBalance - beforeBalance).to.equal(AMOUNT * 2);
  });
});
