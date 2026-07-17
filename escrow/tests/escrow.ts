import * as anchor from "@coral-xyz/anchor";
import assert from "node:assert/strict";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

describe("stakely-escrow-v2", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program: any = anchor.workspace.StakelyEscrow;
  const authority = (provider.wallet as any).payer as Keypair;
  const creator = Keypair.generate();
  const counterparty = Keypair.generate();
  const amount = 5_000_000;
  const fixtureId = new anchor.BN(18_175_981);
  const betId = `v2_${Date.now()}`;

  let mint: PublicKey;
  let creatorAta: PublicKey;
  let counterpartyAta: PublicKey;
  let refundAfter: anchor.BN;

  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config_v2")],
    program.programId,
  );
  const [programData] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  );
  const [escrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(betId)],
    program.programId,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(betId)],
    program.programId,
  );

  before(async () => {
    await provider.sendAndConfirm(new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: creator.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: counterparty.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      }),
    ));

    mint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
    creatorAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      mint,
      creator.publicKey,
    )).address;
    counterpartyAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      counterparty,
      mint,
      counterparty.publicKey,
    )).address;
    await mintTo(provider.connection, authority, mint, creatorAta, authority, amount * 2);
    await mintTo(provider.connection, authority, mint, counterpartyAta, authority, amount * 2);

    refundAfter = new anchor.BN(Math.floor(Date.now() / 1000) + 3_605);
  });

  it("blocks initialization by a wallet that is not the upgrade authority", async () => {
    await assert.rejects(
      program.methods
        .initialize(creator.publicKey)
        .accounts({
          payer: creator.publicKey,
          globalConfig,
          acceptedMint: mint,
          txlineProgram: program.programId,
          program: program.programId,
          programData,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc(),
      /Not authorized|Unauthorized|constraint/i,
    );
  });

  it("pins the accepted mint and TxLINE program in global config", async () => {
    await program.methods
      .initialize(authority.publicKey)
      .accounts({
        payer: authority.publicKey,
        globalConfig,
        acceptedMint: mint,
        txlineProgram: program.programId,
        program: program.programId,
        programData,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.globalConfig.fetch(globalConfig);
    assert.equal(config.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(config.acceptedMint.toBase58(), mint.toBase58());
    assert.equal(config.txlineProgram.toBase58(), program.programId.toBase58());
  });

  it("rejects an unapproved token mint", async () => {
    const wrongMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
    const wrongAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      wrongMint,
      creator.publicKey,
    )).address;
    const wrongBetId = `bad_${Date.now()}`;
    const [wrongEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(wrongBetId)],
      program.programId,
    );
    const [wrongVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), Buffer.from(wrongBetId)],
      program.programId,
    );

    await assert.rejects(
      program.methods
        .createEscrow(wrongBetId, fixtureId, true, new anchor.BN(amount), 0, refundAfter)
        .accounts({
          creator: creator.publicKey,
          globalConfig,
          acceptedMint: wrongMint,
          escrow: wrongEscrow,
          vault: wrongVault,
          creatorTokenAccount: wrongAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc(),
      /configured token mint|ConstraintAddress/i,
    );
  });

  it("creates a fixture-bound escrow with the approved mint", async () => {
    await program.methods
      .createEscrow(betId, fixtureId, true, new anchor.BN(amount), 0, refundAfter)
      .accounts({
        creator: creator.publicKey,
        globalConfig,
        acceptedMint: mint,
        escrow,
        vault,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const state = await program.account.escrowState.fetch(escrow);
    assert.equal(state.fixtureId.toString(), fixtureId.toString());
    assert.equal(state.participant1IsHome, true);
    assert.equal(state.mint.toBase58(), mint.toBase58());
    assert.equal(state.amount.toNumber(), amount);
    assert.equal(state.status, 0);
  });

  it("rejects self-acceptance and accepts a real counterparty", async () => {
    await assert.rejects(
      program.methods
        .acceptEscrow(betId)
        .accounts({
          counterparty: creator.publicKey,
          escrow,
          vault,
          counterpartyTokenAccount: creatorAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      /own challenge|SelfBet/i,
    );

    await program.methods
      .acceptEscrow(betId)
      .accounts({
        counterparty: counterparty.publicKey,
        escrow,
        vault,
        counterpartyTokenAccount: counterpartyAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([counterparty])
      .rpc();

    const state = await program.account.escrowState.fetch(escrow);
    const vaultBalance = await provider.connection.getTokenAccountBalance(vault);
    assert.equal(state.counterparty.toBase58(), counterparty.publicKey.toBase58());
    assert.equal(state.status, 1);
    assert.equal(Number(vaultBalance.value.amount), amount * 2);
  });

  it("rejects a redirected creator payout account before proof validation", async () => {
    await assert.rejects(
      program.methods
        .settleEscrow(betId, fakeFinalProof())
        .accounts({
          settler: authority.publicKey,
          globalConfig,
          txlineProgram: program.programId,
          dailyScoresMerkleRoots: escrow,
          escrow,
          vault,
          creatorTokenAccount: counterpartyAta,
          counterpartyTokenAccount: counterpartyAta,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
      /token authority|ConstraintTokenOwner/i,
    );
  });

  it("rejects an unverified final-score proof without moving funds", async () => {
    await assert.rejects(
      program.methods
        .settleEscrow(betId, fakeFinalProof())
        .accounts({
          settler: authority.publicKey,
          globalConfig,
          txlineProgram: program.programId,
          dailyScoresMerkleRoots: escrow,
          escrow,
          vault,
          creatorTokenAccount: creatorAta,
          counterpartyTokenAccount: counterpartyAta,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    );

    const vaultBalance = await provider.connection.getTokenAccountBalance(vault);
    assert.equal(Number(vaultBalance.value.amount), amount * 2);
  });

  it("keeps both stakes locked before the recovery deadline", async () => {
    await assert.rejects(
      program.methods
        .refundExpired(betId)
        .accounts({
          caller: counterparty.publicKey,
          escrow,
          vault,
          creatorTokenAccount: creatorAta,
          counterpartyTokenAccount: counterpartyAta,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([counterparty])
        .rpc(),
      /not available yet|RefundNotAvailable/i,
    );

    const vaultBalance = await provider.connection.getTokenAccountBalance(vault);
    assert.equal(Number(vaultBalance.value.amount), amount * 2);
  });

  function fakeFinalProof() {
    const zeroHash = Array.from({ length: 32 }, () => 0);
    return {
      ts: new anchor.BN(Date.now()),
      fixtureSummary: {
        fixtureId,
        updateStats: {
          updateCount: 1,
          minTimestamp: new anchor.BN(Date.now()),
          maxTimestamp: new anchor.BN(Date.now()),
        },
        eventsSubTreeRoot: zeroHash,
      },
      fixtureProof: [],
      mainTreeProof: [],
      eventStatRoot: zeroHash,
      stats: [
        { stat: { key: 1, value: 2, period: 100 }, statProof: [] },
        { stat: { key: 2, value: 1, period: 100 }, statProof: [] },
      ],
    };
  }
});
