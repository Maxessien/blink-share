import { address, createSolanaRpc, getAddressDecoder, getBase64Encoder, getProgramDerivedAddress } from "@solana/kit";

let rpc;
const getRpc = () => (rpc ??= createSolanaRpc(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com"));
const addrDec = getAddressDecoder();
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** Reads and decodes the on-chain EscrowVault account for a vault id. Returns null if missing. */
export async function readVault(vaultId: string) {
  const programAddress = address(process.env.PROGRAM_ID || "35nqDayAETPzRnjLw5bxEiw3ovzSndMp4caQLF1PXFGz");
  const [pda] = await getProgramDerivedAddress({ programAddress, seeds: ["escrow_user", vaultId] });
  const res = await getRpc().getAccountInfo(pda, { encoding: "base64", commitment: "confirmed" }).send();
  if (!res.value) return null;
  const d = new Uint8Array(getBase64Encoder().encode(res.value.data[0]));
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let o = 8;
  const a32 = () => {
    const v = addrDec.decode(d.slice(o, o + 32));
    o += 32;
    return v;
  };
  const b32 = () => {
    const v = hex(d.slice(o, o + 32));
    o += 32;
    return v;
  };
  const client = a32();
  const jobInfo = b32();
  const worker = d[o++] === 1 ? a32() : null;
  const admin = a32();
  let activeMilestone = null;
  if (d[o++] === 1) {
    const tokenAmt = dv.getBigUint64(o, true).toString();
    o += 8;
    const requirementHash = b32();
    const disputeHash = d[o++] === 1 ? b32() : null;
    const isSatisfied = d[o++] === 1;
    activeMilestone = { tokenAmt, requirementHash, disputeHash, isSatisfied };
  }
  return { address: pda, client, jobInfo, worker, admin, activeMilestone };
}
