use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::{get_return_data, invoke},
    },
};
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("J2zMD6jRMFetFr82nqk1jBsmdSYSuDKKsbfnJRqHRcai");

const GLOBAL_CONFIG_SEED: &[u8] = b"global_config_v2";
const MAX_BET_ID_LEN: usize = 32;
const MIN_REFUND_DELAY_SECONDS: i64 = 60 * 60;
const MAX_REFUND_DELAY_SECONDS: i64 = 30 * 24 * 60 * 60;
const PARTICIPANT_1_SCORE_STAT_KEY: u32 = 1;
const PARTICIPANT_2_SCORE_STAT_KEY: u32 = 2;
const FINAL_PERIOD: i32 = 100;
const MAX_PROOF_NODES: usize = 32;
const MILLISECONDS_PER_DAY: i64 = 86_400_000;
const VALIDATE_STAT_V2_DISCRIMINATOR: [u8; 8] = [208, 215, 194, 214, 241, 71, 246, 178];

#[program]
pub mod stakely_escrow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        config.authority = authority;
        config.accepted_mint = ctx.accounts.accepted_mint.key();
        config.txline_program = ctx.accounts.txline_program.key();
        config.bump = ctx.bumps.global_config;
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, new_authority: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        config.authority = new_authority;

        emit!(ConfigUpdated {
            authority: config.authority,
            accepted_mint: config.accepted_mint,
            txline_program: config.txline_program,
        });
        Ok(())
    }

    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        bet_id: String,
        fixture_id: i64,
        participant1_is_home: bool,
        amount: u64,
        creator_side: u8,
        refund_after: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount > 0, StakelyError::ZeroAmount);
        require!(fixture_id > 0, StakelyError::InvalidFixture);
        require!(creator_side <= 2, StakelyError::InvalidSide);
        require!(bet_id.len() <= MAX_BET_ID_LEN, StakelyError::BetIdTooLong);
        require!(
            refund_after >= now.saturating_add(MIN_REFUND_DELAY_SECONDS)
                && refund_after <= now.saturating_add(MAX_REFUND_DELAY_SECONDS),
            StakelyError::InvalidRefundDeadline
        );

        let escrow = &mut ctx.accounts.escrow;
        escrow.bet_id = bet_id;
        escrow.fixture_id = fixture_id;
        escrow.participant1_is_home = participant1_is_home;
        escrow.creator = ctx.accounts.creator.key();
        escrow.counterparty = Pubkey::default();
        escrow.mint = ctx.accounts.accepted_mint.key();
        escrow.amount = amount;
        escrow.creator_side = creator_side;
        escrow.status = EscrowStatus::Created as u8;
        escrow.created_at = now;
        escrow.accepted_at = 0;
        escrow.refund_after = refund_after;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;

        transfer_tokens(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.creator_token_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            amount,
        )?;

        emit!(EscrowCreated {
            bet_id: escrow.bet_id.clone(),
            fixture_id,
            creator: escrow.creator,
            mint: escrow.mint,
            amount,
            creator_side,
            refund_after,
        });
        Ok(())
    }

    pub fn accept_escrow(ctx: Context<AcceptEscrow>, bet_id: String) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Created as u8,
            StakelyError::InvalidStatus
        );
        require!(
            escrow.creator != ctx.accounts.counterparty.key(),
            StakelyError::SelfBet
        );
        require!(
            Clock::get()?.unix_timestamp < escrow.refund_after,
            StakelyError::RefundDeadlinePassed
        );

        escrow.counterparty = ctx.accounts.counterparty.key();
        escrow.status = EscrowStatus::Accepted as u8;
        escrow.accepted_at = Clock::get()?.unix_timestamp;

        transfer_tokens(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.counterparty_token_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.counterparty.to_account_info(),
            escrow.amount,
        )?;

        emit!(EscrowAccepted {
            bet_id,
            counterparty: escrow.counterparty,
            accepted_at: escrow.accepted_at,
        });
        Ok(())
    }

    pub fn settle_escrow(
        ctx: Context<SettleEscrow>,
        bet_id: String,
        payload: StatValidationInput,
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Accepted as u8,
            StakelyError::InvalidStatus
        );

        validate_final_score_shape(escrow, &payload)?;
        validate_with_txline(&ctx, &payload)?;

        let participant1_score = payload.stats[0].stat.value;
        let participant2_score = payload.stats[1].stat.value;
        let (home_score, away_score) = if escrow.participant1_is_home {
            (participant1_score, participant2_score)
        } else {
            (participant2_score, participant1_score)
        };
        let winning_side = side_for_score(home_score, away_score);
        let creator_won = escrow.creator_side == winning_side;
        let winner = if creator_won {
            escrow.creator
        } else {
            escrow.counterparty
        };
        let winner_token_account = if creator_won {
            ctx.accounts.creator_token_account.to_account_info()
        } else {
            ctx.accounts.counterparty_token_account.to_account_info()
        };
        let payout = ctx.accounts.vault.amount;

        transfer_from_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            winner_token_account,
            escrow,
            &bet_id,
            payout,
        )?;
        close_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            escrow,
            &bet_id,
        )?;

        emit!(EscrowSettled {
            bet_id,
            fixture_id: escrow.fixture_id,
            winner,
            payout,
            home_score,
            away_score,
            proof_timestamp: payload.ts,
            daily_scores_root: ctx.accounts.daily_scores_merkle_roots.key(),
            settler: ctx.accounts.settler.key(),
        });
        Ok(())
    }

    pub fn cancel_escrow(ctx: Context<CancelEscrow>, bet_id: String) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Created as u8,
            StakelyError::InvalidStatus
        );

        transfer_from_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.creator_token_account.to_account_info(),
            escrow,
            &bet_id,
            ctx.accounts.vault.amount,
        )?;
        close_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            escrow,
            &bet_id,
        )?;

        emit!(EscrowCancelled { bet_id });
        Ok(())
    }

    pub fn refund_expired(ctx: Context<RefundExpired>, bet_id: String) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Accepted as u8,
            StakelyError::InvalidStatus
        );
        require!(
            refund_is_available(Clock::get()?.unix_timestamp, escrow.refund_after),
            StakelyError::RefundNotAvailable
        );
        require!(
            ctx.accounts.vault.amount >= escrow.amount.saturating_mul(2),
            StakelyError::VaultUnderfunded
        );

        transfer_from_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.creator_token_account.to_account_info(),
            escrow,
            &bet_id,
            escrow.amount,
        )?;
        ctx.accounts.vault.reload()?;
        let counterparty_refund = ctx.accounts.vault.amount;
        transfer_from_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.counterparty_token_account.to_account_info(),
            escrow,
            &bet_id,
            counterparty_refund,
        )?;
        close_vault(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            escrow,
            &bet_id,
        )?;

        emit!(EscrowRefunded {
            bet_id,
            creator: escrow.creator,
            counterparty: escrow.counterparty,
            amount_each: escrow.amount,
            caller: ctx.accounts.caller.key(),
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + GlobalConfig::SIZE,
        seeds = [GLOBAL_CONFIG_SEED],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,
    pub accepted_mint: Account<'info, Mint>,
    /// CHECK: The executable TxLINE program is pinned in global config.
    #[account(executable)]
    pub txline_program: UncheckedAccount<'info>,
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
            @ StakelyError::Unauthorized,
    )]
    pub program: Program<'info, crate::program::StakelyEscrow>,
    #[account(
        constraint = program_data.upgrade_authority_address == Some(payer.key())
            @ StakelyError::Unauthorized,
    )]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = authority @ StakelyError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(bet_id: String)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(address = global_config.accepted_mint @ StakelyError::InvalidMint)]
    pub accepted_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        space = 8 + EscrowState::SIZE,
        seeds = [b"escrow", bet_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(
        init,
        payer = creator,
        token::mint = accepted_mint,
        token::authority = vault,
        seeds = [b"vault", bet_id.as_bytes()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bet_id: String)]
pub struct AcceptEscrow<'info> {
    #[account(mut)]
    pub counterparty: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", bet_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(
        mut,
        seeds = [b"vault", bet_id.as_bytes()],
        bump = escrow.vault_bump,
        token::mint = escrow.mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = counterparty,
    )]
    pub counterparty_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(bet_id: String)]
