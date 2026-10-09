import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getBase64Encoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  type Instruction,
  type TransactionSendingSigner,
} from "@solana/kit";
import { RPC_URL } from "../config";
import { decodeVault, findVaultPda, type OnChainVault } from "./program";

let _rpc: ReturnType<typeof createSolanaRpc> | null = null;
export function rpc() {
  if (!_rpc) _rpc = createSolanaRpc(RPC_URL);
  return _rpc;
}

export async function fetchVault(vaultId: string): Promise<OnChainVault | null> {
  const pda = await findVaultPda(vaultId);
  const res = await rpc().getAccountInfo(pda, { encoding: "base64", commitment: "confirmed" }).send();
  if (!res.value) return null;
  const bytes = new Uint8Array(getBase64Encoder().encode(res.value.data[0]));
  return decodeVault(pda, bytes);
}

export async function sendInstructions(signer: TransactionSendingSigner, ixs: Instruction[]): Promise<string> {
  const { value: blockhash } = await rpc().getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const sigBytes = await signAndSendTransactionMessageWithSigners(msg);
  const sig = getBase58Decoder().decode(sigBytes);
  await waitForConfirmation(sig);
  return sig;
}

async function waitForConfirmation(sig: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await rpc()
      .getSignatureStatuses([sig as never])
      .send();
    const st = value[0];
    if (st?.err) throw new Error("Transaction failed on-chain: " + JSON.stringify(st.err, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Timed out waiting for confirmation. Check the explorer: " + sig);
}

const PROGRAM_ERRORS: Record<number, string> = {
  6000: "Escrow vault is missing a worker",
  6001: "Escrow vault is missing a milestone",
  6002: "Worker doesn't match the provided token account",
  6003: "Only the client or admin can release tokens",
  6004: "Transaction must be signed by the worker",
  6005: "Job already taken",
  6006: "Only the vault worker or client can dispute",
  6007: "Split amounts must equal the locked total",
  6008: "Milestone has already been completed",
  6009: "Previous milestone has not been completed",
  6010: "Milestone has not been disputed",
  6011: "Milestone has already been disputed",
};

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/Custom"?:\s*(\d+)/) || msg.match(/custom program error: 0x([0-9a-f]+)/i);
  if (m) {
    const code = m[0].includes("0x") ? parseInt(m[1] ?? "0", 16) : Number(m[1] ?? 0);
    if (PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];
  }
  if (/rejected|denied|cancel/i.test(msg)) return "Request cancelled in wallet";
  if (/insufficient/i.test(msg)) return "Insufficient balance for this transaction";
  return msg.length > 180 ? msg.slice(0, 180) + "…" : msg;
}
