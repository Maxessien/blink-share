import { Loader2, X, ExternalLink } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { explorerTx, short } from "@/lib/config";

type Variant = "primary" | "accent" | "ghost" | "outline" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:brightness-110 hover:shadow-glow",
  accent: "bg-accent text-accent-foreground hover:brightness-110 hover:shadow-glow-accent",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-secondary",
  outline: "border border-border text-foreground hover:border-primary/60 hover:bg-secondary",
  danger: "bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25",
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-border bg-card/80 p-6 backdrop-blur", className)}>{children}</div>;
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
      {hint && <span className="normal-case tracking-normal">{hint}</span>}
    </span>
  );
}

const field =
  "w-full rounded-lg border border-input bg-background/60 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(field, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(field, "min-h-28 resize-y", props.className)} />;
}

type Tone = "primary" | "accent" | "muted" | "warning" | "danger";
const tones: Record<Tone, string> = {
  primary: "bg-primary/12 text-primary border-primary/30",
  accent: "bg-accent/12 text-accent border-accent/30",
  muted: "bg-secondary text-muted-foreground border-border",
  warning: "bg-warning/12 text-warning border-warning/30",
  danger: "bg-destructive/12 text-destructive border-destructive/30",
};
export function Chip({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function statusTone(s: string): Tone {
  if (s === "open" || s === "proposed_by_worker") return "accent";
  if (s === "in_progress" || s === "funded_active" || s === "submitted") return "primary";
  if (s === "completed" || s === "released") return "muted";
  if (s === "disputed") return "danger";
  return "muted";
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-2xl border border-border bg-popover p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TxLink({ sig }: { sig: string }) {
  return (
    <a href={explorerTx(sig)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
      {short(sig, 6)} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div className="mb-4 text-muted-foreground">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}
