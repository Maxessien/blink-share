import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { address } from "@solana/kit";
import { nanoid } from "nanoid";
import { useState } from "react";
import { toast } from "react-toastify";
import { Hash } from "lucide-react";
import { api } from "@/lib/api";
import { ADMIN_ADDRESS, API_URL, TOKENS } from "@/lib/config";
import { ixCreateEscrowVault, ixCreateTknAcct, sha256Bytes, sha256Hex } from "@/lib/solana/program";
import { sendInstructions } from "@/lib/solana/rpc";
import { withTxToast, errorToast } from "@/lib/tx-toast";
import { useWallet } from "@/lib/wallet";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import { BackendBanner, RequireWallet } from "@/components/ConnectPrompt";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create a Gig — Blink Escrow" },
      { name: "description", content: "Open an on-chain escrow vault for your gig and share it as a Solana Blink." },
      { property: "og:title", content: "Create a Gig — Blink Escrow" },
      { property: "og:description", content: "Open an on-chain escrow vault for your gig and share it as a Solana Blink." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreatePage,
});

const CATEGORIES = ["Development", "Design", "Writing", "Marketing", "Research", "Other"];

function CreatePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Create a gig</h1>
      <p className="mt-2 text-muted-foreground">Opens an escrow vault and its token account on Devnet in one transaction.</p>
      <div className="mt-8">
        <BackendBanner />
        <RequireWallet title="Connect a wallet to post a gig">
          <CreateForm />
        </RequireWallet>
      </div>
    </div>
  );
}

function CreateForm() {
  const { signers, address: me, getAuthHeaders } = useWallet();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [category, setCategory] = useState<string>("Development");
  const [mint, setMint] = useState<string>(TOKENS[0]?.mint ?? "");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  const briefHash = brief ? sha256Hex(brief) : "";
  const valid = title.trim().length >= 4 && brief.trim().length >= 20 && Number(budget) > 0;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!signers || !me) return;
    if (!ADMIN_ADDRESS) { toast.error("Admin address is not configured (VITE_ADMIN_ADDRESS)."); return; }
    if (!API_URL) { toast.error("Backend not connected, so the gig can't be saved."); return; }
    setBusy(true);
    try {
      const auth = await getAuthHeaders();
      const vaultId = nanoid(12);
      const signer = signers.sendingSigner;
      const m = address(mint);
      await withTxToast("Create escrow vault", async () =>
        sendInstructions(signer, [
          await ixCreateEscrowVault({ signer, vaultId, jobInfo: sha256Bytes(brief), admin: address(ADMIN_ADDRESS) }),
          await ixCreateTknAcct({ signer, vaultId, mint: m }),
        ]),
      );
      await api.createEscrow(auth, {
        vaultId,
        title: title.trim(),
        description: brief,
        category,
        budget,
        clientAddress: me,
        adminAddress: ADMIN_ADDRESS,
        mintAddress: mint,
      });
      toast.success("Gig saved");
      nav({ to: "/vault/$vaultId", params: { vaultId } });
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("failed"))) errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Build a landing page for our NFT drop" maxLength={120} />
        </label>
        <label className="block">
          <Label hint={`${brief.length} chars`}>Detailed brief</Label>
          <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Scope, deliverables, deadlines, acceptance criteria…" rows={7} maxLength={5000} />
        </label>
        {briefHash && (
          <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            <Hash className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="truncate">job_info = {briefHash}</span>
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <Label>Category</Label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-input bg-background/60 px-3.5 py-2.5 text-sm">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <Label>Budget</Label>
            <Input type="number" min="0" step="any" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="500" />
          </label>
        </div>
        <div>
          <Label>Payment token</Label>
          <div className="grid grid-cols-2 gap-3">
            {TOKENS.map((t) => (
              <button
                type="button"
                key={t.mint}
                onClick={() => setMint(t.mint)}
                className={`rounded-xl border p-3 text-left transition-all ${mint === t.mint ? "border-primary bg-primary/10 shadow-glow" : "border-border hover:border-primary/40"}`}
              >
                <div className="font-semibold">{t.label}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">{t.mint}</div>
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" className="w-full" loading={busy} disabled={!valid}>
          Create vault & publish gig
        </Button>
        <p className="text-center text-xs text-muted-foreground">You'll sign once to verify your wallet with the backend, then approve the transaction.</p>
      </form>
    </Card>
  );
}
