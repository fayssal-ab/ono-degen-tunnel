import type { Metadata } from "next";
import Link from "next/link";
import { getOpenGiveaways, getPastWinners } from "@/lib/giveaways";
import { KICK_URL } from "@/lib/constants";
import { ASSETS } from "@/lib/assets";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading, Badge } from "@/components/ui/Badge";
import { Countdown } from "@/components/ui/Countdown";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Giveaways",
  description: "Live giveaways and past winners. Enter in Kick chat.",
};
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

export default async function GiveawaysPage() {
  if (!(await isPageEnabled("/giveaways"))) notFound();
  const [open, winners] = await Promise.all([getOpenGiveaways(), getPastWinners()]);

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Rewards"
        title="Giveaways"
        lead="Free to enter, drawn live on stream through Kick chat."
        right={<Badge tone="plasma"><Icon name="ShieldCheck" className="h-3.5 w-3.5" /> Provably fair</Badge>}
      />

      {/* active */}
      {open.length === 0 ? (
        <EmptyState
          image={ASSETS.empty.noGiveaway}
          title="No giveaway running"
          line="Nothing live right now. Follow on Kick so you don't miss the next drop."
          cta={{ label: "Follow on Kick", href: KICK_URL, external: true }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {open.map((g) => (
            <div key={g.id} className="surface gold-border flex flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl">{g.title}</h2>
                  <p className="mt-1 font-mono text-lg font-bold text-gold">{g.prize}</p>
                </div>
                <Badge tone="volt">Open</Badge>
              </div>

              <p className="mt-4 text-sm text-text-1">{g.entry_condition || "Enter live in chat."}</p>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                {g.type === "keyword" && g.keyword && (
                  <span className="inline-flex items-center gap-2 text-text-1">
                    <Icon name="Hash" className="h-4 w-4 text-volt" />
                    Type <code className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-gold">{g.keyword}</code> in chat
                  </span>
                )}
                <span className="inline-flex items-center gap-2 text-text-2">
                  <Icon name="Users" className="h-4 w-4" /> {g.entrants.toLocaleString()} entered
                </span>
              </div>

              {g.ends_at && (
                <div className="mt-5 border-t border-line pt-4">
                  <Countdown target={new Date(g.ends_at).toISOString()} />
                </div>
              )}

              <a href={KICK_URL} target="_blank" rel="noreferrer" className="press mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-volt text-sm font-semibold text-bg-0 hover:brightness-110">
                <Icon name="Radio" className="h-4 w-4" /> Enter on Kick
              </a>
            </div>
          ))}
        </div>
      )}

      {/* past winners */}
      {winners.length > 0 && (
        <section>
          <SectionHeading kicker="Hall of winners" title="Recent winners" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {winners.map((w, i) => (
              <div key={i} className="surface flex items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-3">
                  {w.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <Icon name="User" className="h-5 w-5 text-text-2" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-text-0">{w.username}</p>
                  <p className="truncate text-xs text-text-2">{w.prize} · {w.giveaway_title}</p>
                </div>
                {w.verifiable && (
                  <Link href={`/verify/${w.giveaway_id}`} className="shrink-0 text-xs text-plasma hover:underline" title="Verify this draw">
                    Verify
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
