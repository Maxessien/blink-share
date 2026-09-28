use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub struct MileStoneContract {
    pub token_amt: u64,
    pub requirement_hash: [u8; 32],
    pub dispute_hash: Option<[u8; 32]>,
    pub is_satisfied: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct  AdminReleaseType {
    client_amt: u64, worker_amt: u64
}

#[account]
#[derive(InitSpace)]
pub struct EscrowVault {
    pub client: Pubkey,
    pub blink_job_info: [u8; 32],
    pub worker: Option<Pubkey>,
    pub admin: Pubkey,
    pub active_milestone: Option<MileStoneContract>,
    pub bump: u8,

    #[max_len(36)]
    pub vault_id: String
}
