import { address, type Address, type Instruction, type TransactionSendingSigner } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { getCreateAssociatedTokenIdempotentInstructionAsync, getSyncNativeInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { ADMIN_ADDRESS, tokenForMint } from "../config";
import {
  findAta,
  ixAcceptBlinkJob,
  ixAdminRelease,
  ixDepositMilestone,
  ixDisputeMilestone,
  ixReleaseMilestone,
} from "./program";
import { sendInstructions } from "./rpc";

async function ensureAta(payer: TransactionSendingSigner, owner: Address, mint: Address): Promise<Instruction> {
  return (await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer,
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })) as Instruction;
}

export async function acceptJob(signer: TransactionSendingSigner, vaultId: string) {
  return sendInstructions(signer, [await ixAcceptBlinkJob({ signer, vaultId })]);
}

export async function fundMilestone(
  signer: TransactionSendingSigner,
  p: { vaultId: string; mint: string; amount: bigint; requirementHash: Uint8Array },
) {
  const mint = address(p.mint);
  const ixs: Instruction[] = [];
  if (tokenForMint(p.mint).native) {
    // Wrap SOL into the client's wSOL token account before depositing.
    const ata = await findAta(signer.address, mint);
    ixs.push(await ensureAta(signer, signer.address, mint));
    ixs.push(getTransferSolInstruction({ source: signer, destination: ata, amount: p.amount }) as Instruction);
    ixs.push(getSyncNativeInstruction({ account: ata }) as Instruction);
  }
  ixs.push(await ixDepositMilestone({ client: signer, vaultId: p.vaultId, mint, requirementHash: p.requirementHash, amount: p.amount }));
  return sendInstructions(signer, ixs);
}

export async function releaseMilestone(signer: TransactionSendingSigner, p: { vaultId: string; mint: string; worker: string }) {
  const mint = address(p.mint);
  const worker = address(p.worker);
  return sendInstructions(signer, [
    await ensureAta(signer, worker, mint),
    await ixReleaseMilestone({ signer, vaultId: p.vaultId, mint, worker }),
  ]);
}

export async function disputeMilestone(signer: TransactionSendingSigner, p: { vaultId: string; disputeHash: Uint8Array }) {
  return sendInstructions(signer, [await ixDisputeMilestone({ signer, vaultId: p.vaultId, disputeHash: p.disputeHash })]);
}

export async function adminSettle(
  signer: TransactionSendingSigner,
  p: { vaultId: string; mint: string; worker: string; client: string; workerAmt: bigint; clientAmt: bigint },
) {
  if (signer.address !== ADMIN_ADDRESS) throw new Error("Only the configured admin can settle disputes");
  const mint = address(p.mint);
  const worker = address(p.worker);
  const client = address(p.client);
  return sendInstructions(signer, [
    await ensureAta(signer, worker, mint),
    await ensureAta(signer, client, mint),
    await ixAdminRelease({ signer, vaultId: p.vaultId, mint, worker, client, workerAmt: p.workerAmt, clientAmt: p.clientAmt }),
  ]);
}
