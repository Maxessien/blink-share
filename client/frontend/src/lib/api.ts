import { API_URL } from "./config";

export type EscrowStatus = "open" | "in_progress" | "completed" | "disputed";
export type MilestoneStatus = "proposed_by_worker" | "funded_active" | "submitted" | "released" | "disputed";

export type Escrow = {
  _id: string;
  vaultId: string;
  title: string;
  description: string;
  category: string;
  budget?: string;
  clientAddress: string;
  workerAddress?: string | null;
  adminAddress: string;
  mintAddress: string;
  status: EscrowStatus;
  createdAt: string;
};
export type Milestone = {
  _id: string;
  vaultId: string;
  milestoneIndex: number;
  title: string;
  description: string;
  deliverables: string;
  tokenAmount: string;
  requirementHash?: string;
  status: MilestoneStatus;
  createdAt: string;
};
export type Dispute = {
  _id: string;
  vaultId: string;
  milestoneIndex: number;
  disputedBy: "client" | "worker";
  reason: string;
  evidenceUrls: string[];
  claimSummary: string;
  disputeHash: string;
  resolved: boolean;
  split?: { workerAmt: string; clientAmt: string };
  createdAt: string;
};
export type EscrowDetail = { escrow: Escrow; milestones: Milestone[]; disputes: Dispute[] };

export class BackendMissingError extends Error {
  constructor() {
    super("Backend not connected. Set VITE_API_URL to your deployed Express backend.");
  }
}

async function req<T>(path: string, init?: RequestInit & { auth?: Record<string, string> }): Promise<T> {
  if (!API_URL) throw new BackendMissingError();
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.auth ?? {}), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  listEscrows: (q: { status?: string; address?: string } = {}) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    return req<Escrow[]>(`/escrows${p.size ? `?${p}` : ""}`);
  },
  getEscrow: (vaultId: string) => req<EscrowDetail>(`/escrows/${encodeURIComponent(vaultId)}`),
  createEscrow: (auth: Record<string, string>, data: Omit<Escrow, "_id" | "status" | "createdAt" | "workerAddress">) =>
    req<Escrow>("/escrows", { method: "POST", body: JSON.stringify(data), auth }),
  acceptEscrow: (auth: Record<string, string>, vaultId: string, txSig: string) =>
    req<Escrow>(`/escrows/${vaultId}/accept`, { method: "POST", body: JSON.stringify({ txSig }), auth }),
  proposeMilestone: (auth: Record<string, string>, vaultId: string, data: Pick<Milestone, "title" | "description" | "deliverables" | "tokenAmount">) =>
    req<Milestone>(`/escrows/${vaultId}/milestones`, { method: "POST", body: JSON.stringify(data), auth }),
  updateMilestone: (auth: Record<string, string>, vaultId: string, index: number, data: { status: MilestoneStatus; requirementHash?: string }) =>
    req<Milestone>(`/milestones/${vaultId}/${index}`, { method: "PATCH", body: JSON.stringify(data), auth }),
  createDispute: (auth: Record<string, string>, data: Omit<Dispute, "_id" | "resolved" | "split" | "createdAt" | "disputedBy">) =>
    req<Dispute>("/disputes", { method: "POST", body: JSON.stringify(data), auth }),
  listOpenDisputes: () => req<(Dispute & { escrow?: Escrow; milestone?: Milestone })[]>("/disputes?resolved=false"),
  resolveDispute: (auth: Record<string, string>, vaultId: string, milestoneIndex: number, split: { workerAmt: string; clientAmt: string }) =>
    req<{ ok: true }>(`/disputes/resolve`, { method: "POST", body: JSON.stringify({ vaultId, milestoneIndex, split }), auth }),
};

/** Canonical hashing inputs — must match exactly between hashing and verification. */
export function requirementPayload(m: Pick<Milestone, "title" | "description" | "deliverables" | "tokenAmount">) {
  return JSON.stringify({ title: m.title, description: m.description, deliverables: m.deliverables, tokenAmount: m.tokenAmount });
}
export function disputePayload(d: Pick<Dispute, "vaultId" | "milestoneIndex" | "reason" | "evidenceUrls" | "claimSummary">) {
  return JSON.stringify({
    vaultId: d.vaultId,
    milestoneIndex: d.milestoneIndex,
    reason: d.reason,
    evidenceUrls: d.evidenceUrls,
    claimSummary: d.claimSummary,
  });
}
