import type { Metadata } from "next";
import Link from "next/link";
import { getOpenGiveaways, getPastWinners } from "@/lib/giveaways";
import { KICK_URL } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading, Badge } from "@/components/ui/Badge";
import { Countdown } from "@/components/ui/Countdown";
import { Magnetic } from "@/components/ui/Magnetic";
import { Icon } from "@/components/ui/Icon";
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";

export const metadata: Metadata = {
  title: "Giveaways",
  description: "Live giveaways and past winners. Enter in Kick chat.",
};
export const dynamic = "force-dynamic";

type OpenGiveaway = Awaited<ReturnType<typeof getOpenGiveaways>>[number];

function KeywordLine({ g }: { g: OpenGiveaway }) {
  if (g.type !== "keyword" || !g.keyword) return null;
  return (
    <span className="inline-flex items-center gap-2 text-text-1">
      <Icon name="Hash" className="h-4 w-4 text-volt" />
      Type <code className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-gold">{g.keyword}</code> in chat
    </span>
  );
}

function EnterButton() {
  return (
    <Magnetic>
      <a
        href={KICK_URL}
        target="_blank"
        rel="noreferrer"
        className="press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-volt px-6 text-sm font-semibold text-bg-0 hover:brightness-110"
      >
        <Icon name="Radio" className="h-4 w-4" /> Enter on Kick
      </a>
    </Magnetic>
  );
}

// Featured (first open) giveaway as a wide cinematic event banner.
function FeaturedGiveaway({ g }: { g: OpenGiveaway }) {
  return (
    <div className="surface gold-border relative isolate overflow-hidden p-6 md:p-10">
      <div className="tunnel-grid absolute inset-0 opacity-40" aria-hidden />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 70%)" }}
        aria-hidden
      />
      <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <span className="label inline-flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-volt" />
            </span>
            Live giveaway
          </span>
          <h2 className="font-bang mt-3 text-3xl tracking-wide md:text-5xl">{g.title}</h2>
          <p className="mt-4 max-w-md text-sm text-text-1 md:text-base">
            {g.entry_condition || "Enter live in Kick chat during the stream."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <KeywordLine g={g} />
            <span className="inline-flex items-center gap-2 text-text-2">
              <Icon name="Users" className="h-4 w-4" /> {g.entrants.toLocaleString()} entered
            </span>
          </div>
          <div className="mt-7">
            <EnterButton />
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-bg-1/60 p-6 text-center">
          <div>
            <p className="label">Prize pool</p>
            <p className="text-gradient-gold mt-1 font-bang text-4xl md:text-5xl">{g.prize}</p>
          </div>
          {g.ends_at && (
            <div className="border-t border-line pt-4">
              <p className="label mb-2">Closes in</p>
              <Countdown target={new Date(g.ends_at).toISOString()} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GiveawayCard({ g }: { g: OpenGiveaway }) {
  return (
    <div className="surface surface-hover flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl">{g.title}</h3>
          <p className="text-gradient-gold mt-1 font-bang text-2xl">{g.prize}</p>
        </div>
        <Badge tone="volt">Open</Badge>
      </div>
      <p className="mt-4 text-sm text-text-1">{g.entry_condition || "Enter live in chat."}</p>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <KeywordLine g={g} />
        <span className="inline-flex items-center gap-2 text-text-2">
          <Icon name="Users" className="h-4 w-4" /> {g.entrants.toLocaleString()} entered
        </span>
      </div>
      {g.ends_at && (
        <div className="mt-5 border-t border-line pt-4">
          <Countdown target={new Date(g.ends_at).toISOString()} />
        </div>
      )}
      <div className="mt-5">
        <EnterButton />
      </div>
    </div>
  );
}

export default async function GiveawaysPage() {
  if (!(await isPageEnabled("/giveaways"))) notFound();
  const [open, winners] = await Promise.all([getOpenGiveaways(), getPastWinners()]);
  const [featured, ...rest] = open;

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Rewards"
        title="Giveaways"
        watermark="Giveaways"
        accent="gold"
        icon="Gift"
        iconColor="volt"
        lead="Free to enter. Drawn live. Provably fair."
        right={<Badge tone="plasma"><Icon name="ShieldCheck" className="h-3.5 w-3.5" /> Provably fair</Badge>}
      />

      {open.length === 0 ? (
        <EmptyState
          icon="Gift"
          title="No giveaway running"
          line="Nothing live right now. Follow on Kick so you don't miss the next drop."
          cta={{ label: "Follow on Kick", href: KICK_URL, external: true }}
        />
      ) : (
        <div className="space-y-5">
          <FeaturedGiveaway g={featured} />
          {rest.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {rest.map((g) => (
                <GiveawayCard key={g.id} g={g} />
              ))}
            </div>
          )}
        </div>
      )}

      {winners.length > 0 && (
        <section>
          <SectionHeading kicker="Hall of winners" title="Recent winners" watermark="Winners" align="right" accent="cyan" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {winners.map((w, i) => (
              <div key={i} className="surface surface-hover flex items-center gap-3 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-bg-3 ring-1 ring-line-strong">
                  {w.avatar ? (
                    // real Kick profile avatar (files.kick.com); cross-origin <img>
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.avatar} alt="" loading="lazy" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    // initials fallback when the user has no Kick avatar
                    <span className="font-display text-sm font-bold text-text-1">
                      {w.username.slice(0, 1).toUpperCase()}
                    </span>
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
