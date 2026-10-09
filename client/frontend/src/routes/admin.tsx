import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { api, disputePayload, requirementPayload, type Dispute } from "@/lib/api";
import { ADMIN_ADDRESS, API_URL, fromBaseUnits, short, toBaseUnits, tokenForMint } from "@/lib/config";
import { sha256Hex } from "@/lib/solana/program";
import { fetchVault } from "@/lib/solana/rpc";
import { adminSettle } from "@/lib/solana/actions";
import { errorToast, withTxToast } from "@/lib/tx-toast";
import { useWallet } from "@/lib/wallet";
import { Button, Card, Chip, Empty, Input, Mono, Spinner } from "@/components/ui";
import { BackendBanner, RequireWallet } from "@/components/ConnectPrompt";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Arbitration — Blink Escrow" },
      { name: "description", content: "Review disputed milestones, verify evidence hashes and settle escrow splits." },
      { property: "og:title", content: "Admin Arbitration — Blink Escrow" },
      { property: "og:description", content: "Review disputed milestones, verify evidence hashes and settle escrow splits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Arbitration</h1>
      <p className="mb-8 text-muted-foreground">Disputed milestones awaiting a settlement.</p>
      <BackendBanner />
      <RequireWallet title="Connect the admin wallet">
        <ClientOnly>
          <AdminGate />
        </ClientOnly>
      </RequireWallet>
    </div>
  );
}

function AdminGate() {
  const { isAdmin, address } = useWallet();
  if (!ADMIN_ADDRESS)
    return <Empty icon={<ShieldAlert className="h-10 w-10" />} title="Admin not configured">Set VITE_ADMIN_ADDRESS to the arbitrator wallet.</Empty>;
  if (!isAdmin)
    return (
      <Empty icon={<ShieldX className="h-10 w-10" />} title="Admins only">
        <Mono>{short(address)}</Mono> isn't the platform arbitrator.
      </Empty>
    );
  return <DisputeList />;
}

type Group = { key: string; vaultId: string; milestoneIndex: number; items: Dispute[] };

function DisputeList() {
  const q = useQuery({ queryKey: ["disputes"], queryFn: api.listOpenDisputes, enabled: !!API_URL });
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const d of q.data ?? []) {
      const key = `${d.vaultId}:${d.milestoneIndex}`;
      if (!map.has(key)) map.set(key, { key, vaultId: d.vaultId, milestoneIndex: d.milestoneIndex, items: [] });
      map.get(key)!.items.push(d);
    }
    return [...map.values()];
  }, [q.data]);
  const [sel, setSel] = useState<string | null>(null);
  const current = groups.find((g) => g.key === sel) ?? groups[0];

  if (q.isLoading) return <Spinner label="Loading disputes" />;
  if (q.error) return <Empty icon={<Gavel className="h-10 w-10" />} title="Couldn't load disputes">{(q.error as Error).message}</Empty>;
  if (!groups.length) return <Empty icon={<Gavel className="h-10 w-10" />} title="No open disputes">All clear.</Empty>;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        {groups.map((g) => (
          <button
            key={g.key}
            onClick={() => setSel(g.key)}
            className={`w-full rounded-xl border p-4 text-left transition-all ${current?.key === g.key ? "border-destructive/60 bg-destructive/10" : "border-border hover:border-destructive/40"}`}
          >
            <div className="font-mono text-xs text-muted-foreground">{g.vaultId}</div>
            <div className="mt-1 font-semibold">Milestone #{g.milestoneIndex + 1}</div>
            <div className="mt-1 text-xs text-muted-foreground">{g.items.length} statement(s)</div>
          </button>
        ))}
      </div>
      {current && <DisputeViewer key={current.key} g={current} />}
    </div>
  );
}

