import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icon";
import { UtcTime } from "@/components/events/shared";
import { LogoutButton, UnlinkButton } from "@/components/account/AccountActions";
import {
  AUTH_MESSAGES, PROVIDERS, PROVIDER_NAME, currentAccountId, getAccount, getActivity, providerConfig, type Provider, type AccountSummary, type AccountActivity,
} from "@/lib/userAuth";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

const TINT: Record<Provider, string> = { kick: "bg-[#53fc18] text-black hover:brightness-110", discord: "bg-[#5865F2] text-white hover:brightness-110" };
const PLACE = ["", "🥇 Champion", "🥈 Runner-up", "🥉 3rd place"];
const STATE: Record<string, string> = { registered: "Registered", in_knockout: "In the bracket", eliminated: "Eliminated", champion: "Champion" };

function Avatar({ src, name, size = 48 }: { src: string; name: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-bg-3 font-display font-bold text-gold" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : (name[0]?.toUpperCase() ?? "?")}
    </span>
  );
}

function ContinueButton({ p, verb }: { p: Provider; verb: string }) {
  const ready = providerConfig(p) != null;
  if (!ready) {
    return <span className="inline-flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-line px-5 text-sm text-text-2"><BrandIcon brand={p} className="h-5 w-5" /> {PROVIDER_NAME[p]} sign-in coming soon</span>;
  }
  return (
    // a plain link: the route redirects to the provider
    <a href={`/api/auth/${p}/start?next=/account`} className={`press inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold ${TINT[p]}`}>
      <BrandIcon brand={p} className="h-5 w-5" /> {verb} {PROVIDER_NAME[p]}
    </a>
  );
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? AUTH_MESSAGES[sp.error] ?? AUTH_MESSAGES.failed : null;
  const linked = typeof sp.linked === "string" && sp.linked in PROVIDER_NAME ? PROVIDER_NAME[sp.linked as Provider] : null;

  let account: AccountSummary | null = null;
  let activity: AccountActivity = { tournaments: [], prizes: [] };
  let down = false;
  try {
    const id = await currentAccountId();
    account = id != null ? await getAccount(id) : null;
    if (account) activity = await getActivity(account.identities.find((i) => i.provider === "kick"));
  } catch { down = true; }

  const notice = (
    <>
      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">{error}</p>}
      {linked && <p role="status" className="rounded-xl border border-volt/40 bg-volt/10 p-3 text-sm">{linked} linked to your account.</p>}
      {down && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">Accounts are temporarily unavailable. Try again in a moment.</p>}
    </>
  );

  if (!account) {
    return (
      <div className="space-y-8">
        <PageHeader kicker="Account" title="Sign in" lead="Use your Kick or Discord account. Link the other one after — one profile for both." />
        {notice}
        <div className="surface mx-auto flex max-w-md flex-col gap-3 p-6 sm:p-8">
          <ContinueButton p="kick" verb="Continue with" />
          <ContinueButton p="discord" verb="Continue with" />
          <p className="mt-2 text-center text-xs text-text-2">We only read your public username and avatar. No password is ever shared with us.</p>
        </div>
      </div>
    );
  }

  const byProvider = new Map(account.identities.map((i) => [i.provider, i]));
  const kick = byProvider.get("kick");
  return (
    <div className="space-y-8">
      <PageHeader kicker="Account" title="Your profile" />
      {notice}
      <section className="surface flex flex-wrap items-center gap-4 p-6">
        <Avatar src={account.avatar} name={account.display_name} size={72} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-extrabold sm:text-3xl">{account.display_name}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-xs text-text-2">
            {account.identities.map((i) => <span key={i.provider} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5"><BrandIcon brand={i.provider} className="h-3 w-3" /> {i.username}</span>)}
          </p>
        </div>
        <LogoutButton />
      </section>

      <section className="surface p-6">
        <h2 className="label mb-4">Linked accounts</h2>
        <ul className="space-y-3">
          {PROVIDERS.map((p) => {
            const id = byProvider.get(p);
            return (
              <li key={p} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg-1 p-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${p === "kick" ? "bg-[#53fc18]/15 text-[#53fc18]" : "bg-[#5865F2]/20 text-[#8f99ff]"}`}><BrandIcon brand={p} className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{PROVIDER_NAME[p]}</span>
                  <span className="block truncate text-xs text-text-2">{id ? <>Linked as <span className="text-text-0">{id.username}</span></> : "Not linked"}</span>
                </span>
                {id ? (account.identities.length > 1 ? <UnlinkButton provider={p} label={PROVIDER_NAME[p]} /> : <span className="text-xs text-text-2">Main sign-in</span>) : <ContinueButton p={p} verb="Link" />}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-6">
          <h2 className="label mb-4">My tournaments</h2>
          {!kick ? (
            <p className="text-sm text-text-2">Link your Kick account to see the tournaments you joined with <code className="text-gold">!join</code>.</p>
          ) : activity.tournaments.length === 0 ? (
            <p className="text-sm text-text-2">No tournament yet. Type <code className="text-gold">!join &lt;slot&gt;</code> in chat when registration opens. <Link href="/tournaments" className="text-gold underline">Tournaments</Link></p>
          ) : (
            <ul className="space-y-2">
              {activity.tournaments.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-bg-1 p-2.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-bg-3 text-xs font-bold text-gold">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {t.slot_image ? <img src={t.slot_image} alt="" className="h-full w-full object-cover" /> : t.slot_name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.title}</span>
                    <span className="block truncate text-xs text-cyan">{t.slot_name}</span>
                  </span>
                  <span className={`shrink-0 text-xs ${t.place ? "font-semibold text-gold" : "text-text-2"}`}>{t.place ? PLACE[t.place] : STATE[t.state] ?? t.state}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="surface p-6">
          <h2 className="label mb-4">My prizes</h2>
          {!kick ? (
            <p className="text-sm text-text-2">Link your Kick account to see prizes won under your Kick username.</p>
          ) : activity.prizes.length === 0 ? (
            <p className="text-sm text-text-2">No prize yet — good luck! <Link href="/prizes" className="text-gold underline">All prizes</Link></p>
          ) : (
            <ul className="space-y-2">
              {activity.prizes.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-bg-1 p-3">
                  <Icon name="Gift" className="h-5 w-5 shrink-0 text-gold" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.title || "Prize"}</span>
                    <span className="block text-xs text-text-2"><UtcTime value={p.created_at} /></span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-gold">{p.amount != null ? formatMoney(p.amount) : p.prize_label || "—"}</span>
                    <span className={`block text-[11px] uppercase tracking-wider ${p.status === "paid" ? "text-volt" : "text-text-2"}`}>{p.status === "paid" ? "Paid" : "Pending"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
