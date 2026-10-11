import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { adminAction, requireAdmin } from "@/lib/adminAction";
import {
  getAllRounds, countRoundGuesses, createRound, updateRound, deleteRound, openRound, closeRound,
  previewSettlement, settleRound, getCollectionStatus, type GbRound, type SettlementPreview,
} from "@/lib/guessBalance";
import { parseForm, zId, zText, zRequiredText, zOptionalUtcDateTime, toInputValue, DECIMAL_20_8, EventError } from "@/lib/events/common";
import { explainError } from "@/lib/events/messages";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Flash, Field, AdminHeader, Hidden, Help, Utc, first, inputCls, btnGold, btnGhost, btnDanger, btnVolt, type SearchParams } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";

export const dynamic = "force-dynamic";
const PATH = "/admin/guess-the-balance";
const REVALIDATE = ["/guess-the-balance", "/hall-of-fame"];

const RoundForm = z.object({
  title: zRequiredText(120),
  prize: zText(120),
  hunt_id: z.union([z.literal("").transform(() => null), zId]),
  deadline_at: zOptionalUtcDateTime,
});
const IdForm = z.object({ id: zId });
const optionalActual = z.union([z.literal("").transform(() => null), z.string().trim().regex(DECIMAL_20_8, "invalid_amount")]);

async function createAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "gb.create", revalidate: REVALIDATE }, async () => ({ id: await createRound(parseForm(RoundForm, formData)) }));
}

async function updateAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "gb.update", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await updateRound(parseForm(IdForm, { id: formData.get("id") }).id, parseForm(RoundForm, formData));
  });
}

async function deleteAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "gb.delete", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await deleteRound(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

async function openAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "gb.open", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await openRound(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

async function closeAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "gb.close", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await closeRound(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

/** Preview is read-only: redirect back with the inputs so the page renders the result. */
async function previewAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  const actual = String(formData.get("actual") ?? "").trim().slice(0, 40);
  redirect(`${PATH}?preview=${Number.isInteger(id) ? id : 0}&actual=${encodeURIComponent(actual)}#round-${id}`);
}

async function settleAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "gb.settle", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(z.object({ id: zId, actual: optionalActual }), { id: formData.get("id"), actual: formData.get("actual") ?? "" });
    return await settleRound(f.id, f.actual);
  });
}

const TONE: Record<GbRound["status"], "volt" | "gold" | "neutral" | "plasma"> = { open: "volt", closed: "plasma", draft: "gold", settled: "neutral" };

interface HuntOpt extends RowDataPacket { id: number; title: string; opening_started_at: string | null }