function DisputeViewer({ g }: { g: Group }) {
  const qc = useQueryClient();
  const { signers, getAuthHeaders } = useWallet();
  const detail = useQuery({ queryKey: ["escrow", g.vaultId], queryFn: () => api.getEscrow(g.vaultId) });
  const chain = useQuery({ queryKey: ["chain", g.vaultId], queryFn: () => fetchVault(g.vaultId) });
  const [pct, setPct] = useState(50);
  const [workerInput, setWorkerInput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (detail.isLoading || chain.isLoading) return <Spinner label="Loading case" />;
  const escrow = detail.data?.escrow;
  const milestone = detail.data?.milestones.find((m) => m.milestoneIndex === g.milestoneIndex);
  const v = chain.data;
  const active = v?.activeMilestone;
  if (!escrow || !v || !active) return <Empty icon={<Gavel className="h-10 w-10" />} title="Case data incomplete">Couldn't read the vault or milestone.</Empty>;

  const token = tokenForMint(escrow.mintAddress);
  const total = active.tokenAmt;
  const settled = active.isSatisfied;
  const workerAmt = workerInput !== null ? clampAmt(workerInput, token.decimals, total) : (total * BigInt(pct)) / 100n;
  const clientAmt = total - workerAmt;
  const reqOk = milestone ? sha256Hex(requirementPayload(milestone)) === active.requirementHash : false;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/vault/$vaultId" params={{ vaultId: g.vaultId }} className="text-lg font-semibold hover:text-primary">
            {escrow.title}
          </Link>
          <Chip tone={reqOk ? "primary" : "danger"}>
            {reqOk ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />} milestone brief {reqOk ? "verified" : "mismatch"}
          </Chip>
        </div>
        {milestone && (
          <div className="mt-4 rounded-lg bg-secondary/60 p-4 text-sm">
            <div className="font-semibold">
              #{milestone.milestoneIndex + 1} {milestone.title}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{milestone.description}</p>
            {milestone.deliverables && <p className="mt-2 whitespace-pre-wrap"><span className="text-muted-foreground">Deliverables: </span>{milestone.deliverables}</p>}
          </div>
        )}
        <div className="mt-3 grid gap-1 font-mono text-[11px] text-muted-foreground">
          <span>client {v.client}</span>
          <span>worker {v.worker}</span>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {(["client", "worker"] as const).map((side) => {
          const d = g.items.find((x) => x.disputedBy === side);
          const localHash = d ? sha256Hex(disputePayload(d)) : null;
          const intact = d ? localHash === d.disputeHash : false;
          const onChain = d ? d.disputeHash === active.disputeHash : false;
          return (
            <Card key={side} className={side === "client" ? "border-accent/30" : "border-primary/30"}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip tone={side === "client" ? "accent" : "primary"}>{side}</Chip>
                {d && (
                  <Chip tone={intact && onChain ? "primary" : intact ? "warning" : "danger"}>
                    {intact && onChain ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
                    {intact && onChain ? "matches on-chain hash" : intact ? "counter-statement" : "tampered"}
                  </Chip>
                )}
              </div>
              {d ? (
                <>
                  <p className="text-sm font-semibold">{d.claimSummary}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{d.reason}</p>
                  {d.evidenceUrls.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {d.evidenceUrls.map((u) => (
                        <li key={u}>
                          <a href={u} target="_blank" rel="noreferrer noopener" className="break-all text-xs text-primary hover:underline">
                            {u}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No statement submitted.</p>
              )}
            </Card>
          );
        })}
      </div>
      <div className="truncate font-mono text-[11px] text-muted-foreground">on-chain dispute_hash {active.disputeHash ?? "none"}</div>

      <Card className="border-destructive/40">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Gavel className="h-4 w-4 text-destructive" /> Settlement
        </h3>
        <div className="mb-2 flex justify-between text-sm">
          <span>
            Worker <b>{fromBaseUnits(workerAmt, token.decimals)}</b> {token.symbol}
          </span>
          <span>
            Client <b>{fromBaseUnits(clientAmt, token.decimals)}</b> {token.symbol}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={workerInput !== null ? Number((workerAmt * 100n) / (total || 1n)) : pct}
          onChange={(e) => {
            setWorkerInput(null);
            setPct(Number(e.target.value));
          }}
          className="w-full accent-[var(--primary)]"
          aria-label="Worker share"
        />
        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Exact worker amount ({token.symbol})</span>
            <Input type="number" min="0" step="any" value={workerInput ?? fromBaseUnits(workerAmt, token.decimals)} onChange={(e) => setWorkerInput(e.target.value)} />
          </label>
          <div className="pb-2.5 text-sm text-muted-foreground">
            of {fromBaseUnits(total, token.decimals)} total
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Worker + client always equals the locked total; the program rejects anything else.</p>
        <Button
          variant="danger"
          className="mt-5 w-full"
          loading={busy}
          disabled={settled || !active.disputeHash || workerAmt + clientAmt !== total}
          onClick={async () => {
            if (!signers || !v.worker) return;
            setBusy(true);
            try {
              const auth = await getAuthHeaders();
              await withTxToast("Arbitrate & settle", () =>
                adminSettle(signers.sendingSigner, { vaultId: g.vaultId, mint: escrow.mintAddress, worker: v.worker!, client: v.client, workerAmt, clientAmt }),
              );
              await api
                .resolveDispute(auth, g.vaultId, g.milestoneIndex, { workerAmt: workerAmt.toString(), clientAmt: clientAmt.toString() })
                .then(() => toast.success("Case closed"))
                .catch(errorToast);
              await Promise.all([qc.invalidateQueries({ queryKey: ["disputes"] }), qc.invalidateQueries({ queryKey: ["chain", g.vaultId] })]);
            } catch {
              /* toast shown */
            } finally {
              setBusy(false);
            }
          }}
        >
          {settled ? "Already settled on-chain" : "Arbitrate & Settle"}
        </Button>
      </Card>
    </div>
  );
}

function clampAmt(ui: string, decimals: number, total: bigint): bigint {
  try {
    const v = toBaseUnits(ui || "0", decimals);
    return v < 0n ? 0n : v > total ? total : v;
  } catch {
    return 0n;
  }
}
