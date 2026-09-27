use anchor_lang::prelude::*;
use anchor_spl::token_interface::*;
use crate::data_struct::*;




#[derive(Accounts)]
pub struct CreateTknAcct<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub escrow_acct: Account<'info, EscrowVault>,
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(init_if_needed, payer=signer, token::mint=mint, token::authority=escrow_acct, token::token_program=token_prog, seeds=[b"tk_acct", escrow_acct.vault_id.as_bytes()], bump)]
    pub token_acct: InterfaceAccount<'info, TokenAccount>,

    pub token_prog: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct DepositMilestoneTkns<'info> {#[account(mut)]
    pub client: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub escrow_acct: Account<'info, EscrowVault>,

    #[account(mut)]
    pub to_token_acct: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub from_token_acct: InterfaceAccount<'info, TokenAccount>,

    pub token_prog: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ReleaseMilestoneTkns<'info>{
    pub mint: InterfaceAccount<'info, Mint>,

    pub signer: Signer<'info>,

    #[account(mut)]
    pub escrow_acct: Account<'info, EscrowVault>,

    #[account(mut, seeds=[b"tk_acct", escrow_acct.vault_id.as_bytes()], bump)]
    pub from_tkn_acct: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub to_acct: InterfaceAccount<'info, TokenAccount>,

    pub token_prog: Interface<'info, TokenInterface>,
}


#[derive(Accounts)]
#[instruction(v_id: String)]
pub struct CreateEscrowVault<'info>{
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(init, payer=signer, space=8+EscrowVault::INIT_SPACE, seeds=[b"escrow_user", v_id.as_bytes()], bump)]
    pub escrow_user: Account<'info, EscrowVault>,

    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct AcceptBlinkJob<'info>{
    pub signer: Signer<'info>,

    pub escrow_vault: Account<'info, EscrowVault>,
}