pub struct SettleEscrow<'info> {
    pub settler: Signer<'info>,
    #[account(seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    /// CHECK: Address and executable state are constrained by global config.
    #[account(
        address = global_config.txline_program @ StakelyError::InvalidTxlineProgram,
        executable,
    )]
    pub txline_program: UncheckedAccount<'info>,
    /// CHECK: TxLINE validates this PDA internally; owner pins it to TxLINE.
    #[account(
        constraint = daily_scores_merkle_roots.owner == &txline_program.key()
            @ StakelyError::InvalidDailyScoresRoot,
    )]
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"escrow", bet_id.as_bytes()],
        bump = escrow.bump,
        close = creator,
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(
        mut,
        seeds = [b"vault", bet_id.as_bytes()],
        bump = escrow.vault_bump,
        token::mint = escrow.mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = escrow.counterparty,
    )]
    pub counterparty_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = escrow.creator @ StakelyError::InvalidCreator)]
    pub creator: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(bet_id: String)]
pub struct CancelEscrow<'info> {
    #[account(mut, address = escrow.creator @ StakelyError::Unauthorized)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", bet_id.as_bytes()],
        bump = escrow.bump,
        close = creator,
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(
        mut,
        seeds = [b"vault", bet_id.as_bytes()],
        bump = escrow.vault_bump,
        token::mint = escrow.mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(bet_id: String)]
