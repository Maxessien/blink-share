import { ClientOnly } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { API_URL } from "@/lib/config";
import { useWallet } from "@/lib/wallet";
import { Empty, Spinner } from "./ui";
import { WalletButton } from "./WalletButton";

export function RequireWallet({ children, title = "Connect your wallet" }: { children: ReactNode; title?: string }) {
  return (
    <ClientOnly fallback={<Spinner />}>
      <Gate title={title}>{children}</Gate>
    </ClientOnly>
  );
}
function Gate({ children, title }: { children: ReactNode; title: string }) {
  const { address } = useWallet();
  if (!address)
    return (
      <Empty icon={<Wallet className="h-10 w-10" />} title={title}>
        <p className="mb-4">Use a Devnet wallet like Phantom or Solflare.</p>
        <div className="flex justify-center">
          <WalletButton />
        </div>
      </Empty>
    );
  return <>{children}</>;
}

export function BackendBanner() {
  if (API_URL) return null;
  return (
    <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
      Backend not connected. Gig details and listings need the Blink Escrow API; on-chain actions still work.
    </div>
  );
}
