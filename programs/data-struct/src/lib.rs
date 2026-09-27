use anchor_lang::prelude::*;
use anchor_spl::token_interface::*;

declare_id!("35nqDayAETPzRnjLw5bxEiw3ovzSndMp4caQLF1PXFGz");

pub mod data_struct;
pub mod instructions;
pub mod errors;

pub use instructions::*; 
pub use data_struct::*;
pub use errors::*;

#[program]
mod blink_escrow {
    use super::*;

    pub fn create_tkn_acct(_ctx: Context<CreateTknAcct>)-> Result<()> {
        Ok(())
    }

    pub fn deposit_milestone_tkns(mut ctx: Context<DepositMilestoneTkns>, milestone: MileStoneContract)-> Result<()> {

        let accts = &mut ctx.accounts;

        let transfer = TransferChecked {
            authority: accts.client.to_account_info(),
            from: accts.from_token_acct.to_account_info(),
            to: accts.to_token_acct.to_account_info(),
            mint: accts.mint.to_account_info()
        };

        let cpi_ctx = CpiContext::new(accts.token_prog.to_account_info(), transfer);

        transfer_checked(cpi_ctx, milestone.token_amt, 6)?;

        accts.escrow_acct.active_milestone = Some(milestone);

        Ok(())
    }

    pub fn release_milestone_tkns(mut ctx: Context<ReleaseMilestoneTkns>)-> Result<()> {
        let accts = &mut ctx.accounts;

        if let None = accts.escrow_acct.active_milestone {
            require!(false, AppErrors::MilestoneNotFound)
        }

        match accts.escrow_acct.worker {
            Some(pubk)=> {require_keys_eq!(pubk, accts.to_acct.key(), AppErrors::WorkerMismatch)},
            None => {require!(false, AppErrors::WorkerNotFound)}
        }

        require!(accts.signer.key() == accts.escrow_acct.client || accts.signer.key() == accts.escrow_acct.admin, AppErrors::UnauthorisedTknRelease);
        
        let transfer = TransferChecked {
            authority: accts.escrow_acct.to_account_info(),
            from: accts.from_tkn_acct.to_account_info(),
            mint: accts.mint.to_account_info(),
            to: accts.to_acct.to_account_info()
        };

        let vault_id_bytes = accts.escrow_acct.vault_id.as_bytes();

        let bump_byte = [accts.escrow_acct.bump]; 

        let seeds: &[&[u8]] = &[
            b"escrow_user".as_ref(),
            vault_id_bytes,
            &bump_byte,
        ];

        let seed_wrap = [seeds];

        let cpi_ctx = CpiContext::new(accts.token_prog.to_account_info(), transfer).with_signer(&seed_wrap[..]);

        transfer_checked(cpi_ctx, accts.escrow_acct.active_milestone.unwrap().token_amt, 6)?;

        Ok(())
    }

    pub fn create_escrow_vault(ctx: Context<CreateEscrowVault>, v_id: String, job_info: [u8; 32], admin: Pubkey)-> Result<()>{
        let escrow_user = &mut ctx.accounts.escrow_user;

        escrow_user.authority = ctx.accounts.signer.key();
        escrow_user.role = Role::Lancer;
        escrow_user.active_milestone = None;
        escrow_user.blink_job_info = job_info;
        escrow_user.admin = admin;
        escrow_user.worker = None;
        escrow_user.vault_id = v_id;

        Ok(())
    }

    pub fn accept_blink_job(mut ctx: Context<AcceptBlinkJob>)-> Result<()> {
        let accts = &mut ctx.accounts;
        
        accts.escrow_vault.worker = Some(accts.signer.key());

        Ok(())
    }
}
