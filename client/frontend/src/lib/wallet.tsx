import {
  SelectedWalletAccountContextProvider,
  useSelectedWalletAccount,
  useWalletAccountMessageSigner,
  useWalletAccountTransactionSendingSigner,
} from "@solana/react";
import { createSignableMessage, getBase58Decoder, type MessageModifyingSigner, type TransactionSendingSigner } from "@solana/kit";
import type { UiWalletAccount } from "@wallet-standard/react";
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { ADMIN_ADDRESS, CHAIN } from "./config";

const STORAGE_KEY = "blink-escrow:wallet";

type Signers = {
  sendingSigner: TransactionSendingSigner;
  messageSigner: MessageModifyingSigner;
};

type WalletCtx = {
  account: UiWalletAccount | undefined;
  address: string | null;
  isAdmin: boolean;
  signers: Signers | null;
  getAuthHeaders: () => Promise<Record<string, string>>;
};

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <SelectedWalletAccountContextProvider
      filterWallets={(w) => w.chains.some((c) => c.startsWith("solana:"))}
      stateSync={{
        getSelectedWallet: () => (typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY)),
        storeSelectedWallet: (k) => localStorage.setItem(STORAGE_KEY, k),
        deleteSelectedWallet: () => localStorage.removeItem(STORAGE_KEY),
      }}
    >
      <Inner>{children}</Inner>
    </SelectedWalletAccountContextProvider>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const [account] = useSelectedWalletAccount();
  if (account) {
    return (
      <SignerBridge key={account.address} account={account}>
        {children}
      </SignerBridge>
    );
  }
  return <Provide account={undefined} signers={null}>{children}</Provide>;
}

function SignerBridge({ account, children }: { account: UiWalletAccount; children: ReactNode }) {
  const sendingSigner = useWalletAccountTransactionSendingSigner(account, CHAIN);
  const messageSigner = useWalletAccountMessageSigner(account);
  const signers = useMemo(() => ({ sendingSigner, messageSigner }), [sendingSigner, messageSigner]);
  return (
    <Provide account={account} signers={signers}>
      {children}
    </Provide>
  );
}

const SESSION_MS = 23 * 60 * 60 * 1000;

function Provide({ account, signers, children }: { account: UiWalletAccount | undefined; signers: Signers | null; children: ReactNode }) {
  const cache = useRef<{ addr: string; ts: number; headers: Record<string, string> } | null>(null);
  const address = account?.address ?? null;

  const getAuthHeaders = useCallback(async () => {
    if (!signers || !address) throw new Error("Connect your wallet first");
    const c = cache.current ?? loadSession(address);
    if (c && c.addr === address && Date.now() - c.ts < SESSION_MS) {
      cache.current = c;
      return c.headers;
    }
    const ts = Date.now();
    const text = `Blink Escrow session\nwallet:${address}\nts:${ts}`;
    const [signed] = await signers.messageSigner.modifyAndSignMessages([createSignableMessage(text)]);
    const sig = signed?.signatures[address as keyof typeof signed.signatures];
    if (!sig) throw new Error("Wallet did not return a signature");
    const headers = {
      "x-wallet": address,
      "x-message": btoa(text),
      "x-signature": getBase58Decoder().decode(sig),
    };
    cache.current = { addr: address, ts, headers };
    try {
      sessionStorage.setItem("blink-escrow:auth", JSON.stringify(cache.current));
    } catch {
      /* ignore */
    }
    return headers;
  }, [signers, address]);

  const value = useMemo<WalletCtx>(
    () => ({
      account,
      address,
      isAdmin: !!address && !!ADMIN_ADDRESS && address === ADMIN_ADDRESS,
      signers,
      getAuthHeaders,
    }),
    [account, address, signers, getAuthHeaders],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function loadSession(addr: string) {
  try {
    const raw = sessionStorage.getItem("blink-escrow:auth");
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v.addr === addr ? v : null;
  } catch {
    return null;
  }
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be inside WalletProvider");
  return v;
}