function RoundFields({ round, hunts }: { round?: GbRound; hunts: HuntOpt[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Title"><input name="title" required maxLength={120} defaultValue={round?.title} placeholder="Sunday hunt GTB" className={inputCls} /></Field>
      <Field label="Prize"><input name="prize" maxLength={120} defaultValue={round?.prize} placeholder="$100" className={inputCls} /></Field>
      <Field label="Linked hunt (optional)" hint="Guesses close automatically when its first bonus is opened; the result is its final balance.">
        <select name="hunt_id" defaultValue={round?.hunt_id ?? ""} className={inputCls}>
          <option value="">No hunt — enter the result manually</option>
          {hunts.map((h) => <option key={h.id} value={h.id} disabled={!!h.opening_started_at}>#{h.id} {h.title}{h.opening_started_at ? " (opening started)" : ""}</option>)}
        </select>
      </Field>
      <Field label="Deadline (UTC, optional)" hint="Guesses sent after it are ignored; shown as a countdown."><input type="datetime-local" name="deadline_at" defaultValue={toInputValue(round?.deadline_at)} className={inputCls} /></Field>
    </div>
  );
}

function PreviewBox({ preview }: { preview: SettlementPreview | { error: string; detail?: string } }) {
  if ("error" in preview) return <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">{explainError(preview.error)} {preview.detail && <span className="font-mono text-xs">{preview.detail}</span>}</p>;
  return (
    <div className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-sm">
      <p>Final balance <span className="font-mono text-text-0">{formatMoney(preview.actual)}</span> ({preview.source === "hunt" ? "from the linked hunt" : "entered"}) · {preview.total} guesses</p>
      {preview.winner ? (
        <p className="mt-1">Winner: <span className="font-mono text-gold">{preview.winner.username}</span> guessed {formatMoney(preview.winner.amount)} — off by <span className="font-mono">{preview.winner.offBy}</span> (last guess {preview.winner.guessedAt.slice(0, 19)} UTC)</p>
      ) : <p className="mt-1 text-text-1">No guesses — the round will settle without a winner.</p>}
    </div>
  );
}

export default async function AdminGuessBalance({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const previewId = Number(first(sp.preview));
  const previewActual = first(sp.actual) ?? "";
  const [rounds, [hunts], status] = await Promise.all([
    getAllRounds(),
    getPool().query<HuntOpt[]>("SELECT id, title, opening_started_at FROM bonus_hunt WHERE status = 'active' ORDER BY id DESC"),
    getCollectionStatus(),
  ]);
  const counts = await Promise.all(rounds.map((r) => countRoundGuesses(r.id)));
  let preview: SettlementPreview | { error: string; detail?: string } | null = null;
  if (Number.isInteger(previewId) && rounds.some((r) => r.id === previewId)) {
    try {
      preview = await previewSettlement(previewId, previewActual ? previewActual : null);
    } catch (err) {
      preview = err instanceof EventError ? { error: err.code, detail: err.detail } : { error: "unexpected" };
    }
  }
  const [recent] = await getPool().query<RowDataPacket[]>(
    "SELECT g.round_id, g.kick_username, g.identity_key, g.amount, g.guessed_at FROM gb_guesses g JOIN gb_rounds r ON r.id = g.round_id WHERE r.status IN ('open','closed') ORDER BY g.guessed_at DESC LIMIT 15"
  );

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Watch" title="Guess the Balance">
        <Link href="/guess-the-balance" className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Public page</Link>
      </AdminHeader>
      <Flash searchParams={searchParams} />

      <div className="surface grid gap-3 p-5 text-sm sm:grid-cols-2">
        <p className="label sm:col-span-2">Chat collection (Kick webhook)</p>
        <p><Icon name={status.kickAppConfigured ? "CircleCheck" : "AlertTriangle"} className={`mr-1 inline h-4 w-4 ${status.kickAppConfigured ? "text-volt" : "text-danger"}`} />Kick app credentials {status.kickAppConfigured ? "set" : "missing (KICK_CLIENT_ID / KICK_CLIENT_SECRET)"}</p>
        <p><Icon name={status.broadcasterConfigured ? "CircleCheck" : "Info"} className={`mr-1 inline h-4 w-4 ${status.broadcasterConfigured ? "text-volt" : "text-gold"}`} />Broadcaster check {status.broadcasterConfigured ? "by user id" : "by channel slug (set KICK_BROADCASTER_USER_ID for the stable id)"}</p>
        <p>Last webhook event: {status.lastWebhookAt ? <RelativeTime iso={status.lastWebhookAt} /> : <span className="text-danger">never received</span>}</p>
        <p>Last guess: {status.lastGuessAt ? <RelativeTime iso={status.lastGuessAt} /> : "—"}</p>
      </div>

      <Help>
        Viewers type <code className="text-gold">!gb 12345.67</code> in Kick chat while a round is open. One guess per Kick account, latest sent counts; guesses sent after the
        deadline or arriving after you close the round are ignored (a round is never reopened). Closest wins; ties go to whoever locked in their final guess first.
        Only one round can be open. Settling is final.
      </Help>

      <form action={createAction} className="surface space-y-3 p-6">
        <p className="label">New round (draft)</p>
        <RoundFields hunts={hunts} />
        <SubmitButton className={btnGold}><Icon name="Plus" className="h-4 w-4" /> Create round</SubmitButton>
      </form>

      {rounds.length === 0 ? <p className="surface p-6 text-sm text-text-1">No rounds yet.</p> : rounds.map((r, i) => (
        <div key={r.id} id={`round-${r.id}`} className="surface space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-text-2">#{r.id}</span>
            <p className="font-medium text-text-0">{r.title}</p>
            <Badge tone={TONE[r.status]}>{r.status}</Badge>
            {r.prize && <Badge tone="gold">{r.prize}</Badge>}
            {r.hunt_id && <Badge>hunt #{r.hunt_id}</Badge>}
            <span className="ml-auto font-mono text-xs text-text-2">{counts[i]} guesses</span>
          </div>
          <p className="text-xs text-text-2">
            {r.deadline_at && <>Deadline <Utc value={r.deadline_at} /> · </>}
            {r.status !== "draft" && <>Opened <Utc value={r.opened_at} /></>}
            {r.closed_at && <> · closed <Utc value={r.closed_at} /></>}
            {r.settled_at && <> · settled <Utc value={r.settled_at} /> at <span className="font-mono text-text-0">{formatMoney(r.actual_balance ?? "0")}</span></>}
          </p>

          {r.status === "draft" && (
            <>
              <details>
                <summary className="cursor-pointer text-sm text-text-2 hover:text-text-0">Edit</summary>
                <form action={updateAction} className="mt-3 space-y-3">
                  <Hidden fields={{ id: r.id }} />
                  <RoundFields round={r} hunts={hunts} />
                  <SubmitButton className={btnGhost}>Save</SubmitButton>
                </form>
              </details>
              <div className="flex flex-wrap gap-2">
                <form action={openAction}><Hidden fields={{ id: r.id }} /><SubmitButton className={btnVolt}><Icon name="Play" className="h-4 w-4" /> Open guesses</SubmitButton></form>
                <form action={deleteAction}><Hidden fields={{ id: r.id }} /><SubmitButton className={btnDanger} confirm="Delete this draft?"><Icon name="Trash2" className="h-4 w-4" /> Delete</SubmitButton></form>
              </div>
            </>
          )}
          {r.status === "open" && (
            <form action={closeAction}><Hidden fields={{ id: r.id }} /><SubmitButton className={btnGold} confirm="Close guesses now? Late messages will be ignored."><Icon name="Lock" className="h-4 w-4" /> Close guesses</SubmitButton></form>
          )}
          {r.status === "closed" && (
            <div className="space-y-3">
              <form action={previewAction} className="flex flex-wrap items-end gap-2">
                <Hidden fields={{ id: r.id }} />
                {r.hunt_id == null && (
                  <Field label="Final balance ($)"><input name="actual" required inputMode="decimal" defaultValue={previewId === r.id ? previewActual : ""} className={`${inputCls} w-44`} /></Field>
                )}
                <SubmitButton className={btnGhost}><Icon name="Eye" className="h-4 w-4" /> Preview winner</SubmitButton>
              </form>
              {previewId === r.id && preview && (
                <>
                  <PreviewBox preview={preview} />
                  {!("error" in preview) && (
                    <form action={settleAction}>
                      <Hidden fields={{ id: r.id, actual: r.hunt_id == null ? preview.actual : "" }} />
                      <SubmitButton className={btnGold} confirm="Settle the round with this result? This is final."><Icon name="Trophy" className="h-4 w-4" /> Settle round</SubmitButton>
                    </form>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {recent.length > 0 && (
        <section className="surface p-5">
          <p className="label mb-2">Latest guesses (open/closed rounds)</p>
          <ul className="space-y-1 font-mono text-xs">
            {recent.map((g) => (
              <li key={`${g.round_id}-${g.identity_key}`} className="flex gap-3">
                <span className="text-text-2">#{g.round_id}</span>
                <span className="min-w-0 flex-1 truncate">{g.kick_username} <span className="text-text-2">({String(g.identity_key).startsWith("id:") ? "kick id" : "name only"})</span></span>
                <span>{formatMoney(String(g.amount))}</span>
                <span className="text-text-2">{String(g.guessed_at).slice(11, 19)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
