import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Gavel,
  Lock,
  Share2,
  ShieldCheck,
  UserPlus,
  Vault,
} from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";
import {
  api,
  disputePayload,
  requirementPayload,
  type Dispute,
  type Escrow,
  type Milestone,
} from "@/lib/api";
import {
  API_URL,
  explorerAddr,
  fromBaseUnits,
  short,
  toBaseUnits,
  tokenForMint,
} from "@/lib/config";
import { sha256Bytes, sha256Hex, type OnChainVault } from "@/lib/solana/program";
import { fetchVault } from "@/lib/solana/rpc";
import { acceptJob, disputeMilestone, fundMilestone, releaseMilestone } from "@/lib/solana/actions";
import { errorToast, withTxToast } from "@/lib/tx-toast";
import { useWallet } from "@/lib/wallet";
import {
  Button,
  Card,
  Chip,
  Empty,
  Input,
  Label,
  Modal,
  Mono,
  Spinner,
  Textarea,
  statusTone,
} from "@/components/ui";
import { BackendBanner } from "@/components/ConnectPrompt";
import { WalletButton } from "@/components/WalletButton";

export const Route = createFileRoute("/vault/$vaultId")({
  head: ({ params }) => ({
    meta: [
      { title: `Vault ${params.vaultId} — Blink Escrow` },
      {
        name: "description",
        content:
          "Milestone escrow vault on Solana: accept the gig, fund milestones, release or dispute.",
      },
      { property: "og:title", content: `Vault ${params.vaultId} — Blink Escrow` },
      {
        property: "og:description",
        content:
          "Milestone escrow vault on Solana: accept the gig, fund milestones, release or dispute.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VaultPage,
});

function VaultPage() {
  return (
    <ClientOnly fallback={<Spinner label="Loading vault" />}>
      <VaultInner />
    </ClientOnly>
  );
}

function VaultInner() {
  const { vaultId } = Route.useParams();
  const db = useQuery({
    queryKey: ["escrow", vaultId],
    queryFn: () => api.getEscrow(vaultId),
    enabled: !!API_URL,
    retry: 1,
  });
  const chain = useQuery({
    queryKey: ["chain", vaultId],
    queryFn: () => fetchVault(vaultId),
    refetchInterval: 15_000,
  });

  if (chain.isLoading || (API_URL && db.isLoading))
    return <Spinner label="Reading vault from Devnet" />;
  if (!chain.data)
    return (
      <Empty icon={<Vault className="h-10 w-10" />} title="Vault not found on-chain">
        No escrow account exists for <Mono>{vaultId}</Mono> on Devnet.
      </Empty>
    );

  return (
    <VaultView
      vaultId={vaultId}
      v={chain.data}
      detail={db.data}
      dbError={db.error as Error | null}
    />
  );
}

function VaultView({
  vaultId,
  v,
  detail,
  dbError,
}: {
  vaultId: string;
  v: OnChainVault;
  detail: { escrow: Escrow; milestones: Milestone[]; disputes: Dispute[] } | undefined;
  dbError: Error | null;
}) {
  const { address: me } = useWallet();
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["escrow", vaultId] }),
      qc.invalidateQueries({ queryKey: ["chain", vaultId] }),
    ]);

  const escrow = detail?.escrow;
  const milestones = detail?.milestones ?? [];
  const disputes = detail?.disputes ?? [];
  const token = tokenForMint(escrow?.mintAddress ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const role =
    me === v.client
      ? "client"
      : me && me === v.worker
        ? "worker"
        : me === v.admin
          ? "admin"
          : me
            ? "visitor"
            : null;

  const m = v.activeMilestone;
  const active = m && !m.isSatisfied ? m : null;
  const disputed = !!active?.disputeHash;
  const proposal = [...milestones].reverse().find((x) => x.status === "proposed_by_worker");
  const currentDb = [...milestones]
    .reverse()
    .find(
      (x) => x.status === "funded_active" || x.status === "disputed" || x.status === "submitted",
    );
  const hashOk = escrow ? sha256Hex(escrow.description) === v.jobInfo : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <BackendBanner />
        {dbError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {dbError.message}
          </div>
        )}

        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Chip tone={disputed ? "danger" : active ? "primary" : v.worker ? "primary" : "accent"}>
              {disputed
                ? "disputed"
                : active
                  ? "milestone active"
                  : v.worker
                    ? "in progress"
                    : "open"}
            </Chip>
            {escrow?.category && <Chip>{escrow.category}</Chip>}
            {role && role !== "visitor" && <Chip tone="accent">You: {role}</Chip>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {escrow?.title ?? `Vault ${vaultId}`}
          </h1>
        </div>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-primary" /> Brief
            </h2>
            {hashOk !== null && (
              <Chip tone={hashOk ? "primary" : "danger"}>
                <ShieldCheck className="h-3 w-3" />{" "}
                {hashOk ? "matches on-chain hash" : "hash mismatch"}
              </Chip>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {escrow?.description ?? "Off-chain brief unavailable."}
          </p>
          <div className="mt-4 truncate font-mono text-[11px] text-muted-foreground">
            job_info {v.jobInfo}
          </div>
        </Card>

        {/* Lifecycle */}
        {!me ? (
          <Card className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Connect a wallet to act on this vault.</p>
            <WalletButton />
          </Card>
        ) : !v.worker ? (
          <AcceptPanel vaultId={vaultId} isClient={role === "client"} onDone={refresh} />
        ) : active ? (
          <ActivePanel
            vaultId={vaultId}
            v={v}
            escrow={escrow}
            active={active}
            dbMilestone={currentDb}
            disputes={disputes}
            role={role}
            token={token}
            onDone={refresh}
          />
        ) : role === "worker" ? (
          proposal ? (
            <ProposalCard
              p={proposal}
              token={token}
              note="Waiting for the client to accept and fund."
            />
          ) : (
            <ProposeForm
              vaultId={vaultId}
              decimals={token.decimals}
              symbol={token.symbol}
              onDone={refresh}
            />
          )
        ) : role === "client" ? (
          proposal ? (
            <FundPanel
              vaultId={vaultId}
              p={proposal}
              escrow={escrow}
              token={token}
              onDone={refresh}
            />
          ) : (
            <Card>
              <p className="text-sm text-muted-foreground">
                Waiting for the worker to propose the next milestone.
              </p>
            </Card>
          )
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              This gig has been taken. Only the client and worker can act on it.
            </p>
          </Card>
        )}

        {milestones.length > 0 && (
          <div>
            <h2 className="mb-3 font-semibold">Milestone history</h2>
            <div className="space-y-2">
              {milestones.map((x) => (
                <div
                  key={x._id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    #{x.milestoneIndex + 1}
                  </span>
                  <span className="flex-1 truncate">{x.title}</span>
                  <span className="font-semibold">
                    {fromBaseUnits(x.tokenAmount, token.decimals)} {token.symbol}
                  </span>
                  <Chip tone={statusTone(x.status)}>{x.status.replace(/_/g, " ")}</Chip>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Vault
          </h3>
          <dl className="space-y-3 text-sm">
            <Row k="Vault ID" v={<Mono>{vaultId}</Mono>} />
            <Row k="Account" v={<AddrLink a={v.address} />} />
            <Row k="Client" v={<AddrLink a={v.client} />} />
            <Row
              k="Worker"
              v={
                v.worker ? (
                  <AddrLink a={v.worker} />
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )
              }
            />
            <Row k="Arbitrator" v={<AddrLink a={v.admin} />} />
            <Row k="Token" v={token.symbol} />
            {escrow?.budget && <Row k="Budget" v={`${escrow.budget} ${token.symbol}`} />}
          </dl>
        </Card>
        {active && (
          <Card className="border-primary/40">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Lock className="h-3.5 w-3.5 text-primary" /> Locked in escrow
            </div>
            <div className="mt-2 text-3xl font-bold">
              {fromBaseUnits(active.tokenAmt, token.decimals)}{" "}
              <span className="text-lg text-muted-foreground">{token.symbol}</span>
            </div>
          </Card>
        )}
        {!v.worker && <ShareBlink vaultId={vaultId} />}
        <Link
          to="/"
          className="block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to gigs
        </Link>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
function AddrLink({ a }: { a: string }) {
  return (
    <a
      href={explorerAddr(a)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs hover:text-primary"
    >
      {short(a)} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function ShareBlink({ vaultId }: { vaultId: string }) {
  const actionUrl = `${window.location.origin}/api/actions/accept/${vaultId}`;
  const blinkUrl = `${window.location.origin}/vault/${vaultId}`;
  return (
    <Card className="border-accent/40">
      <h3 className="flex items-center gap-2 font-semibold">
        <Share2 className="h-4 w-4 text-accent" /> Share as Blink
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone can accept this gig straight from a post that shows the Blink.
      </p>
      <Button
        variant="accent"
        className="mt-4 w-full"
        onClick={() => {
          navigator.clipboard.writeText(blinkUrl);
          toast.success("Blink link copied");
        }}
      >
        <Copy className="h-4 w-4" /> Copy Blink link
      </Button>
      <button
        className="mt-2 w-full truncate text-center font-mono text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => {
          navigator.clipboard.writeText(actionUrl);
          toast.success("Action URL copied");
        }}
      >
        {actionUrl}
      </button>
    </Card>
  );
}

function AcceptPanel({
  vaultId,
  isClient,
  onDone,
}: {
  vaultId: string;
  isClient: boolean;
  onDone: () => Promise<unknown>;
}) {
  const { signers, getAuthHeaders } = useWallet();
  const [busy, setBusy] = useState(false);
  if (isClient)
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Your gig is live. Share it as a Blink or wait for a worker to accept.
        </p>
      </Card>
    );
  return (
    <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-semibold">This gig is open</h3>
        <p className="text-sm text-muted-foreground">
          Accepting assigns your wallet as the worker on-chain.
        </p>
      </div>
      <Button
        loading={busy}
        onClick={async () => {
          if (!signers) return;
          setBusy(true);
          try {
            const sig = await withTxToast("Accept job", () =>
              acceptJob(signers.sendingSigner, vaultId),
            );
            if (API_URL) {
              try {
                await api.acceptEscrow(await getAuthHeaders(), vaultId, sig);
              } catch (e) {
                errorToast(e);
              }
            }
            await onDone();
          } catch {
            /* toast shown */
          } finally {
            setBusy(false);
          }
        }}
      >
        <UserPlus className="h-4 w-4" /> Accept Job
      </Button>
    </Card>
  );
}

function ProposeForm({
  vaultId,
  decimals,
  symbol,
  onDone,
}: {
  vaultId: string;
  decimals: number;
  symbol: string;
  onDone: () => Promise<unknown>;
}) {
  const { getAuthHeaders } = useWallet();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 3 && description.trim().length >= 10 && Number(amount) > 0;
  return (
    <Card>
      <h3 className="mb-1 font-semibold">Propose the next milestone</h3>
      <p className="mb-5 text-sm text-muted-foreground">
        The client reviews it and funds the escrow to start.
      </p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.proposeMilestone(await getAuthHeaders(), vaultId, {
              title: title.trim(),
              description: description.trim(),
              deliverables: deliverables.trim(),
              tokenAmount: toBaseUnits(amount, decimals).toString(),
            });
            toast.success("Milestone proposed");
            await onDone();
          } catch (err) {
            errorToast(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Wireframes & design system"
          />
        </label>
        <label className="block">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={3000}
          />
        </label>
        <label className="block">
          <Label>Deliverables</Label>
          <Textarea
            value={deliverables}
            onChange={(e) => setDeliverables(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Figma file, component list, …"
          />
        </label>
        <label className="block">
          <Label>Amount ({symbol})</Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <Button type="submit" loading={busy} disabled={!valid || !API_URL} className="w-full">
          Submit proposal
        </Button>
      </form>
    </Card>
  );
}

function ProposalCard({
  p,
  token,
  note,
  children,
}: {
  p: Milestone;
  token: { decimals: number; symbol: string };
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-accent/40">
      <div className="mb-3 flex items-center justify-between">
        <Chip tone="accent">Proposal #{p.milestoneIndex + 1}</Chip>
        <span className="text-xl font-bold">
          {fromBaseUnits(p.tokenAmount, token.decimals)}{" "}
          <span className="text-sm text-muted-foreground">{token.symbol}</span>
        </span>
      </div>
      <h3 className="text-lg font-semibold">{p.title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>
      {p.deliverables && (
        <div className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm">
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Deliverables
          </div>
          <p className="whitespace-pre-wrap">{p.deliverables}</p>
        </div>
      )}
      {note && <p className="mt-4 text-sm text-muted-foreground">{note}</p>}
      {children}
    </Card>
  );
}

function FundPanel({
  vaultId,
  p,
  escrow,
  token,
  onDone,
}: {
  vaultId: string;
  p: Milestone;
  escrow: Escrow | undefined;
  token: { decimals: number; symbol: string };
  onDone: () => Promise<unknown>;
}) {
  const { signers, getAuthHeaders } = useWallet();
  const [busy, setBusy] = useState(false);
  return (
    <ProposalCard p={p} token={token}>
      <Button
        className="mt-5 w-full"
        loading={busy}
        onClick={async () => {
          if (!signers || !escrow) return;
          setBusy(true);
          try {
            const payload = requirementPayload(p);
            const auth = await getAuthHeaders();
            await withTxToast("Fund milestone", () =>
              fundMilestone(signers.sendingSigner, {
                vaultId,
                mint: escrow.mintAddress,
                amount: BigInt(p.tokenAmount),
                requirementHash: sha256Bytes(payload),
              }),
            );
            await api
              .updateMilestone(auth, vaultId, p.milestoneIndex, {
                status: "funded_active",
                requirementHash: sha256Hex(payload),
              })
              .catch(errorToast);
            await onDone();
          } catch {
            /* toast shown */
          } finally {
            setBusy(false);
          }
        }}
      >
        <Lock className="h-4 w-4" /> Accept & Fund Milestone
      </Button>
    </ProposalCard>
  );
}

function ActivePanel({
  vaultId,
  v,
  escrow,
  active,
  dbMilestone,
  disputes,
  role,
  token,
  onDone,
}: {
  vaultId: string;
  v: OnChainVault;
  escrow: Escrow | undefined;
  active: NonNullable<OnChainVault["activeMilestone"]>;
  dbMilestone: Milestone | undefined;
  disputes: Dispute[];
  role: string | null;
  token: { decimals: number; symbol: string };
  onDone: () => Promise<unknown>;
}) {
  const { signers, getAuthHeaders } = useWallet();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const disputed = !!active.disputeHash;
  const reqOk = dbMilestone
    ? sha256Hex(requirementPayload(dbMilestone)) === active.requirementHash
    : null;
  const myDispute = disputes.find(
    (d) => dbMilestone && d.milestoneIndex === dbMilestone.milestoneIndex && d.disputedBy === role,
  );
  const party = role === "client" || role === "worker";

  return (
    <Card className={disputed ? "border-destructive/40" : "border-primary/40"}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip tone={disputed ? "danger" : "primary"}>
          {disputed ? "Disputed" : "Funded & active"}
        </Chip>
        {reqOk !== null && (
          <Chip tone={reqOk ? "primary" : "danger"}>
            <ShieldCheck className="h-3 w-3" />{" "}
            {reqOk ? "requirements verified" : "requirements hash mismatch"}
          </Chip>
        )}
      </div>
      <h3 className="text-lg font-semibold">{dbMilestone?.title ?? "Active milestone"}</h3>
      {dbMilestone && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {dbMilestone.description}
        </p>
      )}
      <div className="mt-3 truncate font-mono text-[11px] text-muted-foreground">
        requirement_hash {active.requirementHash}
      </div>

      {disputed ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg bg-destructive/10 p-4 text-sm">
          <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <div className="font-semibold text-destructive">Under arbitration</div>
            <p className="text-muted-foreground">
              Funds stay locked until the arbitrator settles the split.
            </p>
            {party && !myDispute && (
              <Button variant="outline" className="mt-3" onClick={() => setModal(true)}>
                Add your statement
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-3">
          {role === "client" && (
            <Button
              loading={busy}
              onClick={async () => {
                if (!signers || !escrow || !v.worker) return;
                setBusy(true);
                try {
                  const auth = await getAuthHeaders();
                  await withTxToast("Release payment", () =>
                    releaseMilestone(signers.sendingSigner, {
                      vaultId,
                      mint: escrow.mintAddress,
                      worker: v.worker!,
                    }),
                  );
                  if (dbMilestone)
                    await api
                      .updateMilestone(auth, vaultId, dbMilestone.milestoneIndex, {
                        status: "released",
                      })
                      .catch(errorToast);
                  await onDone();
                } catch {
                  /* toast shown */
                } finally {
                  setBusy(false);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> Release Payment
            </Button>
          )}
          {party && (
            <Button variant="danger" onClick={() => setModal(true)}>
              <AlertTriangle className="h-4 w-4" /> Raise Dispute
            </Button>
          )}
        </div>
      )}

      <DisputeModal
        open={modal}
        onClose={() => setModal(false)}
        vaultId={vaultId}
        milestoneIndex={dbMilestone?.milestoneIndex ?? 0}
        alreadyOnChain={disputed}
        token={token}
        onDone={async () => {
          setModal(false);
          await onDone();
        }}
      />
    </Card>
  );
}

function DisputeModal({
  open,
  onClose,
  vaultId,
  milestoneIndex,
  alreadyOnChain,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  milestoneIndex: number;
  alreadyOnChain: boolean;
  token: { decimals: number; symbol: string };
  onDone: () => Promise<unknown>;
}) {
  const { signers, getAuthHeaders } = useWallet();
  const [reason, setReason] = useState("");
  const [claimSummary, setClaim] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const evidenceUrls = links
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
  const payload = disputePayload({
    vaultId,
    milestoneIndex,
    reason: reason.trim(),
    evidenceUrls,
    claimSummary: claimSummary.trim(),
  });
  const hash = sha256Hex(payload);
  const valid = reason.trim().length >= 20 && claimSummary.trim().length >= 5;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={alreadyOnChain ? "Add your statement" : "Raise a dispute"}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!signers) return;
          setBusy(true);
          try {
            const auth = await getAuthHeaders();
            if (!alreadyOnChain) {
              await withTxToast("Raise dispute", () =>
                disputeMilestone(signers.sendingSigner, {
                  vaultId,
                  disputeHash: sha256Bytes(payload),
                }),
              );
            }
            await api.createDispute(auth, {
              vaultId,
              milestoneIndex,
              reason: reason.trim(),
              evidenceUrls,
              claimSummary: claimSummary.trim(),
              disputeHash: hash,
            });
            toast.success("Statement saved");
            await onDone();
          } catch (err) {
            if (!(err instanceof Error && /failed:/.test(err.message))) errorToast(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <Label>What went wrong?</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            maxLength={4000}
          />
        </label>
        <label className="block">
          <Label>What outcome do you want?</Label>
          <Input
            value={claimSummary}
            onChange={(e) => setClaim(e.target.value)}
            maxLength={300}
            placeholder="e.g. 70% to worker, 30% refunded"
          />
        </label>
        <label className="block">
          <Label hint={`${evidenceUrls.length} valid`}>Proof links (one per line)</Label>
          <Textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={3}
            placeholder="https://…"
          />
        </label>
        <div className="truncate rounded-lg bg-secondary/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
          dispute_hash {hash}
        </div>
        <Button
          type="submit"
          variant="danger"
          loading={busy}
          disabled={!valid || !API_URL}
          className="w-full"
        >
          {alreadyOnChain ? "Save statement" : "Sign & raise dispute"}
        </Button>
      </form>
    </Modal>
  );
}
