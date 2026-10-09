import { useSelectedWalletAccount } from "@solana/react";
import { useConnect, useDisconnect, type UiWallet } from "@wallet-standard/react";
import { Check, Copy, LogOut, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { short } from "@/lib/config";
import { Button } from "./ui";

export function WalletButton() {
  const [account, setAccount, wallets] = useSelectedWalletAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {account ? (
        <Button variant="outline" onClick={() => setOpen((o) => !o)} className="font-mono">
          <span className="h-2 w-2 rounded-full bg-primary shadow-glow" />
          {short(account.address)}
        </Button>
      ) : (
        <Button onClick={() => setOpen((o) => !o)}>
          <Wallet className="h-4 w-4" /> Connect
        </Button>
      )}
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-border bg-popover p-2 shadow-2xl">
          {account ? (
            <ConnectedMenu
              address={account.address}
              wallet={wallets.find((w) => w.accounts.some((a) => a.address === account.address))}
              onDone={() => {
                setAccount(undefined);
                setOpen(false);
              }}
            />
          ) : wallets.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              No Solana wallet found. Install{" "}
              <a className="text-primary underline" href="https://phantom.app" target="_blank" rel="noreferrer">
                Phantom
              </a>{" "}
              or{" "}
              <a className="text-primary underline" href="https://solflare.com" target="_blank" rel="noreferrer">
                Solflare
              </a>{" "}
              and switch it to Devnet.
            </div>
          ) : (
            <>
              <div className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">Choose wallet</div>
              {wallets.map((w) => (
                <WalletOption
                  key={w.name}
                  wallet={w}
                  onConnected={(acc) => {
                    setAccount(acc);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WalletOption({ wallet, onConnected }: { wallet: UiWallet; onConnected: (a: UiWallet["accounts"][number]) => void }) {
  const [connecting, connect] = useConnect(wallet);
  return (
    <button
      disabled={connecting}
      onClick={async () => {
        try {
          const accs = await connect();
          if (accs[0]) onConnected(accs[0]);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Connection failed");
        }
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-secondary disabled:opacity-50"
    >
      <img src={wallet.icon} alt="" className="h-6 w-6 rounded" />
      <span className="flex-1">{wallet.name}</span>
      {connecting && <span className="text-xs text-muted-foreground">Connecting…</span>}
    </button>
  );
}

function ConnectedMenu({ address, wallet, onDone }: { address: string; wallet: UiWallet | undefined; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="px-3 py-2">
        <div className="text-xs text-muted-foreground">{wallet?.name ?? "Connected"} · Devnet</div>
        <div className="mt-1 break-all font-mono text-xs">{address}</div>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
      >
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />} Copy address
      </button>
      {wallet ? <DisconnectBtn wallet={wallet} onDone={onDone} /> : (
        <button onClick={onDone} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-secondary">
          <LogOut className="h-4 w-4" /> Disconnect
        </button>
      )}
    </div>
  );
}

function DisconnectBtn({ wallet, onDone }: { wallet: UiWallet; onDone: () => void }) {
  const [, disconnect] = useDisconnect(wallet);
  return (
    <button
      onClick={async () => {
        try {
          await disconnect();
        } finally {
          onDone();
        }
      }}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-secondary"
    >
      <LogOut className="h-4 w-4" /> Disconnect
    </button>
  );
}
