import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

// Shared pieces for the public event pages.

/** Run a data load; a DB/config failure becomes `null` so the page can show
 *  a "temporarily unavailable" state instead of pretending nothing exists. */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    console.error("event page load failed", err instanceof Error ? err.message : "unknown");
    return { ok: false };
  }
}

export function Unavailable({ what }: { what: string }) {
  return (
    <div role="alert" className="surface flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-bg-3 text-danger">
        <Icon name="CloudOff" className="h-7 w-7" />
      </span>
      <h3 className="mt-5 text-2xl text-text-0">{what} temporarily unavailable</h3>
      <p className="mt-2 max-w-md text-sm text-text-1">
        We couldn&apos;t load the data right now. This isn&apos;t an empty board — refresh in a minute.
      </p>
    </div>
  );
}

/** DB "YYYY-MM-DD HH:MM:SS" (UTC) → ISO. */
export function iso(value: string): string {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).toISOString();
}

export function UtcTime({ value }: { value: string | null }) {
  if (!value) return <span>—</span>;
  return <time dateTime={iso(value)} className="font-mono">{value.slice(0, 16)} UTC</time>;
}

export function Pager({ base, page, pages, param = "page" }: { base: string; page: number; pages: number; param?: string }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${base}${base.includes("?") ? "&" : "?"}${param}=${p}`;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="rounded-lg border border-line px-3 py-1.5 hover:border-gold hover:text-gold">← Prev</Link> : <span className="px-3 py-1.5 text-text-2">← Prev</span>}
      <span className="font-mono text-text-2">{page} / {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className="rounded-lg border border-line px-3 py-1.5 hover:border-gold hover:text-gold">Next →</Link> : <span className="px-3 py-1.5 text-text-2">Next →</span>}
    </nav>
  );
}

export function pageParam(v: string | string[] | undefined, max = 10_000): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : 1;
}