pub struct RefundExpired<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", bet_id.as_bytes()],
        bump = escrow.bump,
        close = creator,
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(
        mut,
        seeds = [b"vault", bet_id.as_bytes()],
        bump = escrow.vault_bump,
        token::mint = escrow.mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = escrow.counterparty,
    )]
    pub counterparty_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = escrow.creator @ StakelyError::InvalidCreator)]
    pub creator: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub accepted_mint: Pubkey,
    pub txline_program: Pubkey,
    pub bump: u8,
}

impl GlobalConfig {
    pub const SIZE: usize = 32 + 32 + 32 + 1;
}

#[account]
pub struct EscrowState {
    pub bet_id: String,
    pub fixture_id: i64,
    pub participant1_is_home: bool,
    pub creator: Pubkey,
    pub counterparty: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub creator_side: u8,
    pub status: u8,
    pub created_at: i64,
    pub accepted_at: i64,
    pub refund_after: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl EscrowState {
    pub const SIZE: usize =
        (4 + MAX_BET_ID_LEN) + 8 + 1 + 32 + 32 + 32 + 8 + 1 + 1 + 8 + 8 + 8 + 1 + 1;
}

#[repr(u8)]
pub enum EscrowStatus {
    Created = 0,
    Accepted = 1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StatLeaf {
    pub stat: ScoreStat,
    pub stat_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StatValidationInput {
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummary,
    pub fixture_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
    pub event_stat_root: [u8; 32],
    pub stats: Vec<StatLeaf>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum StatPredicate {
    Single {
        index: u8,
        predicate: TraderPredicate,
    },
    Binary {
        index_a: u8,
        index_b: u8,
        op: BinaryExpression,
        predicate: TraderPredicate,
    },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GeometricTarget {
    pub stat_index: u8,
    pub prediction: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct NDimensionalStrategy {
    pub geometric_targets: Vec<GeometricTarget>,
    pub distance_predicate: Option<TraderPredicate>,
    pub discrete_predicates: Vec<StatPredicate>,
}

#[derive(AnchorSerialize)]
struct ValidateStatV2Args {
    payload: StatValidationInput,
    strategy: NDimensionalStrategy,
}

#[event]
pub struct ConfigUpdated {
    pub authority: Pubkey,
    pub accepted_mint: Pubkey,
    pub txline_program: Pubkey,
}

#[event]
pub struct EscrowCreated {
    pub bet_id: String,
    pub fixture_id: i64,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub creator_side: u8,
    pub refund_after: i64,
}

#[event]
pub struct EscrowAccepted {
    pub bet_id: String,
    pub counterparty: Pubkey,
    pub accepted_at: i64,
}

#[event]
pub struct EscrowSettled {
    pub bet_id: String,
    pub fixture_id: i64,
    pub winner: Pubkey,
    pub payout: u64,
    pub home_score: i32,
    pub away_score: i32,
    pub proof_timestamp: i64,
    pub daily_scores_root: Pubkey,
    pub settler: Pubkey,
}

#[event]
pub struct EscrowCancelled {
    pub bet_id: String,
}

#[event]
pub struct EscrowRefunded {
    pub bet_id: String,
    pub creator: Pubkey,
    pub counterparty: Pubkey,
    pub amount_each: u64,
    pub caller: Pubkey,
}

fn validate_final_score_shape(escrow: &EscrowState, payload: &StatValidationInput) -> Result<()> {
    require!(
        payload.fixture_summary.fixture_id == escrow.fixture_id,
        StakelyError::InvalidFixture
    );
    require!(payload.stats.len() == 2, StakelyError::InvalidScoreProof);
    require!(
        payload.fixture_proof.len() <= MAX_PROOF_NODES
            && payload.main_tree_proof.len() <= MAX_PROOF_NODES
            && payload
                .stats
                .iter()
                .all(|stat| stat.stat_proof.len() <= MAX_PROOF_NODES),
        StakelyError::ProofTooLarge
    );
    require!(
        payload.stats[0].stat.key == PARTICIPANT_1_SCORE_STAT_KEY
            && payload.stats[1].stat.key == PARTICIPANT_2_SCORE_STAT_KEY,
        StakelyError::InvalidScoreKeys
    );
    require!(
        payload.stats[0].stat.period == FINAL_PERIOD
            && payload.stats[1].stat.period == FINAL_PERIOD,
        StakelyError::ScoreNotFinal
    );
    require!(
        payload.stats[0].stat.value >= 0 && payload.stats[1].stat.value >= 0,
        StakelyError::InvalidScore
    );
    Ok(())
}

fn validate_with_txline(ctx: &Context<SettleEscrow>, payload: &StatValidationInput) -> Result<()> {
    require!(
        payload.ts == payload.fixture_summary.update_stats.min_timestamp
            && payload.fixture_summary.update_stats.min_timestamp
                <= payload.fixture_summary.update_stats.max_timestamp,
        StakelyError::InvalidProofTimestamp
    );
    let epoch_day = scores_epoch_day(payload.ts)
        .ok_or_else(|| error!(StakelyError::InvalidProofTimestamp))?;
    let epoch_day_bytes = epoch_day.to_le_bytes();
    let (expected_daily_root, _) = Pubkey::find_program_address(
        &[b"daily_scores_roots", &epoch_day_bytes],
        &ctx.accounts.txline_program.key(),
    );
    require_keys_eq!(
        expected_daily_root,
        ctx.accounts.daily_scores_merkle_roots.key(),
        StakelyError::InvalidDailyScoresRoot
    );

    let strategy = NDimensionalStrategy {
        geometric_targets: vec![],
        distance_predicate: None,
        discrete_predicates: vec![
            StatPredicate::Single {
                index: 0,
                predicate: TraderPredicate {
                    threshold: payload.stats[0].stat.value,
                    comparison: Comparison::EqualTo,
                },
            },
            StatPredicate::Single {
                index: 1,
                predicate: TraderPredicate {
                    threshold: payload.stats[1].stat.value,
                    comparison: Comparison::EqualTo,
                },
            },
        ],
    };
    let args = ValidateStatV2Args {
        payload: payload.clone(),
        strategy,
    };
    let mut data = VALIDATE_STAT_V2_DISCRIMINATOR.to_vec();
    args.serialize(&mut data)
        .map_err(|_| error!(StakelyError::ProofSerializationFailed))?;

    let instruction = Instruction {
        program_id: ctx.accounts.txline_program.key(),
        accounts: vec![AccountMeta::new_readonly(
            ctx.accounts.daily_scores_merkle_roots.key(),
            false,
        )],
        data,
    };
    invoke(
        &instruction,
        &[
            ctx.accounts.daily_scores_merkle_roots.to_account_info(),
            ctx.accounts.txline_program.to_account_info(),
        ],
    )?;

    let (returning_program, return_data) =
        get_return_data().ok_or_else(|| error!(StakelyError::MissingProofResult))?;
    require_keys_eq!(
        returning_program,
        ctx.accounts.txline_program.key(),
        StakelyError::InvalidProofResult
    );
    let proof_valid =
        bool::try_from_slice(&return_data).map_err(|_| error!(StakelyError::InvalidProofResult))?;
    require!(proof_valid, StakelyError::TxlineProofRejected);
    Ok(())
}

fn side_for_score(home_score: i32, away_score: i32) -> u8 {
    if home_score > away_score {
        0
    } else if home_score == away_score {
        1
    } else {
        2
    }
}

fn refund_is_available(now: i64, refund_after: i64) -> bool {
    now >= refund_after
}

fn scores_epoch_day(timestamp_ms: i64) -> Option<u16> {
    if timestamp_ms < 0 {
        return None;
    }
    u16::try_from(timestamp_ms / MILLISECONDS_PER_DAY).ok()
}

fn transfer_tokens<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    token::transfer(
        CpiContext::new(
            token_program,
            Transfer {
                from,
                to,
                authority,
            },
        ),
        amount,
    )
}

fn transfer_from_vault<'info>(
    token_program: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    escrow: &EscrowState,
    bet_id: &str,
    amount: u64,
) -> Result<()> {
    let seeds = &[b"vault", bet_id.as_bytes(), &[escrow.vault_bump]];
    let signer = &[seeds.as_slice()];
    token::transfer(
        CpiContext::new_with_signer(
            token_program,
            Transfer {
                from: vault.clone(),
                to: destination,
                authority: vault,
            },
            signer,
        ),
        amount,
    )
}

fn close_vault<'info>(
    token_program: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    creator: AccountInfo<'info>,
    escrow: &EscrowState,
    bet_id: &str,
) -> Result<()> {
    let seeds = &[b"vault", bet_id.as_bytes(), &[escrow.vault_bump]];
    let signer = &[seeds.as_slice()];
    token::close_account(CpiContext::new_with_signer(
        token_program,
        CloseAccount {
            account: vault.clone(),
            destination: creator,
            authority: vault,
        },
        signer,
    ))
}

#[error_code]
pub enum StakelyError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid side; expected home, draw, or away")]
    InvalidSide,
    #[msg("Bet ID exceeds the 32-byte PDA seed limit")]
    BetIdTooLong,
    #[msg("Escrow is not in the required status")]
    InvalidStatus,
    #[msg("Cannot accept your own challenge")]
    SelfBet,
    #[msg("Not authorized")]
    Unauthorized,
    #[msg("The configured token mint is not accepted")]
    InvalidMint,
    #[msg("Fixture ID is invalid or does not match the proof")]
    InvalidFixture,
    #[msg("Refund deadline must be between one hour and 30 days from creation")]
    InvalidRefundDeadline,
    #[msg("The refund deadline has already passed")]
    RefundDeadlinePassed,
    #[msg("Refund is not available yet")]
    RefundNotAvailable,
    #[msg("Escrow vault does not contain both stakes")]
    VaultUnderfunded,
    #[msg("Creator account does not match the escrow")]
    InvalidCreator,
    #[msg("TxLINE program does not match global config")]
    InvalidTxlineProgram,
    #[msg("Daily scores root does not match the TxLINE proof timestamp")]
    InvalidDailyScoresRoot,
    #[msg("Proof timestamp does not match a supported TxLINE daily root")]
    InvalidProofTimestamp,
    #[msg("Final score proof must contain exactly two stats")]
    InvalidScoreProof,
    #[msg("Final score proof must contain TxLINE stat keys 1 and 2 in order")]
    InvalidScoreKeys,
    #[msg("Score proof is not a game_finalised period 100 record")]
    ScoreNotFinal,
    #[msg("Score values cannot be negative")]
    InvalidScore,
    #[msg("Merkle proof exceeds the supported node limit")]
    ProofTooLarge,
    #[msg("Could not serialize the TxLINE proof")]
    ProofSerializationFailed,
    #[msg("TxLINE did not return a validation result")]
    MissingProofResult,
    #[msg("TxLINE returned an invalid validation result")]
    InvalidProofResult,
    #[msg("TxLINE rejected the score proof")]
    TxlineProofRejected,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_scores_to_sides() {
        assert_eq!(side_for_score(3, 1), 0);
        assert_eq!(side_for_score(2, 2), 1);
        assert_eq!(side_for_score(0, 1), 2);
    }

    #[test]
    fn opens_refunds_at_the_exact_deadline() {
        assert!(!refund_is_available(1_999, 2_000));
        assert!(refund_is_available(2_000, 2_000));
        assert!(refund_is_available(2_001, 2_000));
    }

    #[test]
    fn derives_txline_epoch_days_from_milliseconds() {
        assert_eq!(scores_epoch_day(0), Some(0));
        assert_eq!(scores_epoch_day(86_400_000), Some(1));
        assert_eq!(scores_epoch_day(-1), None);
    }
}
