import Link from "next/link";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { adminAction, requireAdmin } from "@/lib/adminAction";
import {
  getAllRaces, getRaceEntries, countRaceEntries, createRace, updateRace, deleteRace, forceFinalizeRace,
  periodWindow, BASELINE_TOLERANCE_MIN, FINAL_TOLERANCE_MIN, type Race, type RaceInput,
} from "@/lib/races";
import { getWagerProvider } from "@/lib/providers";
import { parseForm, parseDistribution, distributionTotal, zId, zMoney, zRequiredText, zUtcDateTime, toInputValue } from "@/lib/events/common";
import { formatMoney, prizeForPercentage } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Flash, Field, AdminHeader, Hidden, Help, Utc, inputCls, btnGold, btnGhost, btnDanger, type SearchParams } from "@/components/admin/ui";
import { SubmitButton, DistributionPreview } from "@/components/admin/client";

export const dynamic = "force-dynamic";
const PATH = "/admin/races";

const RaceForm = z.object({
  name: zRequiredText(120),
  kind: z.enum(["24h", "7d"]),
  period_id: zId,
  start_at: zUtcDateTime,
  end_at: zUtcDateTime,
  prize_pool: zMoney,
  distribution: z.string().max(1000),
});

function readRace(formData: FormData): RaceInput {
  const f = parseForm(RaceForm, formData);
  return { ...f, distribution: parseDistribution(f.distribution) };
}

async function createAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "race.create", revalidate: ["/races"] }, async () => {
    const input = readRace(formData);
    return { id: await createRace(input), name: input.name };
  });
}

async function updateAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "race.update", target: String(formData.get("id")), revalidate: ["/races"] }, async () => {
    await updateRace(parseForm(z.object({ id: zId }), { id: formData.get("id") }).id, readRace(formData));
  });
}

async function deleteAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "race.delete", target: String(formData.get("id")), revalidate: ["/races"] }, async () => {
    await deleteRace(parseForm(z.object({ id: zId }), { id: formData.get("id") }).id);
  });
}

async function finalizeAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "race.force_finalize", target: String(formData.get("id")), revalidate: ["/races", "/hall-of-fame"] }, async () => {
    await forceFinalizeRace(parseForm(z.object({ id: zId }), { id: formData.get("id") }).id);
  });
}

const TONE: Record<Race["status"], "volt" | "gold" | "neutral" | "plasma"> = { live: "volt", upcoming: "gold", finalizing: "plasma", closed: "neutral" };

interface PeriodOpt extends RowDataPacket { id: number; title: string; start_at: string; end_at: string; status: string }

