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

        if let None = accts.escrow_acct.worker {
            return err!(AppErrors::WorkerNotFound);
        }
        if let Some(mile) = &accts.escrow_acct.active_milestone {
            if !mile.is_satisfied {
                return err!(AppErrors::MilestoneNotSatisfied);
            }
        }

        let transfer = TransferChecked {
            authority: accts.client.to_account_info(),
            from: accts.from_token_acct.to_account_info(),
            to: accts.to_token_acct.to_account_info(),
            mint: accts.mint.to_account_info()
        };

        let cpi_ctx = CpiContext::new(accts.token_prog.to_account_info(), transfer);

        transfer_checked(cpi_ctx, milestone.token_amt, accts.mint.decimals)?;

        accts.escrow_acct.active_milestone = Some(MileStoneContract {
            dispute_hash: None,
            is_satisfied: false,
            requirement_hash: milestone.requirement_hash,
            token_amt: milestone.token_amt
        });

        Ok(())
    }

    pub fn release_milestone_tkns(mut ctx: Context<ReleaseMilestoneTkns>)-> Result<()> {
        let accts = &mut ctx.accounts;

        if let None = accts.escrow_acct.active_milestone {
            return err!(AppErrors::MilestoneNotFound);
        };

        if let Some(milest) = accts.escrow_acct.active_milestone {
            require!(!milest.is_satisfied, AppErrors::MilestoneAlreadySatisfied);
            if milest.dispute_hash.is_some(){
                return err!(AppErrors::MilestoneAlreadyDisputed);
            }
        };

        match accts.escrow_acct.worker {
            Some(pubk)=> {require_keys_eq!(pubk, accts.to_acct.owner, AppErrors::WorkerMismatch)},
            None => {return err!(AppErrors::WorkerNotFound);}
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

        transfer_checked(cpi_ctx, accts.escrow_acct.active_milestone.unwrap().token_amt, accts.mint.decimals)?;

        if let Some(mile) = &mut accts.escrow_acct.active_milestone {
            mile.is_satisfied = true
        };

        Ok(())
    }

    pub fn create_escrow_vault(ctx: Context<CreateEscrowVault>, v_id: String, job_info: [u8; 32], admin: Pubkey)-> Result<()>{
        let escrow_user = &mut ctx.accounts.escrow_user;

        escrow_user.client = ctx.accounts.signer.key();
        escrow_user.active_milestone = None;
        escrow_user.blink_job_info = job_info;
        escrow_user.admin = admin;
        escrow_user.worker = None;
        escrow_user.vault_id = v_id;
        escrow_user.bump = ctx.bumps.escrow_user;


        Ok(())
    }

    pub fn accept_blink_job(mut ctx: Context<AcceptBlinkJob>)-> Result<()> {
        let accts = &mut ctx.accounts;

        if let Some(_) = accts.escrow_vault.worker {
            return err!(AppErrors::JobTaken);
        };
        
        accts.escrow_vault.worker = Some(accts.signer.key());

        Ok(())
    }

    pub fn dispute_milestone(ctx:Context<DisputeMilestone>, dispute_hash: [u8; 32])-> Result<()>{
        let vault = &mut ctx.accounts.escrow_vault;



        match &mut vault.active_milestone {
            Some(mile)=> {
                match mile.dispute_hash {
                    Some(_) => {
                        return err!(AppErrors::MilestoneAlreadyDisputed);
                    },
                    None=>{
                        mile.dispute_hash = Some(dispute_hash);
                    }
                };
            },
            None=> {
                return err!(AppErrors::MilestoneNotFound);
            }
        };

        Ok(())
    }

    pub fn admin_release(mut ctx: Context<AdminRelease>, worker_amt: u64, client_amt: u64)-> Result<()> {
        let accts = &mut ctx.accounts;

        match accts.escrow_vault.active_milestone {
            Some(mile)=>{
                require!((worker_amt + client_amt == mile.token_amt), AppErrors::AmountMismatch);
                require!(mile.dispute_hash.is_some(), AppErrors::MilestoneNotDisputed);
                require!(!mile.is_satisfied, AppErrors::MilestoneAlreadySatisfied);
            },
            None=> {
                return err!(AppErrors::MilestoneNotFound);
            }
        };
        
        let vault_id_bytes = accts.escrow_vault.vault_id.as_bytes();

        let bump_byte = [accts.escrow_vault.bump]; 

        let seeds: &[&[u8]] = &[
            b"escrow_user".as_ref(),
            vault_id_bytes,
            &bump_byte,
        ];

        let seed_wrap = [seeds];

        if client_amt > 0 {
            let cl_transfer = TransferChecked {
                authority: accts.escrow_vault.to_account_info(),
                from: accts.from_tkn_acct.to_account_info(),
                mint: accts.mint.to_account_info(),
                to: accts.client_tkn_acct.to_account_info()
            };
            
            let cpi_ctx = CpiContext::new(accts.token_prog.to_account_info(), cl_transfer).with_signer(&seed_wrap);

            transfer_checked(cpi_ctx, client_amt, accts.mint.decimals)?;
        };

        if worker_amt > 0 {
            let wkr_transfer = TransferChecked {
                authority: accts.escrow_vault.to_account_info(),
                from: accts.from_tkn_acct.to_account_info(),
                mint: accts.mint.to_account_info(),
                to: accts.worker_tkn_acct.to_account_info()
            };
            
            let cpi_ctx = CpiContext::new(accts.token_prog.to_account_info(), wkr_transfer).with_signer(&seed_wrap);

            transfer_checked(cpi_ctx, worker_amt, accts.mint.decimals)?;
        };
        
        if let Some(mile) = &mut accts.escrow_vault.active_milestone {
            mile.is_satisfied = true
        };

        Ok(())
    }
}
