/**
 * Stakely Escrow Program
 *
 * Flow:
 *  1. creator calls create_escrow  → locks creator's USDC in vault PDA
 *  2. counterparty calls accept_escrow → locks counterparty's USDC in same vault
 *  3. authority (Stakely keeper) calls settle_escrow → full vault goes to winner
 *
 * Vault PDA seeds: ["vault", bet_id]
 * Escrow state PDA seeds: ["escrow", bet_id]
 *
 * The settle authority is stored on-chain in a GlobalConfig account.
 * For the hackathon, this is the Stakely API server wallet.
 * In production, replace with TxLINE oracle Merkle proof verification.
 */
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, CloseAccount};

declare_id!("EscroW1111111111111111111111111111111111111");

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_BET_ID_LEN: usize = 64;

#[program]
pub mod stakely_escrow {
    use super::*;

    /// One-time setup: store the keeper (settle authority) pubkey on-chain.
    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        config.authority = authority;
        config.bump = ctx.bumps.global_config;
        Ok(())
    }

    /// Creator locks `amount` USDC and records which side they're on.
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        bet_id: String,
        amount: u64,
        creator_side: u8, // 0 = home, 1 = draw, 2 = away
    ) -> Result<()> {
        require!(amount > 0, StakelyError::ZeroAmount);
        require!(creator_side <= 2, StakelyError::InvalidSide);
        require!(bet_id.len() <= MAX_BET_ID_LEN, StakelyError::BetIdTooLong);

        let escrow = &mut ctx.accounts.escrow;
        escrow.bet_id       = bet_id;
        escrow.creator      = ctx.accounts.creator.key();
        escrow.counterparty = Pubkey::default();
        escrow.amount       = amount;
        escrow.creator_side = creator_side;
        escrow.status       = EscrowStatus::Created as u8;
        escrow.bump         = ctx.bumps.escrow;
        escrow.vault_bump   = ctx.bumps.vault;

        // Transfer creator's USDC into vault
        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.creator_token_account.to_account_info(),
                to:        ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        );
        token::transfer(cpi, amount)?;

        emit!(EscrowCreated {
            bet_id:       escrow.bet_id.clone(),
            creator:      escrow.creator,
            amount,
            creator_side,
        });
        Ok(())
    }

    /// Counterparty locks matching `amount` USDC. Vault now holds 2x amount.
    pub fn accept_escrow(ctx: Context<AcceptEscrow>, bet_id: String) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Created as u8, StakelyError::InvalidStatus);
        require!(escrow.creator != ctx.accounts.counterparty.key(), StakelyError::SelfBet);

        escrow.counterparty = ctx.accounts.counterparty.key();
        escrow.status       = EscrowStatus::Accepted as u8;

        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.counterparty_token_account.to_account_info(),
                to:        ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.counterparty.to_account_info(),
            },
        );
        token::transfer(cpi, escrow.amount)?;

        emit!(EscrowAccepted {
            bet_id: bet_id.clone(),
            counterparty: escrow.counterparty,
        });
        Ok(())
    }

    /// Keeper settles: entire vault goes to winner. Escrow + vault closed.
    pub fn settle_escrow(
        ctx: Context<SettleEscrow>,
        bet_id: String,
        winner: Pubkey,
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Accepted as u8, StakelyError::InvalidStatus);
        require!(
            winner == escrow.creator || winner == escrow.counterparty,
            StakelyError::InvalidWinner
        );

        let payout = ctx.accounts.vault.amount;
        let bet_id_bytes = bet_id.as_bytes().to_vec();
        let seeds = &[b"vault", bet_id_bytes.as_slice(), &[escrow.vault_bump]];
        let signer = &[seeds.as_slice()];

        // Transfer all funds to winner
        let cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.vault.to_account_info(),
                to:        ctx.accounts.winner_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi, payout)?;

        // Close vault token account, rent to creator
        let close_cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account:     ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.creator.to_account_info(),
                authority:   ctx.accounts.vault.to_account_info(),
            },
            signer,
        );
        token::close_account(close_cpi)?;

        emit!(EscrowSettled {
            bet_id: bet_id.clone(),
            winner,
            payout,
        });
        Ok(())
    }

    /// Creator cancels before counterparty accepts. Funds returned.
    pub fn cancel_escrow(ctx: Context<CancelEscrow>, bet_id: String) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Created as u8, StakelyError::InvalidStatus);
        require!(escrow.creator == ctx.accounts.creator.key(), StakelyError::Unauthorized);

        let bet_id_bytes = bet_id.as_bytes().to_vec();
        let seeds = &[b"vault", bet_id_bytes.as_slice(), &[escrow.vault_bump]];
        let signer = &[seeds.as_slice()];

        let cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.vault.to_account_info(),
                to:        ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi, ctx.accounts.vault.amount)?;

        let close_cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account:     ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.creator.to_account_info(),
                authority:   ctx.accounts.vault.to_account_info(),
            },
            signer,
        );
        token::close_account(close_cpi)?;

        emit!(EscrowCancelled { bet_id });
        Ok(())
    }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + GlobalConfig::SIZE,
        seeds = [b"global_config"],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bet_id: String)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + EscrowState::SIZE,
        seeds = [b"escrow", bet_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, EscrowState>,
    /// CHECK: USDC mint — validated by ATA constraint
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        token::mint = usdc_mint,
        token::authority = vault,
        seeds = [b"vault", bet_id.as_bytes()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
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
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub counterparty_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(bet_id: String)]
pub struct SettleEscrow<'info> {
    /// Keeper — must match global_config.authority
    #[account(constraint = authority.key() == global_config.authority @ StakelyError::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
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
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub winner_token_account: Account<'info, TokenAccount>,
    /// CHECK: receives rent from closed escrow
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(bet_id: String)]
pub struct CancelEscrow<'info> {
    #[account(mut)]
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
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct GlobalConfig {
    pub authority: Pubkey, // Stakely keeper wallet — can call settle
    pub bump: u8,
}
impl GlobalConfig {
    pub const SIZE: usize = 32 + 1;
}

