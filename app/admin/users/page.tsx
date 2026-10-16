import Link from "next/link";
import { requireAdmin } from "@/lib/adminAction";
import { listUsers, getUserStats, type UserRow } from "@/lib/userAdmin";
import { formatMoney } from "@/lib/money";
import { banAction, unbanAction, signOutAction, deleteAction } from "./actions";
import { UserWallets } from "@/components/admin/UserWallets";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Pager, pageParam } from "@/components/events/shared";
import { Flash, AdminHeader, Hidden, Help, Utc, first, btnGhost, btnDanger, btnVolt, type SearchParams } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";

export const dynamic = "force-dynamic";
const PATH = "/admin/users";
const PAGE = 50;
const FILTERS = [
  { key: "all", label: "All" }, { key: "kick", label: "Kick linked" }, { key: "discord", label: "Discord linked" }, { key: "banned", label: "Banned" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function Avatar({ u }: { u: UserRow }) {
  return <UserAvatar src={u.avatar} name={u.display_name} className="h-10 w-10 rounded-xl border border-line" />;
}

function Stat({ label, value, tone = "text-text-0", icon }: { label: string; value: number; tone?: string; icon: string }) {
  return (
    <div className="surface p-4">
      <p className="label flex items-center gap-1.5"><Icon name={icon} className="h-3.5 w-3.5" />{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${tone}`}>{value.toLocaleString("en-US")}</p>
    </div>
  );
}


export default async function AdminUsers({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").slice(0, 100);
  const filter: Filter = FILTERS.some((f) => f.key === first(sp.filter)) ? (first(sp.filter) as Filter) : "all";
  const page = pageParam(sp.page);
  const [stats, { rows, total }] = await Promise.all([getUserStats(), listUsers({ q, filter, limit: PAGE, offset: (page - 1) * PAGE })]);
  const base = `${PATH}?${new URLSearchParams({ ...(q ? { q } : {}), ...(filter !== "all" ? { filter } : {}) })}`;
  const here = page > 1 ? `${base}${base.endsWith("?") ? "" : "&"}page=${page}` : base.replace(/\?$/, "");

  return (
    <div className="space-y-6">
      <AdminHeader kicker="Site" title="Users">
        <Link href="/account" className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Account page</Link>
      </AdminHeader>
      <Flash searchParams={searchParams} />
      <Help>
        Viewers who signed in with Kick or Discord. Prizes are matched through the linked Kick or verified Discord account; open a user for the full history. <strong className="text-text-0">Ban</strong> signs the user out
        everywhere, blocks sign-in and prize claims. <strong className="text-text-0">Sign out</strong> ends all their sessions. <strong className="text-text-0">Delete</strong> removes
        the account and its links (their prizes stay in Admin → Prizes under their Kick name); they can sign up again unless banned first.
      </Help>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat icon="Users" label="Users" value={stats.total} tone="text-gold" />
        <Stat icon="UserPlus" label="New · 7 days" value={stats.new7} tone="text-volt" />
        <Stat icon="Activity" label="Active · 24h" value={stats.active24} tone="text-cyan" />
        <Stat icon="Trophy" label="Prize winners" value={stats.winners} />
        <Stat icon="Wallet" label="Wallet set" value={stats.withWallet} />
        <Stat icon="Zap" label="Kick linked" value={stats.kick} />
        <Stat icon="MessageCircle" label="Discord linked" value={stats.discord} />
        <Stat icon="Link" label="Both linked" value={stats.both} />
        <Stat icon="Ban" label="Banned" value={stats.banned} tone={stats.banned ? "text-danger" : "text-text-0"} />
      </div>

      <form className="surface flex flex-wrap items-center gap-2 p-3" action={PATH}>
        <label className="relative min-w-60 flex-1">
          <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-2" />
          <input name="q" defaultValue={q} placeholder="Search name, Kick / Discord / Stake username, wallet, id…" aria-label="Search users"
            className="h-10 w-full rounded-xl border border-line bg-bg-2 pl-9 pr-3 text-sm focus:border-gold focus:outline-none" />
        </label>
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <button className={btnGhost}>Search</button>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`${PATH}?${new URLSearchParams({ ...(q ? { q } : {}), ...(f.key !== "all" ? { filter: f.key } : {}) })}`}
              className={`rounded-lg px-3 py-2 text-sm ${filter === f.key ? "bg-gold/15 text-gold" : "text-text-1 hover:bg-bg-2"}`}>{f.label}</Link>
          ))}
        </div>
      </form>

      <p className="text-sm text-text-2">{total.toLocaleString("en-US")} user{total === 1 ? "" : "s"}{q ? ` matching “${q}”` : ""}</p>

      {rows.length === 0 ? (
        <p className="surface p-6 text-sm text-text-1">{stats.total === 0 ? "No users yet. They appear here after signing in with Kick or Discord on /account." : "No user matches."}</p>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {["User", "Kick", "Discord", "Joined", "Last login", "Prizes", "Wallets", "Actions"].map((h) => <th key={h} className="label px-3 py-3 font-normal">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={`border-b border-line/60 align-top last:border-0 ${u.banned ? "bg-danger/5" : ""}`}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar u={u} />
                      <span className="min-w-0">
                        <Link href={`/admin/users/${u.id}`} className="block max-w-48 truncate font-semibold text-text-0 hover:text-gold">{u.display_name}</Link>
                        <span className="flex items-center gap-1.5 text-xs text-text-2">#{u.id}
                          {u.banned ? <Badge tone="danger">banned</Badge> : null}
                          {Number(u.sessions) > 0 && !u.banned && <span className="text-volt">● {u.sessions} session{Number(u.sessions) > 1 ? "s" : ""}</span>}
                        </span>
                        {u.banned && u.banned_reason ? <span className="block max-w-56 truncate text-xs text-danger">{u.banned_reason}</span> : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">{u.kick_name ? <span className="inline-flex items-center gap-1.5"><BrandIcon brand="kick" className="h-3.5 w-3.5 text-[#53fc18]" /><a href={`https://kick.com/${encodeURIComponent(u.kick_name)}`} target="_blank" rel="noreferrer" className="hover:text-gold">{u.kick_name}</a></span> : <span className="text-text-2">—</span>}</td>
                  <td className="px-3 py-3">{u.discord_name ? <span className="inline-flex items-center gap-1.5"><BrandIcon brand="discord" className="h-3.5 w-3.5 text-[#8f99ff]" />{u.discord_name}</span> : <span className="text-text-2">—</span>}</td>
                  <td className="px-3 py-3 text-xs text-text-1"><Utc value={u.created_at} /></td>
                  <td className="px-3 py-3 text-xs text-text-1">{u.last_login_at ? <Utc value={u.last_login_at} /> : "—"}</td>
                  <td className="px-3 py-3">
                    {Number(u.prizes_won) > 0 ? (
                      <Link href={`/admin/users/${u.id}#prizes`} className="inline-flex flex-col text-xs hover:text-gold">
                        <span className="font-semibold text-text-0">{u.prizes_won} won · <span className="font-mono text-gold">{formatMoney(u.won_amount)}</span></span>
                        <span className="text-text-2">{u.prizes_open} open · {u.prizes_paid} paid ({formatMoney(u.paid_amount)})</span>
                      </Link>
                    ) : <span className="text-text-2">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs"><UserWallets u={u} /></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/users/${u.id}`} className={btnGhost} aria-label={`Open ${u.display_name}`}><Icon name="Eye" className="h-4 w-4" /></Link>
                      {u.banned ? (
                        <form action={unbanAction}><Hidden fields={{ id: u.id, back: here }} /><SubmitButton className={btnVolt} confirm={`Unban ${u.display_name}?`}>Unban</SubmitButton></form>
                      ) : (
                        <form action={banAction} className="flex items-center gap-1">
                          <Hidden fields={{ id: u.id, back: here }} />
                          <input name="reason" maxLength={255} placeholder="reason" aria-label={`Ban reason for ${u.display_name}`} className="h-9 w-28 rounded-lg border border-line bg-bg-2 px-2 text-xs" />
                          <SubmitButton className={btnDanger} confirm={`Ban ${u.display_name}? They are signed out and can't sign in or claim prizes.`}>Ban</SubmitButton>
                        </form>
                      )}
                      {Number(u.sessions) > 0 && (
                        <form action={signOutAction}><Hidden fields={{ id: u.id, back: here }} /><SubmitButton className={btnGhost} confirm={`Sign ${u.display_name} out everywhere?`}>Sign out</SubmitButton></form>
                      )}
                      <form action={deleteAction}><Hidden fields={{ id: u.id, back: here }} />
                        <SubmitButton className={`${btnGhost} hover:border-danger hover:text-danger`} confirm={`Delete ${u.display_name}'s account? Their links and sessions are removed (prizes stay). This cannot be undone.`}>
                          <Icon name="Trash2" className="h-4 w-4" /><span className="sr-only">Delete</span>
                        </SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager base={base} page={page} pages={Math.ceil(total / PAGE)} />
    </div>
  );
}
