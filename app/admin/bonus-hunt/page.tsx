import Link from "next/link";
import { z } from "zod";
import { adminAction, requireAdmin } from "@/lib/adminAction";
import {
  getAllHunts, getHuntEntries, computeHuntStats, createHunt, updateHunt, addHuntEntry, updateHuntEntry,
  removeHuntEntry, moveHuntEntry, addHuntEntryFromCatalog, setHuntPayout, finishHunt, archiveHunt, deleteHunt, type Hunt, type HuntEntry,
} from "@/lib/bonusHunt";
import { parseForm, zId, zText, zRequiredText, zMoney, zPositiveMoney, zUrl, EventError } from "@/lib/events/common";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { SlotThumb } from "@/components/ui/SlotThumb";
import { Flash, Field, AdminHeader, Hidden, Help, Utc, inputCls, btnGold, btnGhost, btnDanger, btnVolt, type SearchParams } from "@/components/admin/ui";
import { SubmitButton, SlotNameInput } from "@/components/admin/client";
import { SlotPicker } from "@/components/admin/SlotPicker";
import { findSlotByName } from "@/lib/slotCatalog";

export const dynamic = "force-dynamic";
const PATH = "/admin/bonus-hunt";
const REVALIDATE = ["/bonus-hunt", "/guess-the-balance", "/hall-of-fame"];

const HuntForm = z.object({ title: zRequiredText(120), start_balance: zMoney });
const EntryForm = z.object({ slot_name: zRequiredText(191), provider: zText(120), bet: zPositiveMoney, image_url: zUrl });
const Ids = z.object({ hunt_id: zId, entry_id: zId });
const HuntId = z.object({ hunt_id: zId });

async function createAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.create", revalidate: REVALIDATE }, async () => {
    const f = parseForm(HuntForm.extend({ image_url: zUrl }), formData);
    return { id: await createHunt(f) };
  });
}

async function updateAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.update", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    await updateHunt(parseForm(HuntId, { hunt_id: formData.get("hunt_id") }).hunt_id, parseForm(HuntForm, formData));
  });
}

const PickForm = z.object({ hunt_id: zId, slot_id: zText(191), custom_name: zText(191), bet: zPositiveMoney });

async function addEntryAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.entry_add", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(PickForm, formData);
    if (f.slot_id) return await addHuntEntryFromCatalog(f.hunt_id, f.slot_id, f.bet);
    if (!f.custom_name) throw new EventError("invalid_input", "pick a slot from the list");
    // typed name: enriched with catalogue art/provider when it matches (incl. Stake-only slots)
    const slot = await findSlotByName(f.custom_name);
    await addHuntEntry(f.hunt_id, { slot_name: slot?.name ?? f.custom_name, provider: slot?.provider ?? "", bet: f.bet, image_url: slot?.imageUrl ?? "" });
    return { name: slot?.name ?? f.custom_name, custom: !slot?.matched };
  });
}

async function updateEntryAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.entry_update", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    const ids = parseForm(Ids, { hunt_id: formData.get("hunt_id"), entry_id: formData.get("entry_id") });
    await updateHuntEntry(ids.hunt_id, ids.entry_id, parseForm(EntryForm, formData));
  });
}

async function removeEntryAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.entry_remove", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    const ids = parseForm(Ids, { hunt_id: formData.get("hunt_id"), entry_id: formData.get("entry_id") });
    await removeHuntEntry(ids.hunt_id, ids.entry_id);
  });
}

async function moveAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.entry_move", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(Ids.extend({ direction: z.enum(["up", "down"]) }), { hunt_id: formData.get("hunt_id"), entry_id: formData.get("entry_id"), direction: formData.get("direction") });
    await moveHuntEntry(f.hunt_id, f.entry_id, f.direction);
  });
}

async function payoutAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.payout", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(Ids.extend({ payout: zMoney }), { hunt_id: formData.get("hunt_id"), entry_id: formData.get("entry_id"), payout: formData.get("payout") });
    return { entry: f.entry_id, payout: f.payout, ...(await setHuntPayout(f.hunt_id, f.entry_id, f.payout)) };
  });
}

async function finishAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.finish", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    await finishHunt(parseForm(HuntId, { hunt_id: formData.get("hunt_id") }).hunt_id);
  });
}

async function archiveAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.archive", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    await archiveHunt(parseForm(HuntId, { hunt_id: formData.get("hunt_id") }).hunt_id);
  });
}

