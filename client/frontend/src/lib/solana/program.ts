import {
  AccountRole,
  addEncoderSizePrefix,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU32Encoder,
  getU64Encoder,
  getUtf8Encoder,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { sha256 } from "js-sha256";
import { PROGRAM_ID } from "../config";

const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;
const utf8 = getUtf8Encoder();
const addrEnc = getAddressEncoder();
const u64 = getU64Encoder();
const strEnc = addEncoderSizePrefix(utf8, getU32Encoder());

export function sha256Bytes(input: string): Uint8Array {
  return new Uint8Array(sha256.arrayBuffer(input));
}
export function sha256Hex(input: string): string {
  return sha256(input);
}
export function bytesToHex(b: Uint8Array | number[]): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function disc(name: string): Uint8Array {
  return new Uint8Array(sha256.arrayBuffer(`global:${name}`)).slice(0, 8);
}
function concat(...parts: (Uint8Array | ReadonlyUint8Array)[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p as Uint8Array, o);
    o += p.length;
  }
  return out;
}
type ReadonlyUint8Array = { readonly length: number; readonly [n: number]: number };

export async function findVaultPda(vaultId: string) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ["escrow_user", vaultId],
  });
  return pda;
}
export async function findTokenPda(vaultId: string) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ["tk_acct", vaultId],
  });
  return pda;
}
export async function findAta(owner: Address, mint: Address) {
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  return ata;
}

/** Signer meta: pass a TransactionSigner to have kit sign, or a bare address (Blink flow). */
function signerMeta(s: TransactionSigner | Address, writable: boolean) {
  const role = writable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  if (typeof s === "string") return { address: s, role };
  return { address: s.address, role, signer: s };
}
const w = (address: Address) => ({ address, role: AccountRole.WRITABLE });
const r = (address: Address) => ({ address, role: AccountRole.READONLY });

export async function ixCreateEscrowVault(p: {
  signer: TransactionSigner;
  vaultId: string;
  jobInfo: Uint8Array;
  admin: Address;
}): Promise<Instruction> {
  const vault = await findVaultPda(p.vaultId);
  return {
    programAddress: PROGRAM_ID,
    accounts: [signerMeta(p.signer, true), w(vault), r(SYSTEM_PROGRAM)],
    data: concat(disc("create_escrow_vault"), strEnc.encode(p.vaultId), p.jobInfo, addrEnc.encode(p.admin)),
  } as Instruction;
}

export async function ixCreateTknAcct(p: { signer: TransactionSigner; vaultId: string; mint: Address }) {
  const vault = await findVaultPda(p.vaultId);
  const tk = await findTokenPda(p.vaultId);
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      signerMeta(p.signer, true),
      r(vault),
      r(p.mint),
      w(tk),
      r(TOKEN_PROGRAM_ADDRESS),
      r(SYSTEM_PROGRAM),
    ],
    data: disc("create_tkn_acct"),
  } as Instruction;
}

export async function ixAcceptBlinkJob(p: { signer: TransactionSigner | Address; vaultId: string }) {
  const vault = await findVaultPda(p.vaultId);
  return {
    programAddress: PROGRAM_ID,
    accounts: [signerMeta(p.signer, false), w(vault)],
    data: disc("accept_blink_job"),
  } as Instruction;
}

export async function ixDepositMilestone(p: {
  client: TransactionSigner;
  vaultId: string;
  mint: Address;
  requirementHash: Uint8Array;
  amount: bigint;
}) {
  const vault = await findVaultPda(p.vaultId);
  const tk = await findTokenPda(p.vaultId);
  const from = await findAta(p.client.address, p.mint);
  // MileStoneContract { token_amt, requirement_hash, dispute_hash: None, is_satisfied: false }
  const data = concat(
    disc("deposit_milestone_tkns"),
    u64.encode(p.amount),
    p.requirementHash,
    new Uint8Array([0]),
    new Uint8Array([0]),
  );
  return {
    programAddress: PROGRAM_ID,
    accounts: [signerMeta(p.client, true), r(p.mint), w(vault), w(tk), w(from), r(TOKEN_PROGRAM_ADDRESS)],
    data,
  } as Instruction;
}

export async function ixReleaseMilestone(p: {
  signer: TransactionSigner;
  vaultId: string;
  mint: Address;
  worker: Address;
}) {
  const vault = await findVaultPda(p.vaultId);
  const tk = await findTokenPda(p.vaultId);
  const to = await findAta(p.worker, p.mint);
  return {
    programAddress: PROGRAM_ID,
    accounts: [r(p.mint), signerMeta(p.signer, false), w(vault), w(tk), w(to), r(TOKEN_PROGRAM_ADDRESS)],
    data: disc("release_milestone_tkns"),
  } as Instruction;
}

export async function ixDisputeMilestone(p: { signer: TransactionSigner; vaultId: string; disputeHash: Uint8Array }) {
  const vault = await findVaultPda(p.vaultId);
  return {
    programAddress: PROGRAM_ID,
    accounts: [signerMeta(p.signer, false), w(vault)],
    data: concat(disc("dispute_milestone"), p.disputeHash),
  } as Instruction;
}

export async function ixAdminRelease(p: {
  signer: TransactionSigner;
  vaultId: string;
  mint: Address;
  worker: Address;
  client: Address;
  workerAmt: bigint;
  clientAmt: bigint;
}) {
  const vault = await findVaultPda(p.vaultId);
  const tk = await findTokenPda(p.vaultId);
  const wAta = await findAta(p.worker, p.mint);
  const cAta = await findAta(p.client, p.mint);
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      w(wAta),
      w(cAta),
      signerMeta(p.signer, false),
      w(vault),
      w(tk),
      r(p.mint),
      r(TOKEN_PROGRAM_ADDRESS),
    ],
    data: concat(disc("admin_release"), u64.encode(p.workerAmt), u64.encode(p.clientAmt)),
  } as Instruction;
}

/* ---------- Account decoding ---------- */

export type OnChainMilestone = {
  tokenAmt: bigint;
  requirementHash: string;
  disputeHash: string | null;
  isSatisfied: boolean;
};
export type OnChainVault = {
  address: Address;
  client: Address;
  jobInfo: string;
  worker: Address | null;
  admin: Address;
  activeMilestone: OnChainMilestone | null;
  bump: number;
  vaultId: string;
};

const addrDec = getAddressDecoder();

export function decodeVault(address: Address, data: Uint8Array): OnChainVault {
  let o = 8;
  const readAddr = () => {
    const a = addrDec.decode(data.slice(o, o + 32));
    o += 32;
    return a;
  };
  const readBytes32 = () => {
    const b = data.slice(o, o + 32);
    o += 32;
    return bytesToHex(b);
  };
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const client = readAddr();
  const jobInfo = readBytes32();
  const worker = data[o++] === 1 ? readAddr() : null;
  const admin = readAddr();
  let activeMilestone: OnChainMilestone | null = null;
  if (data[o++] === 1) {
    const tokenAmt = dv.getBigUint64(o, true);
    o += 8;
    const requirementHash = readBytes32();
    const disputeHash = data[o++] === 1 ? readBytes32() : null;
    const isSatisfied = data[o++] === 1;
    activeMilestone = { tokenAmt, requirementHash, disputeHash, isSatisfied };
  }
  const bump = data[o++] ?? 0;
  const len = dv.getUint32(o, true);
  o += 4;
  const vaultId = new TextDecoder().decode(data.slice(o, o + len));
  return { address, client, jobInfo, worker, admin, activeMilestone, bump, vaultId };
}
