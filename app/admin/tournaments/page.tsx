import Link from "next/link";
import { z } from "zod";
import { adminAction, requireAdmin } from "@/lib/adminAction";
import {
  getAllTournaments, getBracket, createTournament, updateTournament, setTournamentSlots, deleteTournament,
  launchTournament, recordMatchResult, ROUND_NAMES, type Bracket, type Match, type Tournament,
} from "@/lib/tournaments";
import { parseForm, zId, zText, zRequiredText, zMultiplier, zUrl, zOptionalUtcDateTime, toInputValue } from "@/lib/events/common";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Flash, Field, AdminHeader, Hidden, Help, Utc, inputCls, btnGold, btnGhost, btnDanger, btnVolt, type SearchParams } from "@/components/admin/ui";
import { SubmitButton, SlotNameInput } from "@/components/admin/client";

export const dynamic = "force-dynamic";
const PATH = "/admin/tournaments";
const REVALIDATE = ["/tournaments", "/hall-of-fame"];

const Meta = z.object({ title: zRequiredText(120), prize: zText(120), starts_at: zOptionalUtcDateTime });
const IdForm = z.object({ id: zId });

async function createAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "tournament.create", revalidate: REVALIDATE }, async () => ({ id: await createTournament(parseForm(Meta, formData)) }));
}

async function updateAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "tournament.update", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await updateTournament(parseForm(IdForm, { id: formData.get("id") }).id, parseForm(Meta, formData));
  });
}

const Slot = z.object({ slot_name: zRequiredText(191), provider: zText(120), image_url: zUrl });

async function slotsAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "tournament.slots", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    const { id } = parseForm(IdForm, { id: formData.get("id") });
    const slots = Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      const s = parseForm(Slot, { slot_name: formData.get(`s${n}_slot_name`), provider: formData.get(`s${n}_provider`) ?? "", image_url: formData.get(`s${n}_image_url`) ?? "" });
      return { seed: n, ...s };
    });
    await setTournamentSlots(id, slots);
  });
}

async function launchAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "tournament.launch", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await launchTournament(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

async function deleteAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "tournament.delete", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await deleteTournament(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

const Score = z.object({ id: zId, round: z.coerce.number().int().min(1).max(3), match_index: z.coerce.number().int().min(0).max(3), score_a: zMultiplier, score_b: zMultiplier });

async function scoreAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "tournament.score", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(Score, formData);
    const result = await recordMatchResult(f.id, f.round, f.match_index, f.score_a, f.score_b);
    return { round: f.round, match: f.match_index, score_a: f.score_a, score_b: f.score_b, ...result };
  });
}

const TONE: Record<Tournament["status"], "volt" | "gold" | "neutral"> = { live: "volt", upcoming: "gold", finished: "neutral" };

function name(b: Bracket, seed: number | null) {
  return seed == null ? "TBD" : `#${seed} ${b.competitors.get(seed)?.name ?? "?"}`;
}

function MatchEditor({ t, b, m }: { t: Tournament; b: Bracket; m: Match }) {
  const ready = m.a.seed != null && m.b.seed != null;
  const editable = t.status === "live" && ready;
  return (
    <form action={scoreAction} className={`rounded-xl border p-3 ${m.winner_seed != null ? "border-gold/40" : "border-line"} bg-bg-1`}>
      <Hidden fields={{ id: t.id, round: m.round, match_index: m.match_index }} />
      <p className="label mb-2">{ROUND_NAMES[m.round]} {m.round < 3 ? m.match_index + 1 : ""}</p>
      {(["a", "b"] as const).map((side) => (
        <div key={side} className="mb-2 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm ${m.winner_seed != null && m.winner_seed === m[side].seed ? "text-gold" : "text-text-1"}`}>{name(b, m[side].seed)}</span>
          <input name={`score_${side}`} inputMode="decimal" required disabled={!editable} defaultValue={m[side].score ?? ""} placeholder="×" aria-label={`${name(b, m[side].seed)} multiplier`}
            className="h-9 w-24 rounded-lg border border-line bg-bg-2 px-2 text-right font-mono text-sm focus:border-gold focus:outline-none disabled:opacity-50" />
        </div>
      ))}
      {editable && (
        <SubmitButton className={btnVolt} confirm={m.winner_seed != null ? "Correct this result? Allowed only if the next round hasn't been played." : undefined}>
          {m.winner_seed != null ? "Correct" : "Save result"}
        </SubmitButton>
      )}
      {!ready && t.status === "live" && <p className="text-xs text-text-2">Waiting for the previous round.</p>}
    </form>
  );
}

