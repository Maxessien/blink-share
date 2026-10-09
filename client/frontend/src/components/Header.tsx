import { ClientOnly, Link, useRouterState } from "@tanstack/react-router";
import { Menu, Zap } from "lucide-react";
import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { WalletButton } from "./WalletButton";

const links = [
  { to: "/", label: "Explore Gigs" },
  { to: "/create", label: "Create Gig" },
  { to: "/vaults", label: "My Vaults" },
  { to: "/admin", label: "Admin" },
] as const;

export function TopLoader() {
  const loading = useRouterState({ select: (s) => s.status === "pending" });
  if (!loading) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden">
      <div className="h-full w-2/5 animate-toploader bg-brand" />
    </div>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-primary-foreground">
            <Zap className="h-4 w-4" />
          </span>
          Blink <span className="text-brand">Escrow</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} label={l.label} />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-accent sm:inline">
            Devnet
          </span>
          <ClientOnly fallback={<div className="h-10 w-28 rounded-lg bg-secondary" />}>
            <WalletButton />
          </ClientOnly>
          <button className="rounded-md p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      {open && (
        <nav className="flex flex-col gap-1 border-t border-border px-4 py-3 md:hidden" onClick={() => setOpen(false)}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} label={l.label} />
          ))}
        </nav>
      )}
    </header>
  );
}

function NavLink({ to, label }: { to: (typeof links)[number]["to"]; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/" }}
      className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{ className: "!text-foreground bg-secondary" }}
    >
      {label}
      {to === "/admin" && <AdminDot />}
    </Link>
  );
}

function AdminDot() {
  return (
    <ClientOnly>
      <AdminDotInner />
    </ClientOnly>
  );
}
function AdminDotInner() {
  const { isAdmin } = useWallet();
  return isAdmin ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" /> : null;
}
