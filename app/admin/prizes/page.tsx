import Link from "next/link";
import { z } from "zod";
import { adminAction, requireAdmin } from "@/lib/adminAction";
import { listAwards, confirmPaid, voidAward, reopenAward, createManualAward, PAYOUT_LABEL, type Award } from "@/lib/prizes";
import { parseForm, zId, zText, zRequiredText } from "@/lib/events/common";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Flash, Field, AdminHeader, Hidden, Help, Utc, inputCls, btnGold, btnGhost, btnDanger, btnVolt, type SearchParams } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";

export const dynamic = "force-dynamic";
const PATH = "/admin/prizes";
const REVALIDATE = ["/prizes", "/"];
const zAmount = z.union([z.literal("").transform(() => null), z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "invalid_amount")]);

async function payAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "prize.paid", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(z.object({ id: zId, amount: zAmount, note: zText(255) }), formData);
    await confirmPaid(f.id, f.amount, f.note);
    return { amount: f.amount };
  });
}

async function voidActionFn(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "prize.void", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(z.object({ id: zId, note: zText(255) }), formData);
    await voidAward(f.id, f.note);
  });
}

async function reopenAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "prize.reopen", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await reopenAward(parseForm(z.object({ id: zId }), { id: formData.get("id") }).id);
  });
}

async function manualAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "prize.manual", revalidate: REVALIDATE }, async () => {
    const f = parseForm(z.object({ title: zRequiredText(191), winner: zRequiredText(191), amount: zAmount, prize_label: zText(120) }), formData);
    await createManualAward({ title: f.title, winner: f.winner, amount: f.amount, prizeLabel: f.prize_label });
  });
}

const SOURCE: Record<Award["source"], string> = { tournament: "Tournament", giveaway: "Giveaway", race: "Race", leaderboard: "Leaderboard", gb: "Guess the Balance", challenge: "Challenge", manual: "Manual" };
const PLACE = ["", "🥇 1st", "🥈 2nd", "🥉 3rd"];

