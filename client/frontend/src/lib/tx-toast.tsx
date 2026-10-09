import { toast, type Id } from "react-toastify";
import { explorerTx } from "./config";
import { friendlyError } from "./solana/rpc";

/** Wraps a transaction lifecycle in pending → success (with explorer link) / error toasts. */
export async function withTxToast<T extends string>(label: string, fn: () => Promise<T>): Promise<T> {
  const id: Id = toast.loading(`${label}: waiting for wallet…`);
  try {
    const sig = await fn();
    toast.update(id, {
      render: (
        <div>
          <div className="font-semibold">{label} confirmed</div>
          <a href={explorerTx(sig)} target="_blank" rel="noreferrer" className="text-xs underline">
            View on Solana Explorer
          </a>
        </div>
      ),
      type: "success",
      isLoading: false,
      autoClose: 7000,
      closeButton: true,
    });
    return sig;
  } catch (e) {
    toast.update(id, { render: `${label} failed: ${friendlyError(e)}`, type: "error", isLoading: false, autoClose: 8000, closeButton: true });
    throw e;
  }
}

export function errorToast(e: unknown) {
  toast.error(friendlyError(e));
}
