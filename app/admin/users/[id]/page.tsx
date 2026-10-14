import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminAction";
import { getUserDetail } from "@/lib/userAdmin";
import { describeDestination } from "@/lib/payout";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserWallets } from "@/components/admin/UserWallets";
import { Flash, Hidden, Utc, btnGhost, btnDanger, btnVolt, type SearchParams } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { banAction, unbanAction, signOutAction, deleteAction } from "../actions";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { tournament: "Tournament", giveaway: "Giveaway", race: "Race", leaderboard: "Leaderboard", gb: "Guess the Balance", challenge: "Challenge", manual: "Manual" };

function stage(p: { status: string; claimed_at: string | null; received_at: string | null }): { label: string; tone: "gold" | "volt" | "neutral" | "danger" | "plasma" } {
  if (p.status === "void") return { label: "void", tone: "danger" };
  if (p.received_at) return { label: "received", tone: "volt" };
  if (p.status === "paid") return { label: "paid", tone: "plasma" };
  return p.claimed_at ? { label: "claimed", tone: "neutral" } : { label: "to claim", tone: "gold" };
}

export default async function AdminUserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detail = await getUserDetail(id);
  if (!detail) notFound();
  const { user: u, identities, sessions, prizes } = detail;
  const here = `/admin/users/${u.id}`;
  const guild = process.env.DISCORD_GUILD_ID;

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-text-1 hover:text-gold"><Icon name="ArrowLeft" className="h-4 w-4" /> All users</Link>
      <Flash searchParams={searchParams} />

      <section className={`surface relative overflow-hidden p-6 ${u.banned ? "border-danger/40" : ""}`}>
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <UserAvatar src={u.avatar} name={u.display_name} className="h-20 w-20 rounded-2xl border border-line text-3xl" />
          <div className="min-w-0 flex-1">
            <p className="label">User #{u.id}</p>
            <h1 className="truncate font-display text-3xl font-extrabold">{u.display_name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-2">
              joined <Utc value={u.created_at} /> · last login {u.last_login_at ? <Utc value={u.last_login_at} /> : "—"}
              {u.banned ? <Badge tone="danger">banned</Badge> : Number(u.sessions) > 0 ? <span className="text-volt">● {u.sessions} active session{Number(u.sessions) > 1 ? "s" : ""}</span> : null}
            </p>
            {u.banned && u.banned_reason ? <p className="mt-1 text-sm text-danger">Reason: {u.banned_reason}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {u.banned ? (
              <form action={unbanAction}><Hidden fields={{ id: u.id, back: here }} /><SubmitButton className={btnVolt} confirm={`Unban ${u.display_name}?`}>Unban</SubmitButton></form>
            ) : (
              <form action={banAction} className="flex items-center gap-1">
                <Hidden fields={{ id: u.id, back: here }} />
                <input name="reason" maxLength={255} placeholder="reason" aria-label="Ban reason" className="h-9 w-32 rounded-lg border border-line bg-bg-2 px-2 text-xs" />
                <SubmitButton className={btnDanger} confirm={`Ban ${u.display_name}? They are signed out and can't sign in or claim prizes.`}>Ban</SubmitButton>
              </form>
            )}
            {Number(u.sessions) > 0 && <form action={signOutAction}><Hidden fields={{ id: u.id, back: here }} /><SubmitButton className={btnGhost} confirm={`Sign ${u.display_name} out everywhere?`}>Sign out</SubmitButton></form>}
            <form action={deleteAction}><Hidden fields={{ id: u.id, back: here }} />
              <SubmitButton className={`${btnGhost} hover:border-danger hover:text-danger`} confirm={`Delete ${u.display_name}'s account? Their links and sessions are removed (prizes stay). This cannot be undone.`}>
                <Icon name="Trash2" className="h-4 w-4" /> Delete
              </SubmitButton>
            </form>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Prizes won", value: String(u.prizes_won), tone: "text-text-0" },
          { label: "Won ($)", value: formatMoney(u.won_amount), tone: "text-gold" },
          { label: "Paid ($)", value: formatMoney(u.paid_amount), tone: "text-volt" },
          { label: "Open", value: String(u.prizes_open), tone: Number(u.prizes_open) ? "text-gold" : "text-text-0" },
        ].map((s) => (
          <div key={s.label} className="surface p-4"><p className="label">{s.label}</p><p className={`mt-1 font-mono text-2xl font-bold ${s.tone}`}>{s.value}</p></div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="surface p-5 lg:col-span-2">
          <p className="label mb-3">Linked accounts</p>
          {identities.length === 0 ? <p className="text-sm text-text-2">None.</p> : (
            <ul className="space-y-2">
              {identities.map((i) => (
                <li key={i.provider} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg-1 p-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${i.provider === "kick" ? "bg-[#53fc18]/15 text-[#53fc18]" : "bg-[#5865F2]/20 text-[#8f99ff]"}`}><BrandIcon brand={i.provider} className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    {i.provider === "kick"
                      ? <a href={`https://kick.com/${encodeURIComponent(i.username)}`} target="_blank" rel="noreferrer" className="font-semibold hover:text-gold">{i.username}</a>
                      : <span className="font-semibold">{i.username}</span>}
                    <span className="block font-mono text-xs text-text-2">id <span className="select-all">{i.provider_user_id}</span> · linked <Utc value={i.linked_at} /></span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="surface p-5">
          <p className="label mb-3">Payout wallets</p>
          <UserWallets u={u} />
          {sessions.length > 0 && (
            <>
              <p className="label mb-2 mt-5">Sessions</p>
              <ul className="space-y-1 text-xs text-text-1">
                {sessions.map((s, n) => <li key={n}>since <Utc value={s.created_at} /> · until <Utc value={s.expires_at} /></li>)}
              </ul>
            </>
          )}
        </section>
      </div>

      <section id="prizes" className="scroll-mt-24 space-y-2">
        <div className="flex items-center justify-between"><p className="label">Prizes</p><Link href="/admin/prizes" className="text-sm text-gold hover:underline">Prizes desk →</Link></div>
        {prizes.length === 0 ? <p className="surface p-5 text-sm text-text-1">No prize yet.</p> : prizes.map((p) => {
          const st = stage(p);
          return (
            <div key={p.id} className={`surface flex flex-wrap items-center gap-3 p-3 text-sm ${p.status === "void" ? "opacity-60" : ""}`}>
              <Badge tone={st.tone}>{st.label}</Badge>
              <span className="font-semibold text-text-0">{p.title}</span>
              <span className="text-text-2">{SOURCE[p.source] ?? p.source}{p.place ? ` · #${p.place}` : ""} · <Utc value={p.created_at} /></span>
              {p.claimed_at && <code className="break-all rounded bg-bg-1 px-1.5 py-0.5 font-mono text-xs text-text-1">{describeDestination(p.payout_method, p.payout_username, p.payout_network)}</code>}
              {guild && p.discord_channel_id && (
                <a href={`https://discord.com/channels/${guild}/${p.discord_channel_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8f99ff] hover:underline"><Icon name="Ticket" className="h-3 w-3" /> ticket</a>
              )}
              <span className="ml-auto font-mono text-gold">{p.amount != null ? formatMoney(p.amount) : p.prize_label || "—"}</span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
