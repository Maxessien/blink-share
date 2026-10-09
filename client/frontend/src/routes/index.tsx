import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Lock, Scale, Share2, Plus } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { GigCard } from "@/components/GigCard";
import { Empty, Spinner } from "@/components/ui";
import { BackendBanner } from "@/components/ConnectPrompt";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Explore Gigs — Blink Escrow" },
      { name: "description", content: "Browse open gigs backed by on-chain milestone escrow on Solana Devnet." },
      { property: "og:title", content: "Explore Gigs — Blink Escrow" },
      { property: "og:description", content: "Browse open gigs backed by on-chain milestone escrow on Solana Devnet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Explore,
});

const FILTERS = [
  { v: "open", l: "Open" },
  { v: "in_progress", l: "In progress" },
  { v: "disputed", l: "Disputed" },
  { v: "", l: "All" },
];

function Explore() {
  const [status, setStatus] = useState("open");
  const q = useQuery({
    queryKey: ["escrows", status],
    queryFn: () => api.listEscrows({ status }),
    enabled: !!API_URL,
  });

  return (
    <div>
      <section className="mb-14 grid gap-10 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div>
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-primary">Milestone escrow · Solana</p>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Get paid per milestone.
            <br />
            <span className="text-brand">Share it as a Blink.</span>
          </h1>
          <p className="mt-5 max-w-xl text-muted-foreground">
            Clients lock tokens in a program-owned vault. Workers accept from anywhere a Blink renders. Disputes go to a neutral arbitrator with
            hash-verified evidence.
          </p>
          <div className="mt-7 flex gap-3">
            <Link to="/create" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:shadow-glow">
              <Plus className="h-4 w-4" /> Post a gig
            </Link>
            <Link to="/vaults" className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-semibold hover:bg-secondary">
              My vaults
            </Link>
          </div>
        </div>
        <ol className="grid gap-3">
          {[
            { i: Lock, t: "Fund", d: "Client deposits the milestone into a PDA vault." },
            { i: Share2, t: "Accept", d: "Worker accepts in-app or via a Blink." },
            { i: Scale, t: "Settle", d: "Release, or let the admin split a dispute." },
          ].map(({ i: I, t, d }, n) => (
            <li key={t} className="flex items-start gap-4 rounded-xl border border-border bg-card/60 p-4">
              <span className="font-mono text-xs text-muted-foreground">0{n + 1}</span>
              <I className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <div className="font-semibold">{t}</div>
                <div className="text-sm text-muted-foreground">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <BackendBanner />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Gigs</h2>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              onClick={() => setStatus(f.v)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${status === f.v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {!API_URL ? (
        <Empty icon={<Briefcase className="h-10 w-10" />} title="No listings yet">
          Listings appear once the backend is connected.
        </Empty>
      ) : q.isLoading ? (
        <Spinner label="Loading gigs" />
      ) : q.error ? (
        <Empty icon={<Briefcase className="h-10 w-10" />} title="Couldn't load gigs">
          {(q.error as Error).message}
        </Empty>
      ) : !q.data?.length ? (
        <Empty icon={<Briefcase className="h-10 w-10" />} title="No gigs here yet">
          <Link to="/create" className="text-primary underline">
            Post the first one
          </Link>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((e) => (
            <GigCard key={e.vaultId} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}