async function deleteAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "hunt.delete", target: String(formData.get("hunt_id")), revalidate: REVALIDATE }, async () => {
    await deleteHunt(parseForm(HuntId, { hunt_id: formData.get("hunt_id") }).hunt_id);
  });
}

const TONE: Record<Hunt["status"], "volt" | "gold" | "neutral"> = { active: "volt", finished: "gold", archived: "neutral" };

function EntryRow({ hunt, e, i, last }: { hunt: Hunt; e: HuntEntry; i: number; last: boolean }) {
  const editable = hunt.status === "active" && !hunt.opening_started_at;
  const ids = { hunt_id: hunt.id, entry_id: e.id };
  return (
    <li className="rounded-xl border border-line bg-bg-1 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-6 font-mono text-xs text-text-2">{i + 1}</span>
        <SlotThumb name={e.slot_name} src={e.image_url} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text-0">{e.slot_name}</p>
          <p className="truncate text-xs text-text-2">{e.provider || "—"} · bet {formatMoney(e.bet)}</p>
        </div>
        {hunt.status === "active" && (
          <form action={payoutAction} className="flex items-center gap-2">
            <Hidden fields={ids} />
            <input name="payout" inputMode="decimal" required defaultValue={e.payout ?? ""} placeholder="payout" aria-label={`Payout for ${e.slot_name}`}
              className="h-9 w-28 rounded-lg border border-line bg-bg-2 px-2 text-right font-mono text-sm focus:border-gold focus:outline-none" />
            <SubmitButton className={btnVolt} confirm={!hunt.opening_started_at ? "First payout: the bonus list locks and any linked Guess the Balance round closes. Continue?" : undefined}>
              {e.payout == null ? "Open" : "Fix"}
            </SubmitButton>
          </form>
        )}
        {hunt.status !== "active" && <span className="font-mono text-sm">{e.payout != null ? formatMoney(e.payout) : "—"}</span>}
        {editable && (
          <div className="flex gap-1">
            {(["up", "down"] as const).map((dir) => (
              <form key={dir} action={moveAction}>
                <Hidden fields={{ ...ids, direction: dir }} />
                <button disabled={dir === "up" ? i === 0 : last} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-text-2 hover:text-text-0 disabled:opacity-30" aria-label={`Move ${dir}`}>
                  <Icon name={dir === "up" ? "ChevronUp" : "ChevronDown"} className="h-4 w-4" />
                </button>
              </form>
            ))}
            <form action={removeEntryAction}>
              <Hidden fields={ids} />
              <SubmitButton className={btnDanger} confirm="Remove this bonus?"><Icon name="Trash2" className="h-4 w-4" /></SubmitButton>
            </form>
          </div>
        )}
      </div>
      {editable && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-text-2 hover:text-text-0">Edit</summary>
          <form action={updateEntryAction} className="mt-2 grid gap-2 sm:grid-cols-4">
            <Hidden fields={ids} />
            <SlotNameInput defaultValue={e.slot_name} className={inputCls} />
            <input name="provider" defaultValue={e.provider ?? ""} placeholder="Provider" maxLength={120} className={inputCls} />
            <input name="bet" defaultValue={e.bet} inputMode="decimal" required className={inputCls} />
            <input name="image_url" defaultValue={e.image_url ?? ""} placeholder="Image URL" maxLength={512} className={inputCls} />
            <SubmitButton className={btnGhost}>Save</SubmitButton>
          </form>
        </details>
      )}
    </li>
  );
}

