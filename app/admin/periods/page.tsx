import Link from "next/link";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/admin";
import { adminAction, requireAdmin } from "@/lib/adminAction";
import { getPool } from "@/lib/db";
import { isLeaderboardEnabled } from "@/lib/settings";
import { getWagerProvider } from "@/lib/providers";
import { createPeriod, activatePeriod, closePeriodAdmin, deletePeriod, parseWagerCsv, importManualWagers } from "@/lib/periodAdmin";
import { parseForm, parseDistribution, zId, zText, EventError } from "@/lib/events/common";
import { explainError } from "@/lib/events/messages";
import { logAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Flash, Field, AdminHeader, Hidden, inputCls, btnGold, btnVolt, btnGhost, btnDanger, type SearchParams } from "@/components/admin/ui";
import { SubmitButton, DistributionPreview } from "@/components/admin/client";
import { ManualImport, type ImportState } from "@/components/admin/ManualImport";

export const dynamic = "force-dynamic";
const PATH = "/admin/periods";
const REVALIDATE = ["/leaderboard", "/"];

const PeriodForm = z.object({
  title: zText(120).transform((v) => v || "Monthly"),
  kind: z.enum(["monthly", "weekly", "custom"]),
  start_at: z.string().trim(),
  end_at: z.string().trim(),
  prize_pool: z.string().trim().transform((v) => v || "0"),
  distribution: z.string().max(1000),
});
const IdForm = z.object({ id: zId });

async function createAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "period.create", revalidate: REVALIDATE }, async () => {
    const f = parseForm(PeriodForm, formData);
    const id = await createPeriod({ ...f, distribution: parseDistribution(f.distribution) });
    return { id, start: f.start_at, end: f.end_at, pool: f.prize_pool };
  });
}

