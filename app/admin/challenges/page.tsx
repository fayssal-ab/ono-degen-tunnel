import Link from "next/link";
import { z } from "zod";
import { adminAction, requireAdmin } from "@/lib/adminAction";
import {
  getAdminChallenges, createChallenge, updateChallenge, expireChallenge, deleteChallenge,
  recordClaim, acceptClaim, rejectClaim, claimProblems, type AdminChallenge,
} from "@/lib/challenges";
import { parseForm, zId, zText, zRequiredText, zMoney, zMultiplier, zUrl, zUtcDateTime, zOptionalUtcDateTime, toInputValue } from "@/lib/events/common";
import { formatMoney } from "@/lib/money";
import { DISCORD_URL } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Flash, Field, AdminHeader, Hidden, Help, Utc, inputCls, btnGold, btnGhost, btnDanger, btnVolt, type SearchParams } from "@/components/admin/ui";
import { SubmitButton, SlotNameInput } from "@/components/admin/client";

export const dynamic = "force-dynamic";
const PATH = "/admin/challenges";
const REVALIDATE = ["/challenges", "/hall-of-fame"];

const ChallengeForm = z.object({
  slot_name: zRequiredText(191),
  provider: zText(120),
  image_url: zUrl,
  required_multiplier: zMultiplier,
  min_bet: zMoney,
  prize: zRequiredText(120),
  expires_at: zOptionalUtcDateTime,
  position: z.coerce.number().int().min(-1000).max(1000).default(0),
});
const IdForm = z.object({ id: zId });
const ClaimForm = z.object({
  claimant: zRequiredText(191),
  proof_url: zUrl,
  proof_ref: zText(191),
  bet: zMoney,
  multiplier: zMultiplier,
  played_at: zUtcDateTime,
});
const Review = z.object({ claim_id: zId, note: zText(255) });

async function createAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "challenge.create", revalidate: REVALIDATE }, async () => ({ id: await createChallenge(parseForm(ChallengeForm, formData)) }));
}

async function updateAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "challenge.update", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await updateChallenge(parseForm(IdForm, { id: formData.get("id") }).id, parseForm(ChallengeForm, formData));
  });
}

async function expireAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "challenge.expire", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await expireChallenge(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

async function deleteAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "challenge.delete", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    await deleteChallenge(parseForm(IdForm, { id: formData.get("id") }).id);
  });
}

async function claimAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "challenge.claim_record", target: String(formData.get("id")), revalidate: REVALIDATE }, async () => {
    const id = parseForm(IdForm, { id: formData.get("id") }).id;
    return { claim: await recordClaim(id, parseForm(ClaimForm, formData)) };
  });
}

async function acceptAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "challenge.claim_accept", target: String(formData.get("claim_id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(Review, formData);
    await acceptClaim(f.claim_id, f.note);
  });
}

async function rejectAction(formData: FormData) {
  "use server";
  await adminAction({ path: PATH, audit: "challenge.claim_reject", target: String(formData.get("claim_id")), revalidate: REVALIDATE }, async () => {
    const f = parseForm(Review, formData);
    await rejectClaim(f.claim_id, f.note);
  });
}

const TONE = { open: "volt", claimed: "gold", expired: "neutral" } as const;

function ChallengeFields({ c }: { c?: AdminChallenge }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Slot" className="sm:col-span-2"><SlotNameInput defaultValue={c?.slot_name} className={inputCls} /></Field>
      <Field label="Provider"><input name="provider" maxLength={120} defaultValue={c?.provider} className={inputCls} /></Field>
      <Field label="Image URL"><input name="image_url" maxLength={512} defaultValue={c?.image_url ?? ""} className={inputCls} /></Field>
      <Field label="Target multiplier (×)"><input name="required_multiplier" required inputMode="decimal" defaultValue={c?.required_multiplier} placeholder="1000" className={inputCls} /></Field>
      <Field label="Min bet ($)"><input name="min_bet" required inputMode="decimal" defaultValue={c?.min_bet ?? "0"} className={inputCls} /></Field>
      <Field label="Prize"><input name="prize" required maxLength={120} defaultValue={c?.prize} placeholder="$200" className={inputCls} /></Field>
      <Field label="Expires (UTC, optional)"><input type="datetime-local" name="expires_at" defaultValue={toInputValue(c?.expires_at)} className={inputCls} /></Field>
      <Field label="Order" hint="Lower shows first"><input name="position" type="number" defaultValue={c?.position ?? 0} className={inputCls} /></Field>
    </div>
  );
}