export default async function AdminBonusHunt({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const hunts = await getAllHunts();
  const data = await Promise.all(hunts.map(async (h) => {
    const entries = await getHuntEntries(h.id);
    return { hunt: h, entries, stats: computeHuntStats(h.start_balance, entries) };
  }));
  const hasActive = hunts.some((h) => h.status === "active");

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Watch" title="Bonus Hunt">
        <Link href="/bonus-hunt" className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Public page</Link>
      </AdminHeader>
      <Flash searchParams={searchParams} />
      <Help>
        One active hunt at a time. Add bonuses (slot + bet) and reorder them freely until the first payout: from then on the list is locked and any
        linked Guess the Balance round closes in the same step. A payout of 0 counts as opened. <strong className="text-text-0">Final balance = sum of payouts</strong>;
        &quot;sum of bets&quot; is just the bet sizes added up, not the hunt&apos;s cost. Finish once every bonus is opened, then archive.
      </Help>

      {!hasActive && (
        <form action={createAction} className="surface grid gap-3 p-6 sm:grid-cols-3">
          <p className="label sm:col-span-3">New hunt</p>
          <Field label="Title"><input name="title" required maxLength={120} placeholder="Sunday hunt" className={inputCls} /></Field>
          <Field label="Start balance ($)" hint="Reference bankroll announced on stream"><input name="start_balance" required inputMode="decimal" placeholder="5000" className={inputCls} /></Field>
          <Field label="Image URL (optional)"><input name="image_url" maxLength={512} className={inputCls} /></Field>
          <div className="sm:col-span-3"><SubmitButton className={btnGold}><Icon name="Plus" className="h-4 w-4" /> Create hunt</SubmitButton></div>
        </form>
      )}

      {data.length === 0 ? <p className="surface p-6 text-sm text-text-1">No hunts yet.</p> : data.map(({ hunt, entries, stats }) => (
        <div key={hunt.id} className="surface space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-text-2">#{hunt.id}</span>
            <p className="font-medium text-text-0">{hunt.title || "Bonus hunt"}</p>
            <Badge tone={TONE[hunt.status]}>{hunt.status}</Badge>
            {hunt.status === "active" && <Badge tone={hunt.opening_started_at ? "plasma" : "gold"}>{hunt.opening_started_at ? "opening" : "collecting"}</Badge>}
            <span className="ml-auto text-xs text-text-2">Created <Utc value={hunt.created_at} />{hunt.finished_at && <> · finished <Utc value={hunt.finished_at} /></>}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <p>Start balance <span className="block font-mono text-sm text-text-0">{formatMoney(hunt.start_balance)}</span></p>
            <p>Sum of bets <span className="block font-mono text-sm text-text-0">{formatMoney(stats.sumBets)}</span></p>
            <p>Opened <span className="block font-mono text-sm text-text-0">{stats.opened} / {stats.count}</span></p>
            <p>{stats.complete ? "Final balance" : "Payouts so far"} <span className="block font-mono text-sm text-volt">{formatMoney(stats.currentWin)}</span></p>
          </div>

          {hunt.status === "active" && !hunt.opening_started_at && (
            <details>
              <summary className="cursor-pointer text-sm text-text-2 hover:text-text-0">Edit hunt</summary>
              <form action={updateAction} className="mt-2 grid gap-2 sm:grid-cols-3">
                <Hidden fields={{ hunt_id: hunt.id }} />
                <input name="title" defaultValue={hunt.title} required maxLength={120} className={inputCls} />
                <input name="start_balance" defaultValue={hunt.start_balance} required inputMode="decimal" className={inputCls} />
                <SubmitButton className={btnGhost}>Save</SubmitButton>
              </form>
            </details>
          )}

          <ol className="space-y-2">
            {entries.map((e, i) => <EntryRow key={e.id} hunt={hunt} e={e} i={i} last={i === entries.length - 1} />)}
          </ol>

          {hunt.status === "active" && !hunt.opening_started_at && (
            <form action={addEntryAction} className="space-y-2 rounded-xl border border-dashed border-line p-3">
              <Hidden fields={{ hunt_id: hunt.id }} />
              <p className="label">Add a bonus — type the slot, pick it; image and provider come from the slot catalogue</p>
              <SlotPicker defaultBet={entries.length ? entries[entries.length - 1].bet.replace(/\.?0+$/, "") : ""} />
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            {hunt.status === "active" && (
              <form action={finishAction}>
                <Hidden fields={{ hunt_id: hunt.id }} />
                <SubmitButton className={btnGold} confirm="Finish the hunt? Payouts freeze."><Icon name="Flag" className="h-4 w-4" /> Finish hunt</SubmitButton>
              </form>
            )}
            {hunt.status === "finished" && (
              <form action={archiveAction}>
                <Hidden fields={{ hunt_id: hunt.id }} />
                <SubmitButton className={btnGhost}><Icon name="Archive" className="h-4 w-4" /> Archive</SubmitButton>
              </form>
            )}
            {hunt.status === "active" && !hunt.opening_started_at && (
              <form action={deleteAction}>
                <Hidden fields={{ hunt_id: hunt.id }} />
                <SubmitButton className={btnDanger} confirm="Delete this hunt and its bonuses?"><Icon name="Trash2" className="h-4 w-4" /> Delete</SubmitButton>
              </form>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