export default async function AdminTournaments({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const tournaments = await getAllTournaments();
  const brackets = await Promise.all(tournaments.map(getBracket));

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Compete" title="Tournaments">
        <Link href="/tournaments" className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Public page</Link>
      </AdminHeader>
      <Flash searchParams={searchParams} />
      <Help>
        8 slots, seeds 1–8 (QF: 1v8, 4v5, 2v7, 3v6). Enter each slot&apos;s win multiplier from stream; the higher multiplier advances automatically.
        An exact tie is refused — announce a replay and enter the replay multipliers. A result can only be corrected while the next round is unplayed.
        The final finishes the tournament and freezes it. Only one tournament can be live.
      </Help>

      <form action={createAction} className="surface grid gap-3 p-6 sm:grid-cols-3">
        <p className="label sm:col-span-3">New tournament (draft until launched)</p>
        <Field label="Title"><input name="title" required maxLength={120} placeholder="Friday slot battle" className={inputCls} /></Field>
        <Field label="Prize"><input name="prize" maxLength={120} placeholder="$250" className={inputCls} /></Field>
        <Field label="Announced start (UTC, optional)"><input type="datetime-local" name="starts_at" className={inputCls} /></Field>
        <div className="sm:col-span-3"><SubmitButton className={btnGold}><Icon name="Plus" className="h-4 w-4" /> Create</SubmitButton></div>
      </form>

      {brackets.length === 0 ? <p className="surface p-6 text-sm text-text-1">No tournaments yet.</p> : brackets.map((b) => {
        const t = b.tournament;
        return (
          <div key={t.id} className="surface space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-text-2">#{t.id}</span>
              <p className="font-medium text-text-0">{t.title}</p>
              <Badge tone={TONE[t.status]}>{t.status}</Badge>
              {t.prize && <Badge tone="gold">{t.prize}</Badge>}
              <span className="ml-auto text-xs text-text-2">{t.status === "upcoming" ? <>Starts <Utc value={t.starts_at} /></> : t.status === "live" ? <>Live since <Utc value={t.started_at} /></> : <>Finished <Utc value={t.finished_at} /></>}</span>
            </div>
            {b.championSeed != null && <p className="text-sm text-gold"><Icon name="Crown" className="mr-1 inline h-4 w-4" />Champion: {name(b, b.championSeed)}</p>}

            {t.status === "upcoming" && (
              <>
                <details>
                  <summary className="cursor-pointer text-sm text-text-2 hover:text-text-0">Edit title / prize / start</summary>
                  <form action={updateAction} className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Hidden fields={{ id: t.id }} />
                    <Field label="Title"><input name="title" required maxLength={120} defaultValue={t.title} className={inputCls} /></Field>
                    <Field label="Prize"><input name="prize" maxLength={120} defaultValue={t.prize} className={inputCls} /></Field>
                    <Field label="Start (UTC)"><input type="datetime-local" name="starts_at" defaultValue={toInputValue(t.starts_at)} className={inputCls} /></Field>
                    <div className="sm:col-span-3"><SubmitButton className={btnGhost}>Save</SubmitButton></div>
                  </form>
                </details>
                <form action={slotsAction} className="space-y-2">
                  <Hidden fields={{ id: t.id }} />
                  <p className="label">Seeds ({b.competitors.size}/8)</p>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((seed) => {
                    const c = b.competitors.get(seed);
                    return (
                      <div key={seed} className="grid gap-2 sm:grid-cols-[3rem_2fr_1fr_2fr] sm:items-center">
                        <span className="font-mono text-sm text-text-2">#{seed}</span>
                        <SlotNameInput name={`s${seed}_slot_name`} prefix={`s${seed}_`} defaultValue={c?.name ?? ""} className={inputCls} />
                        <input name={`s${seed}_provider`} defaultValue={c?.provider ?? ""} placeholder="Provider" maxLength={120} className={inputCls} />
                        <input name={`s${seed}_image_url`} defaultValue={c?.image_url ?? ""} placeholder="Image URL (https)" maxLength={512} className={inputCls} />
                      </div>
                    );
                  })}
                  <SubmitButton className={btnGhost}><Icon name="Save" className="h-4 w-4" /> Save seeds</SubmitButton>
                </form>
                <div className="flex flex-wrap gap-2">
                  <form action={launchAction}>
                    <Hidden fields={{ id: t.id }} />
                    <SubmitButton className={btnGold} confirm="Launch? The seeds lock and the bracket goes live."><Icon name="Play" className="h-4 w-4" /> Launch</SubmitButton>
                  </form>
                  <form action={deleteAction}>
                    <Hidden fields={{ id: t.id }} />
                    <SubmitButton className={btnDanger} confirm="Delete this draft?"><Icon name="Trash2" className="h-4 w-4" /> Delete</SubmitButton>
                  </form>
                </div>
              </>
            )}

            {t.status !== "upcoming" && (
              <div className="grid gap-3 md:grid-cols-3">
                {[1, 2, 3].map((round) => (
                  <div key={round} className="space-y-3">
                    {(b.rounds[round] ?? []).map((m) => <MatchEditor key={`${round}-${m.match_index}`} t={t} b={b} m={m} />)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
