import { createFileRoute } from "@tanstack/react-router";
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { z } from "zod";
import { API_URL } from "@/lib/config";
import { ixAcceptBlinkJob } from "@/lib/solana/program";
import { fetchVault, rpc } from "@/lib/solana/rpc";

// Solana Actions spec headers (devnet genesis hash as chain id)
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "X-Action-Version": "2.4",
  "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const vaultIdSchema = z.string().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/);

async function gigMeta(vaultId: string) {
  if (!API_URL) return null;
  try {
    const r = await fetch(`${API_URL}/escrows/${encodeURIComponent(vaultId)}`);
    if (!r.ok) return null;
    const d = (await r.json()) as { escrow?: { title: string; description: string; budget?: string } };
    return d.escrow ?? null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/actions/accept/$vaultId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: HEADERS }),
      GET: async ({ request, params }) => {
        const parsed = vaultIdSchema.safeParse(params.vaultId);
        if (!parsed.success) return json({ message: "Invalid vault id" }, 400);
        const origin = new URL(request.url).origin;
        const [vault, meta] = await Promise.all([fetchVault(parsed.data).catch(() => null), gigMeta(parsed.data)]);
        if (!vault) return json({ message: "Vault not found" }, 404);
        const taken = !!vault.worker;
        const desc = meta?.description ?? "Milestone-based escrow gig on Solana.";
        return json({
          type: "action",
          icon: `${origin}/blink-icon.jpg`,
          title: meta?.title ?? `Gig ${parsed.data}`,
          description: (meta?.budget ? `Budget: ${meta.budget}. ` : "") + (desc.length > 280 ? desc.slice(0, 277) + "…" : desc),
          label: taken ? "Gig taken" : "Accept Gig",
          disabled: taken,
          ...(taken ? { error: { message: "This gig already has a worker." } } : {}),
          links: {
            actions: [{ type: "transaction", label: "Accept Gig", href: `/api/actions/accept/${parsed.data}` }],
          },
        });
      },
      POST: async ({ request, params }) => {
        const parsed = vaultIdSchema.safeParse(params.vaultId);
        if (!parsed.success) return json({ message: "Invalid vault id" }, 400);
        const body = z.object({ account: z.string().min(32).max(44) }).safeParse(await request.json().catch(() => null));
        if (!body.success) return json({ message: "Missing or invalid 'account'" }, 400);
        let account;
        try {
          account = address(body.data.account);
        } catch {
          return json({ message: "Invalid account address" }, 400);
        }
        const vault = await fetchVault(parsed.data).catch(() => null);
        if (!vault) return json({ message: "Vault not found" }, 404);
        if (vault.worker) return json({ message: "This gig already has a worker" }, 400);
        if (vault.client === account) return json({ message: "The client can't accept their own gig" }, 400);

        const { value: blockhash } = await rpc().getLatestBlockhash({ commitment: "confirmed" }).send();
        const ix = await ixAcceptBlinkJob({ signer: account, vaultId: parsed.data });
        const msg = pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayer(account, m),
          (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
          (m) => appendTransactionMessageInstruction(ix, m),
        );
        const tx = getBase64EncodedWireTransaction(compileTransaction(msg));
        return json({ type: "transaction", transaction: tx, message: "You're now the worker on this gig. Open Blink Escrow to propose your first milestone." });
      },
    },
  },
});
