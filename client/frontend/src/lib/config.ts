import { address, type Address } from "@solana/kit";

const env = import.meta.env as Record<string, string | undefined>;

export const PROGRAM_ID: Address = address(
  env["VITE_PROGRAM_ID"] || "35nqDayAETPzRnjLw5bxEiw3ovzSndMp4caQLF1PXFGz",
);

// Replace with your platform admin / arbitrator address via VITE_ADMIN_ADDRESS.
export const ADMIN_ADDRESS: string = env["VITE_ADMIN_ADDRESS"] || "";

// URL of the separately hosted Express + Mongoose backend (see /backend).
export const API_URL: string = (env["VITE_API_URL"] || "").replace(/\/$/, "");

export const RPC_URL = "https://api.devnet.solana.com";
export const WS_URL = "wss://api.devnet.solana.com";
export const CHAIN = "solana:devnet" as const;

export type TokenOption = {
  label: string;
  symbol: string;
  mint: Address;
  decimals: number;
  native: boolean;
};

export const TOKENS: TokenOption[] = [
  {
    label: "Devnet USDC",
    symbol: "USDC",
    mint: address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
    decimals: 6,
    native: false,
  },
  {
    label: "SOL (wrapped)",
    symbol: "SOL",
    mint: address("So11111111111111111111111111111111111111112"),
    decimals: 9,
    native: true,
  },
];

export function tokenForMint(mint: string): TokenOption {
  return (
    TOKENS.find((t) => t.mint === mint) ?? {
      label: "Token",
      symbol: "TKN",
      mint: address(mint),
      decimals: 6,
      native: false,
    }
  );
}

export function explorerTx(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
export function explorerAddr(a: string) {
  return `https://explorer.solana.com/address/${a}?cluster=devnet`;
}

export function toBaseUnits(ui: string, decimals: number): bigint {
  const [w, f = ""] = ui.trim().split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}
export function fromBaseUnits(raw: string | bigint, decimals: number): string {
  const v = BigInt(raw);
  const d = 10n ** BigInt(decimals);
  const whole = v / d;
  const frac = (v % d).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
export function short(a?: string | null, n = 4) {
  if (!a) return "—";
  return `${a.slice(0, n)}…${a.slice(-n)}`;
}