#[account]
pub struct EscrowState {
    pub bet_id:       String,   // links to Supabase bets.id
    pub creator:      Pubkey,
    pub counterparty: Pubkey,
    pub amount:       u64,      // per side (vault holds 2x after accept)
    pub creator_side: u8,       // 0=home 1=draw 2=away
    pub status:       u8,       // EscrowStatus
    pub bump:         u8,
    pub vault_bump:   u8,
}
impl EscrowState {
    pub const SIZE: usize = (4 + MAX_BET_ID_LEN) + 32 + 32 + 8 + 1 + 1 + 1 + 1;
}

#[repr(u8)]
pub enum EscrowStatus {
    Created   = 0,
    Accepted  = 1,
    Settled   = 2,
    Cancelled = 3,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct EscrowCreated  { pub bet_id: String, pub creator: Pubkey, pub amount: u64, pub creator_side: u8 }
#[event]
pub struct EscrowAccepted { pub bet_id: String, pub counterparty: Pubkey }
#[event]
pub struct EscrowSettled  { pub bet_id: String, pub winner: Pubkey, pub payout: u64 }
#[event]
pub struct EscrowCancelled { pub bet_id: String }

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum StakelyError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid side — must be 0 (home), 1 (draw), or 2 (away)")]
    InvalidSide,
    #[msg("Bet ID too long — max 64 chars")]
    BetIdTooLong,
    #[msg("Escrow is not in the required status for this operation")]
    InvalidStatus,
    #[msg("Cannot bet against yourself")]
    SelfBet,
    #[msg("Winner must be creator or counterparty")]
    InvalidWinner,
    #[msg("Not authorized")]
    Unauthorized,
}
