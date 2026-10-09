import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderLock } from "lucide-react";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useWallet } from "@/lib/wallet";
import { GigCard } from "@/components/GigCard";
import { Empty, Spinner } from "@/components/ui";
import { BackendBanner, RequireWallet } from "@/components/ConnectPrompt";

export const Route = createFileRoute("/vaults")({
  head: () => ({
    meta: [
      { title: "My Vaults — Blink Escrow" },
      { name: "description", content: "Escrow vaults where you are the client or the worker." },
      { property: "og:title", content: "My Vaults — Blink Escrow" },
      { property: "og:description", content: "Escrow vaults where you are the client or the worker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VaultsPage,
});

function VaultsPage() {
  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold tracking-tight">My vaults</h1>
      <BackendBanner />
      <RequireWallet title="Connect to see your vaults">
        <List />
      </RequireWallet>
    </div>
  );
}

function List() {
  const { address } = useWallet();
  const q = useQuery({
    queryKey: ["escrows", "mine", address],
    queryFn: () => api.listEscrows({ address: address! }),
    enabled: !!address && !!API_URL,
  });
  if (q.isLoading) return <Spinner label="Loading vaults" />;
  if (q.error) return <Empty icon={<FolderLock className="h-10 w-10" />} title="Couldn't load vaults">{(q.error as Error).message}</Empty>;
  if (!q.data?.length) return <Empty icon={<FolderLock className="h-10 w-10" />} title="No vaults yet">Create a gig or accept one to see it here.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {q.data.map((e) => (
        <GigCard key={e.vaultId} e={e} me={address} />
      ))}
    </div>
  );
}
