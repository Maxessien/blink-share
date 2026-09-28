use anchor_lang::prelude::*;

#[error_code]
pub enum AppErrors {
    #[msg("Escrow vault is missing a worker")]
    WorkerNotFound,

    #[msg("Escrow vault is missing a milestone")]
    MilestoneNotFound,

    #[msg("Escrow worker doesn't match provided token account")]
    WorkerMismatch,

    #[msg("Client/admin did not authorise token release")]
    UnauthorisedTknRelease,

    #[msg("Transaction must be signed by the worker")]
    UnsignedWorker,

    #[msg("Job already taken")]
    JobTaken,

    #[msg("Milestone can only be disputed by vault worker or client")]
    InvalidDisputer,

    #[msg("Total amount mismatch")]
    AmountMismatch,

    #[msg("Milestone has already been completed")]
    MilestoneAlreadySatisfied,

    #[msg("Milestone has already been disputed")]
    MilestoneAlreadyDisputed,
}