export default async function AdminPrizes({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const awards = await listAwards("all", 300);
  const pending = awards.filter((a) => a.status === "pending");
  const done = awards.filter((a) => a.status !== "pending");
  const paidSum = awards.filter((a) => a.status === "paid").reduce((s, a) => s + Number(a.amount ?? 0), 0);

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Rewards" title="Prizes">
        <Link href="/prizes" className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Public page</Link>
      </AdminHeader>
      <Flash searchParams={searchParams} />
      <Help>
        Every win lands here automatically: tournament podium (1st/2nd/3rd), giveaway draws, races, leaderboard periods, Guess the Balance and challenges.
        Winners claim their prize from their account (Kick-linked) and say where to send it — the destination shows on each prize. Pay, then mark it
        <strong className="text-text-0"> Paid</strong>; the winner then confirms receipt (✓ received). Only paid prizes count in “Prizes awarded” on the home page and on /prizes.
        Leaderboard and race prizes go to the casino account and aren&apos;t claimed.
        Void a prize that won&apos;t be paid (e.g. a rerolled giveaway winner). Set the $ amount when confirming if it wasn&apos;t detected.
      </Help>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4"><p className="label">To pay · claimed / waiting</p><p className="mt-1 font-mono text-2xl font-bold text-gold">{pending.filter((a) => a.claimed_at).length} <span className="text-text-2">/ {pending.filter((a) => !a.claimed_at).length}</span></p></div>
        <div className="surface p-4"><p className="label">Prizes awarded (paid)</p><p className="mt-1 font-mono text-2xl font-bold text-volt">{formatMoney(paidSum)}</p></div>
        <div className="surface p-4"><p className="label">Paid prizes</p><p className="mt-1 font-mono text-2xl font-bold">{awards.filter((a) => a.status === "paid").length}</p></div>
      </div>

      <section className="space-y-2">
        <p className="label">To confirm</p>
        {pending.length === 0 ? <p className="surface p-5 text-sm text-text-1">Nothing waiting. New wins appear here automatically.</p> : pending.map((a) => (
          <div key={a.id} className="surface flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text-0">{a.winner}</span>
                <Badge>{SOURCE[a.source]}</Badge>
                {a.place && a.place <= 3 && a.source === "tournament" && <Badge tone="gold">{PLACE[a.place]}</Badge>}
              </div>
              <p className="text-xs text-text-2">{a.title}{a.prize_label ? ` · ${a.prize_label}` : ""} · won <Utc value={a.created_at} /></p>
              {a.claimed_at ? (
                <p className="mt-1.5 inline-flex flex-wrap items-center gap-2 rounded-lg border border-volt/40 bg-volt/10 px-2 py-1 text-xs">
                  <span className="font-semibold text-volt">Claimed</span>
                  <span>send to <strong className="text-text-0">{a.payout_method ? PAYOUT_LABEL[a.payout_method] : "—"}</strong></span>
                  <code className="select-all font-mono text-text-0">{a.payout_username}</code>
                  {a.claim_note && <span className="text-text-2">“{a.claim_note}”</span>}
                </p>
              ) : (
                <p className="mt-1 text-xs text-text-2">{a.source === "leaderboard" || a.source === "race" ? "Pay to the casino account." : "Not claimed yet — the winner claims it from their account."}</p>
              )}
            </div>
            <form action={payAction} className="flex flex-wrap items-center gap-2">
              <Hidden fields={{ id: a.id }} />
              <label className="flex items-center gap-1 text-sm"><span className="text-text-2">$</span>
                <input name="amount" defaultValue={a.amount ?? ""} inputMode="decimal" placeholder="amount" aria-label="Amount paid" className="h-9 w-28 rounded-lg border border-line bg-bg-2 px-2 text-right font-mono text-sm" />
              </label>
              <input name="note" maxLength={255} placeholder="note (tx id…)" className="h-9 w-40 rounded-lg border border-line bg-bg-2 px-2 text-sm" />
              <SubmitButton className={btnVolt} confirm={`Confirm ${a.winner} received this prize?`}><Icon name="CircleCheck" className="h-4 w-4" /> Paid</SubmitButton>
            </form>
            <form action={voidActionFn} className="flex items-center gap-2">
              <Hidden fields={{ id: a.id }} />
              <input name="note" maxLength={255} placeholder="reason" className="h-9 w-32 rounded-lg border border-line bg-bg-2 px-2 text-sm" />
              <SubmitButton className={btnDanger} confirm="Void this prize? It won't count as awarded.">Void</SubmitButton>
            </form>
          </div>
        ))}
      </section>

      <form action={manualAction} className="surface grid gap-3 p-6 sm:grid-cols-4">
        <p className="label sm:col-span-4">Add a prize won elsewhere (stream giveaway, bonus…)</p>
        <Field label="Event"><input name="title" required maxLength={191} placeholder="Friday stream giveaway" className={inputCls} /></Field>
        <Field label="Winner"><input name="winner" required maxLength={191} placeholder="kick username" className={inputCls} /></Field>
        <Field label="Amount ($)"><input name="amount" inputMode="decimal" placeholder="20" className={inputCls} /></Field>
        <Field label="Prize (text)"><input name="prize_label" maxLength={120} placeholder="$20 tip" className={inputCls} /></Field>
        <div className="sm:col-span-4"><SubmitButton className={btnGold}><Icon name="Plus" className="h-4 w-4" /> Add (waits for confirmation)</SubmitButton></div>
      </form>

      {done.length > 0 && (
        <section className="space-y-2">
          <p className="label">History</p>
          {done.map((a) => (
            <div key={a.id} className={`surface flex flex-wrap items-center gap-3 p-3 text-sm ${a.status === "void" ? "opacity-60" : ""}`}>
              <Badge tone={a.status === "paid" ? "volt" : "neutral"}>{a.status}</Badge>
              {a.received_at && <Badge tone="gold">✓ received</Badge>}
              <span className="font-semibold">{a.winner}</span>
              <span className="text-text-2">{SOURCE[a.source]} · {a.title}{a.place && a.source === "tournament" ? ` · ${PLACE[a.place] ?? ""}` : ""}</span>
              <span className="ml-auto font-mono">{a.amount != null ? formatMoney(a.amount) : a.prize_label || "—"}</span>
              <span className="text-xs text-text-2">{a.status === "paid" ? <>paid <Utc value={a.paid_at} /></> : a.note}</span>
              <form action={reopenAction}><Hidden fields={{ id: a.id }} /><SubmitButton className={btnGhost} confirm="Move back to “to confirm”?">Undo</SubmitButton></form>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