function RaceFields({ race, periods }: { race?: Race; periods: PeriodOpt[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Name"><input name="name" required maxLength={120} defaultValue={race?.name} placeholder="Weekend sprint" className={inputCls} /></Field>
      <Field label="Kind">
        <select name="kind" defaultValue={race?.kind ?? "24h"} className={inputCls}>
          <option value="24h">24h</option>
          <option value="7d">7 days</option>
        </select>
      </Field>
      <Field label="Source period" hint="Wager data comes from this period's syncs.">
        <select name="period_id" required defaultValue={race?.period_id ?? periods[0]?.id} className={inputCls}>
          {periods.map((p) => {
            const w = periodWindow(p);
            return <option key={p.id} value={p.id}>#{p.id} {p.title} ({p.status}) · {w.start.slice(0, 10)} → {w.end.slice(0, 16)}</option>;
          })}
        </select>
      </Field>
      <Field label="Start (UTC)"><input type="datetime-local" name="start_at" required defaultValue={toInputValue(race?.start_at)} className={inputCls} /></Field>
      <Field label="End (UTC)"><input type="datetime-local" name="end_at" required defaultValue={toInputValue(race?.end_at)} className={inputCls} /></Field>
      <Field label="Prize pool ($)"><input name="prize_pool" required inputMode="decimal" defaultValue={race?.prize_pool ?? ""} placeholder="500" className={inputCls} /></Field>
      <Field label="Split % by rank" hint="Comma separated, total ≤ 100%. Unallocated % and unreached ranks are not paid." className="sm:col-span-2 lg:col-span-3">
        <input name="distribution" required defaultValue={race ? race.prize_distribution.map((d) => d.percentage).join(",") : "50,30,20"} className={inputCls} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-3"><DistributionPreview /></div>
    </div>
  );
}

export default async function AdminRaces({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const [races, [periods]] = await Promise.all([
    getAllRaces(),
    getPool().query<PeriodOpt[]>("SELECT id, title, start_at, end_at, status FROM periods WHERE status IN ('upcoming','live') ORDER BY start_at DESC"),
  ]);
  const provider = getWagerProvider();
  const details = await Promise.all(races.map(async (r) => ({
    race: r,
    entries: r.status === "upcoming" ? [] : await getRaceEntries(r.id, 10),
    count: r.status === "upcoming" ? 0 : await countRaceEntries(r.id),
  })));

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Compete" title="Races">
        <Link href="/races" className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Public page</Link>
      </AdminHeader>
      <Flash searchParams={searchParams} />

      <Help>
        <p><strong className="text-text-0">Score</strong> = growth of each player&apos;s cumulative period wager between the baseline sample (last sync at most {BASELINE_TOLERANCE_MIN} min before start, else the first sync after start) and the latest sync before the end. Syncs run every ~10 min, so boundaries are accurate to one sync. Ties are ordered by casino id.</p>
        <p className="mt-2">Provider <span className="font-mono text-text-0">{provider.name}</span> {provider.listsAllWagerers
          ? "guarantees complete listings: players absent from the baseline start at 0."
          : "does not guarantee complete listings: players absent from the baseline are held as “baseline unknown” and not ranked (never credited with their earlier wagers)."}</p>
        <p className="mt-2">After the end a race waits (<em>finalizing</em>) for a sync newer than the end, then freezes. If the last in-window sync is more than {FINAL_TOLERANCE_MIN} min before the end you must confirm finalisation on that stale data.</p>
      </Help>

      {periods.length === 0 ? (
        <p className="surface p-6 text-sm text-text-1">Create an upcoming or live <Link href="/admin/periods" className="text-gold hover:underline">period</Link> first — races read its wager syncs.</p>
      ) : (
        <form action={createAction} className="surface space-y-4 p-6">
          <p className="label">New race</p>
          <RaceFields periods={periods} />
          <SubmitButton className={btnGold}><Icon name="Plus" className="h-4 w-4" /> Create race</SubmitButton>
        </form>
      )}

      {details.length === 0 ? (
        <p className="surface p-6 text-sm text-text-1">No races yet.</p>
      ) : (
        <div className="space-y-3">
          {details.map(({ race, entries, count }) => (
            <div key={race.id} className="surface p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="font-mono text-xs text-text-2">#{race.id}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-text-0">{race.name}</p>
                    <Badge tone={TONE[race.status]}>{race.status}</Badge>
                    <Badge>{race.kind}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-2"><Utc value={race.start_at} /> → <Utc value={race.end_at} /> · period #{race.period_id ?? "—"}</p>
                </div>
                <span className="font-mono text-sm text-gold">{formatMoney(race.prize_pool)}</span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-text-1 sm:grid-cols-2 lg:grid-cols-4">
                <p>Split {distributionTotal(race.prize_distribution)}% over {race.prize_distribution.length} ranks</p>
                <p>Baseline <Utc value={race.baseline_at} /></p>
                <p>Last sample <Utc value={race.last_sample_at} /></p>
                <p>Computed <Utc value={race.last_computed_at} /></p>
                {race.pending_baseline > 0 && <p className="text-gold sm:col-span-2">{race.pending_baseline} player(s) with unknown baseline not ranked</p>}
                {race.finalize_note && <p className="text-plasma sm:col-span-2">{race.finalize_note.replaceAll("_", " ")}</p>}
              </div>

              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-text-2 hover:text-text-0">Payouts</summary>
                <ol className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-4">
                  {race.prize_distribution.map((d) => (
                    <li key={d.rank}>#{d.rank} · {d.percentage}% · {formatMoney(prizeForPercentage(race.prize_pool, d.percentage))}</li>
                  ))}
                </ol>
              </details>

              {entries.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-text-2 hover:text-text-0">Standings ({count})</summary>
                  <ol className="mt-2 space-y-1 font-mono text-xs">
                    {entries.map((e) => (
                      <li key={e.casino_id} className="flex gap-3"><span className="w-8 text-text-2">#{e.rank}</span><span className="flex-1 truncate">{e.username}</span><span>{formatMoney(e.wagered)}</span><span className="w-20 text-right text-gold">{formatMoney(e.prize)}</span></li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {race.status === "upcoming" && (
                  <>
                    <details className="w-full">
                      <summary className={`${btnGhost} cursor-pointer list-none`}><Icon name="Pencil" className="h-4 w-4" /> Edit</summary>
                      <form action={updateAction} className="mt-3 space-y-3">
                        <Hidden fields={{ id: race.id }} />
                        <RaceFields race={race} periods={periods} />
                        <SubmitButton className={btnGold}>Save changes</SubmitButton>
                      </form>
                    </details>
                    <form action={deleteAction}>
                      <Hidden fields={{ id: race.id }} />
                      <SubmitButton className={btnDanger} confirm="Delete this race?"><Icon name="Trash2" className="h-4 w-4" /> Delete</SubmitButton>
                    </form>
                  </>
                )}
                {race.status === "finalizing" && (
                  <form action={finalizeAction}>
                    <Hidden fields={{ id: race.id }} />
                    <SubmitButton className={btnGold} confirm={`Freeze results using the last sample (${race.last_sample_at ?? "none"})? This cannot be undone.`}>
                      <Icon name="Lock" className="h-4 w-4" /> Finalise on available data
                    </SubmitButton>
                  </form>
                )}
                {race.status !== "upcoming" && (
                  <Link href={`/races/${race.id}`} className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Public standings</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
