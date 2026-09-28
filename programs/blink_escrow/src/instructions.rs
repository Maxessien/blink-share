use anchor_lang::prelude::*;
use anchor_spl::token_interface::*;
use crate::data_struct::*;
use crate::errors;




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
pub struct DepositMilestoneTkns<'info> {
    #[account(mut)]
    pub client: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub escrow_acct: Account<'info, EscrowVault>,

    #[account(mut, seeds=[b"tk_acct", escrow_acct.vault_id.as_bytes()], bump)]
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

    #[account(mut)]
    pub escrow_vault: Account<'info, EscrowVault>,
}

#[derive(Accounts)]
pub struct DisputeMilestone<'info> {
    pub signer: Signer<'info>,

    #[account(mut, constraint=(signer.key() == escrow_vault.client || (| |{
        if let Some(pubk) = escrow_vault.worker { return pubk == signer.key() };
        return false
    })()) @ errors::AppErrors::InvalidDisputer)]
    pub escrow_vault: Account<'info, EscrowVault>
}

#[derive(Accounts)]
#[instruction(worker_amt: u64)]
pub struct AdminRelease<'info> {
    #[account(mut, constraint=(| |{
        if worker_amt == 0 {return true}
        if let Some(pubk) = escrow_vault.worker { return pubk == worker_tkn_acct.owner };
        return false
    })())]
    pub worker_tkn_acct: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, constraint=client_tkn_acct.owner==escrow_vault.client)]
    pub client_tkn_acct: InterfaceAccount<'info, TokenAccount>,

    pub signer: Signer<'info>,

    #[account(mut, constraint=signer.key()==escrow_vault.admin)]
    pub escrow_vault: Account<'info, EscrowVault>,

    #[account(mut, constraint=from_tkn_acct.owner==escrow_vault.key(), seeds=[b"tk_acct", escrow_vault.vault_id.as_bytes()], bump)]
    pub from_tkn_acct: InterfaceAccount<'info, TokenAccount>,
    
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_prog: Interface<'info, TokenInterface>,
}