import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { Escrow } from "@/lib/api";
import { short, tokenForMint } from "@/lib/config";
import { Chip, statusTone } from "./ui";

export function GigCard({ e, me }: { e: Escrow; me?: string | null }) {
  const t = tokenForMint(e.mintAddress);
  const role = me ? (me === e.clientAddress ? "Client" : me === e.workerAddress ? "Worker" : null) : null;
  return (
    <Link
      to="/vault/$vaultId"
      params={{ vaultId: e.vaultId }}
      className="group flex flex-col rounded-2xl border border-border bg-card/70 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
    >
      <div className="mb-3 flex items-center gap-2">
        <Chip tone={statusTone(e.status)}>{e.status.replace("_", " ")}</Chip>
        {e.category && <Chip>{e.category}</Chip>}
        {role && <Chip tone="accent">{role}</Chip>}
        <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <h3 className="line-clamp-2 text-lg font-semibold leading-snug">{e.title}</h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{e.description}</p>
      <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Budget</div>
          <div className="font-semibold">
            {e.budget || "—"} <span className="text-sm text-muted-foreground">{t.symbol}</span>
          </div>
        </div>
        <div className="text-right font-mono text-[11px] text-muted-foreground">
          <div>{e.vaultId}</div>
          <div>by {short(e.clientAddress)}</div>
        </div>
      </div>
    </Link>
  );
}