export default async function AdminChallenges({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const challenges = await getAdminChallenges();
  const pending = challenges.reduce((n, c) => n + c.claims.filter((cl) => cl.status === "pending").length, 0);

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Compete" title="Challenges">
        <Link href="/challenges" className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Public page</Link>
      </AdminHeader>
      <Flash searchParams={searchParams} />
      <Help>
        Claims are verified by hand. Players send proof (replay link, bet and multiplier, casino username) in <a href={DISCORD_URL} className="text-gold hover:underline" target="_blank" rel="noreferrer">Discord</a> —
        the public page says so. Record each claim here, check the replay, then accept or reject. Accepting re-checks the target and min bet (exact decimals) and that the
        win was played between publication and expiry; only one claim per challenge can ever be accepted. {pending > 0 && <strong className="text-gold">{pending} claim(s) awaiting review.</strong>}
      </Help>

      <form action={createAction} className="surface space-y-3 p-6">
        <p className="label">New challenge</p>
        <ChallengeFields />
        <SubmitButton className={btnGold}><Icon name="Plus" className="h-4 w-4" /> Create challenge</SubmitButton>
      </form>

      {challenges.length === 0 ? <p className="surface p-6 text-sm text-text-1">No challenges yet.</p> : challenges.map((c) => {
        const openClaims = c.claims.filter((cl) => cl.status !== "rejected").length;
        return (
          <div key={c.id} className="surface space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-text-2">#{c.id}</span>
              <p className="font-medium text-text-0">{c.slot_name}</p>
              <Badge tone={TONE[c.status]}>{c.status}</Badge>
              <span className="font-mono text-sm text-gold">{c.required_multiplier}×</span>
              <span className="text-xs text-text-2">min {formatMoney(c.min_bet)} · {c.prize}</span>
              <span className="ml-auto text-xs text-text-2">Published <Utc value={c.created_at} /> · expires <Utc value={c.expires_at} /></span>
            </div>
            {c.claimed_by && <p className="text-sm text-gold"><Icon name="Trophy" className="mr-1 inline h-4 w-4" />Winner: {c.claimed_by}</p>}

            {c.claims.length > 0 && (
              <ul className="space-y-2">
                {c.claims.map((cl) => {
                  const problems = claimProblems({ required_multiplier: c.required_multiplier, min_bet: c.min_bet, created_at: c.created_at, expires_at: c.expires_at }, cl);
                  return (
                    <li key={cl.id} className="rounded-xl border border-line bg-bg-1 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono">{cl.claimant}</span>
                        <Badge tone={cl.status === "accepted" ? "gold" : cl.status === "pending" ? "plasma" : "neutral"}>{cl.status}</Badge>
                        <span className="font-mono text-xs">{cl.multiplier}× · bet {formatMoney(cl.bet)} · played <Utc value={cl.played_at} /></span>
                      </div>
                      <p className="mt-1 text-xs text-text-2">
                        Proof: {cl.proof_url ? <a href={cl.proof_url} target="_blank" rel="noreferrer noopener" className="text-gold hover:underline">{cl.proof_url}</a> : null} {cl.proof_ref}
                        {cl.review_note && <> · note: {cl.review_note}</>}
                      </p>
                      {cl.status === "pending" && problems.length > 0 && <p className="mt-1 text-xs text-danger">{problems.join("; ")}</p>}
                      {cl.status === "pending" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <form action={acceptAction} className="flex gap-2">
                            <Hidden fields={{ claim_id: cl.id }} />
                            <input name="note" maxLength={255} placeholder="Note (optional)" className="h-9 rounded-lg border border-line bg-bg-2 px-2 text-sm" />
                            <SubmitButton className={btnVolt} confirm={`Accept ${cl.claimant} as the winner? This is final.`}>Accept</SubmitButton>
                          </form>
                          <form action={rejectAction} className="flex gap-2">
                            <Hidden fields={{ claim_id: cl.id }} />
                            <input name="note" maxLength={255} placeholder="Reason" className="h-9 rounded-lg border border-line bg-bg-2 px-2 text-sm" />
                            <SubmitButton className={btnDanger}>Reject</SubmitButton>
                          </form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {c.status !== "claimed" && (
              <details>
                <summary className="cursor-pointer text-sm text-text-2 hover:text-text-0">Record a claim received off-site</summary>
                <form action={claimAction} className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Hidden fields={{ id: c.id }} />
                  <Field label="Claimant (casino / Kick username)"><input name="claimant" required maxLength={191} className={inputCls} /></Field>
                  <Field label="Replay URL"><input name="proof_url" maxLength={512} placeholder="https://…" className={inputCls} /></Field>
                  <Field label="Or proof reference" hint="e.g. Discord message link or ticket id"><input name="proof_ref" maxLength={191} className={inputCls} /></Field>
                  <Field label="Actual bet ($)"><input name="bet" required inputMode="decimal" className={inputCls} /></Field>
                  <Field label="Actual multiplier (×)"><input name="multiplier" required inputMode="decimal" className={inputCls} /></Field>
                  <Field label="Played at (UTC)"><input type="datetime-local" name="played_at" required className={inputCls} /></Field>
                  <div className="sm:col-span-3"><SubmitButton className={btnGhost}><Icon name="Plus" className="h-4 w-4" /> Record claim</SubmitButton></div>
                </form>
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              {c.stored_status === "open" && openClaims === 0 && (
                <details className="w-full">
                  <summary className={`${btnGhost} cursor-pointer list-none`}><Icon name="Pencil" className="h-4 w-4" /> Edit</summary>
                  <form action={updateAction} className="mt-3 space-y-3">
                    <Hidden fields={{ id: c.id }} />
                    <ChallengeFields c={c} />
                    <SubmitButton className={btnGold}>Save</SubmitButton>
                  </form>
                </details>
              )}
              {c.stored_status === "open" && (
                <form action={expireAction}><Hidden fields={{ id: c.id }} /><SubmitButton className={btnGhost} confirm="Expire now?"><Icon name="TimerOff" className="h-4 w-4" /> Expire now</SubmitButton></form>
              )}
              {c.claims.length === 0 && c.stored_status !== "claimed" && (
                <form action={deleteAction}><Hidden fields={{ id: c.id }} /><SubmitButton className={btnDanger} confirm="Delete this challenge?"><Icon name="Trash2" className="h-4 w-4" /> Delete</SubmitButton></form>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
