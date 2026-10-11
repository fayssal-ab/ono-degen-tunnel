import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { explainError } from "@/lib/events/messages";

// Shared building blocks for the admin event pages (server components).

export const inputCls =
  "h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none disabled:opacity-50";
export const btnGold =
  "press inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-bg-0 hover:bg-gold-hi";
export const btnVolt =
  "press inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-volt px-3 text-sm font-semibold text-bg-0 hover:brightness-110";
export const btnGhost =
  "press inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm text-text-1 hover:border-gold hover:text-gold";
export const btnDanger =
  "press inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm text-text-2 hover:border-danger hover:text-danger";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const OK_LABELS: Record<string, string> = {};

/** Result banner for the redirect-after-action pattern (?ok= / ?error=&detail=). */
export async function Flash({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const error = first(sp.error);
  const detail = first(sp.detail);
  const ok = first(sp.ok);
  if (error) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
        <Icon name="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div>
          <p className="text-text-0">{explainError(error)}</p>
          {detail && <p className="mt-1 font-mono text-xs text-text-1">{detail}</p>}
        </div>
      </div>
    );
  }
  if (ok) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-xl border border-volt/40 bg-volt/10 p-3 text-sm text-text-0">
        <Icon name="CircleCheck" className="h-4 w-4 text-volt" />
        Saved · <span className="font-mono text-xs text-text-1">{OK_LABELS[ok] ?? ok}</span>
      </div>
    );
  }
  return null;
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-text-2">{hint}</span>}
    </label>
  );
}

export function AdminHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="label">{kicker}</p>
        <h1 className="mt-1 text-2xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Hidden({ fields }: { fields: Record<string, string | number> }) {
  return (
    <>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

export function Help({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-line bg-bg-1 p-4 text-sm text-text-1">{children}</div>;
}

/** "2026-10-11 10:00:00" → "2026-10-11 10:00 UTC" */
export function Utc({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-text-2">—</span>;
  return <span className="font-mono">{String(value).slice(0, 16)} UTC</span>;
}