async function activateAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "period.activate", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await activatePeriod(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

async function closeAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "period.close", target: String(formData.get("id")), revalidate: [...REVALIDATE, "/hall-of-fame"] }, async () => {
    await closePeriodAdmin(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

async function deleteAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "period.delete", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await deletePeriod(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

const ImportForm = z.object({ period_id: zId, csv: z.string().max(1_000_000) });

async function previewImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  "use server";
  if (!(await isAdminSession())) return { phase: "error", message: "Session expired — log in again." };
  const f = ImportForm.safeParse({ period_id: formData.get("period_id"), csv: formData.get("csv") });
  if (!f.success) return { phase: "error", message: "Choose a period and provide a CSV under 1 MB." };
  const parsed = parseWagerCsv(f.data.csv);
  return { phase: "preview", rows: parsed.rows.length, total: parsed.total, errors: parsed.errors, sample: parsed.rows.slice(0, 5).map(({ casino_id, username, wagered }) => ({ casino_id, username, wagered })) };
}

async function commitImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  "use server";
  if (!(await isAdminSession())) return { phase: "error", message: "Session expired — log in again." };
  const f = ImportForm.safeParse({ period_id: formData.get("period_id"), csv: formData.get("csv") });
  if (!f.success) return { phase: "error", message: "Invalid import request." };
  try {
    const { rows } = await importManualWagers(f.data.period_id, f.data.csv);
    await logAudit("admin", "period.manual_import", String(f.data.period_id), { rows });
    revalidatePath(PATH);
    return { phase: "done", message: `Imported ${rows} rows. They appear on the board after the next sync.` };
  } catch (err) {
    if (err instanceof EventError) return { phase: "error", message: `${explainError(err.code)} ${err.detail ?? ""}` };
    console.error("manual import failed", err instanceof Error ? err.message : "unknown");
    return { phase: "error", message: explainError("unexpected") };
  }
}

interface Row extends RowDataPacket {
  id: number; title: string; kind: string; start_at: string; end_at: string; prize_pool: string; status: string; entrants: number; manual_rows: number; last_import: string | null;
}

export default async function AdminPeriods({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const [[rows], lbEnabled] = await Promise.all([
    getPool().query<Row[]>(
      `SELECT p.id, p.title, p.kind, p.start_at, p.end_at, p.prize_pool, p.status,
              (SELECT COUNT(*) FROM live_entries le WHERE le.period_id=p.id) +
              (SELECT COUNT(*) FROM final_results fr WHERE fr.period_id=p.id) AS entrants,
              (SELECT COUNT(*) FROM manual_period_wagers m WHERE m.period_id=p.id) AS manual_rows,
              (SELECT MAX(created_at) FROM manual_imports mi WHERE mi.period_id=p.id) AS last_import
       FROM periods p ORDER BY p.start_at DESC LIMIT 60`
    ),
    isLeaderboardEnabled(),
  ]);
  const provider = getWagerProvider().name;
  const importable = rows.filter((p) => p.status !== "closed").map((p) => ({ id: p.id, label: `#${p.id} ${p.title} (${p.status}) ${p.start_at} → ${p.end_at}` }));

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Compete" title="Periods">
        <Link href="/admin/settings" className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${lbEnabled ? "border-volt/40 text-volt" : "border-line text-text-2"}`}>
          <Icon name={lbEnabled ? "Eye" : "EyeOff"} className="h-4 w-4" /> Leaderboard {lbEnabled ? "visible" : "hidden"} · edit
        </Link>
      </AdminHeader>
      <Flash searchParams={searchParams} />

      {!lbEnabled && (
        <p className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-text-1">The leaderboard is hidden. Create + activate a period, then turn it on in Settings.</p>
      )}
      <p className="text-sm text-text-2">One period is live at a time. Upcoming periods go live automatically on their start date when nothing else is live; a closed period&apos;s results are frozen and never reopened.</p>

      <form action={createAction} className="surface grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
        <p className="label sm:col-span-2 lg:col-span-3">New period</p>
        <Field label="Title"><input name="title" maxLength={120} placeholder="October 2026" className={inputCls} /></Field>
        <Field label="Kind">
          <select name="kind" className={inputCls}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="custom">Custom</option></select>
        </Field>
        <Field label="Prize pool ($)"><input name="prize_pool" inputMode="decimal" placeholder="5000" className={inputCls} /></Field>
        <Field label="Start date"><input name="start_at" type="date" required className={inputCls} /></Field>
        <Field label="End date (inclusive)"><input name="end_at" type="date" required className={inputCls} /></Field>
        <Field label="Split % by rank"><input name="distribution" defaultValue="30,20,12,10,8,6,5,4,3,2" className={inputCls} /></Field>
        <div className="sm:col-span-2 lg:col-span-3"><DistributionPreview /></div>
        <div className="sm:col-span-2 lg:col-span-3"><SubmitButton className={btnGold}><Icon name="Plus" className="h-4 w-4" /> Create period</SubmitButton></div>
      </form>

      {rows.length === 0 ? (
        <p className="surface p-6 text-sm text-text-1">No periods yet. Create one above.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="surface flex flex-wrap items-center gap-4 p-4">
              <span className="font-mono text-xs text-text-2">#{p.id}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-text-0">{p.title}</p>
                  <Badge tone={p.status === "live" ? "volt" : p.status === "closed" ? "neutral" : "gold"}>{p.status}</Badge>
                </div>
                <p className="font-mono text-xs text-text-2">
                  {p.start_at} → {p.end_at} · {p.entrants} entrants{provider === "manual" && ` · ${p.manual_rows} manual rows${p.last_import ? ` (imported ${String(p.last_import).slice(0, 16)} UTC)` : ""}`}
                </p>
              </div>
              <span className="font-mono text-sm text-gold">{formatMoney(p.prize_pool)}</span>
              <div className="flex items-center gap-2">
                {p.status === "upcoming" && (
                  <form action={activateAction}><Hidden fields={{ id: p.id }} /><SubmitButton className={btnVolt}><Icon name="Play" className="h-4 w-4" /> Activate</SubmitButton></form>
                )}
                {p.status === "live" && (
                  <form action={closeAction}><Hidden fields={{ id: p.id }} /><SubmitButton className={btnGhost} confirm="Freeze final results now? This cannot be undone."><Icon name="Lock" className="h-4 w-4" /> Close</SubmitButton></form>
                )}
                {p.status !== "closed" && (
                  <form action={deleteAction}><Hidden fields={{ id: p.id }} />
                    <SubmitButton className={btnDanger} confirm={`Delete “${p.title || `period #${p.id}`}” for good?${p.status === "live" ? " It's LIVE: the leaderboard goes empty and its wagers are deleted." : ""} This can't be undone.`}>
                      <Icon name="Trash2" className="h-4 w-4" />
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="surface space-y-3 p-6">
        <div>
          <p className="label">Manual import</p>
          <p className="mt-1 text-sm text-text-2">
            {provider === "manual"
              ? "The site uses the manual provider: each import replaces the chosen period's wagers. Columns: casino_id, username, wagered (cumulative for that period, plain decimals)."
              : `The active provider is “${provider}”; manual imports are stored but only used when CASINO_PROVIDER=manual.`}
          </p>
        </div>
        {importable.length === 0 ? <p className="text-sm text-text-1">Create an upcoming or live period first.</p> : <ManualImport periods={importable} preview={previewImport} commit={commitImport} />}
      </section>
    </div>
  );
}
