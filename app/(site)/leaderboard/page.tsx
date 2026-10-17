import type { Metadata } from "next";
import Link from "next/link";
import { PERIOD_RESET_TIME_UTC, DISCORD_URL } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { getActivePeriod, getClosedPeriods, getLatestSuccessfulSync } from "@/lib/periods";
import { getLiveBoard } from "@/lib/board";
import { isLeaderboardEnabled, getCasinoInfo } from "@/lib/settings";
import { isDemoMode } from "@/lib/providers";
import { Badge, SectionHeading } from "@/components/ui/Badge";
import { Countdown } from "@/components/ui/Countdown";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { EmptyState } from "@/components/ui/EmptyState";
import { Podium } from "@/components/leaderboard/Podium";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { FindMe } from "@/components/leaderboard/FindMe";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArtCard } from "@/components/ui/ArtCard";
import { CopyChip } from "@/components/ui/CopyChip";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Wager with the code, climb the board, take the prize. Top 10 eat.",
};

// SSR from our own DB only (golden rule 1). Never calls the casino API.
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

type View = "monthly" | "weekly" | "previous";

const TABS: { key: View; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "weekly", label: "Weekly" },
  { key: "previous", label: "Previous" },
];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; find?: string }>;
}) {
  if (!(await isPageEnabled("/leaderboard"))) notFound();
  const sp = await searchParams;
  const view: View = sp.view === "weekly" ? "weekly" : sp.view === "previous" ? "previous" : "monthly";
  const find = typeof sp.find === "string" ? sp.find : "";

  const enabled = await isLeaderboardEnabled();

  return (
    <div className="space-y-8">
      <PageHeader kicker="Compete" title="Leaderboard" lead="Wager with the code, climb the board, take the prize." icon="Trophy" iconColor="gold" accent="gold"
        right={isDemoMode() ? <Badge tone="plasma">Demo data</Badge> : undefined} />

      {/* tabs */}
      <nav className="flex gap-1 rounded-2xl border border-gold/20 bg-bg-1/70 p-1.5 backdrop-blur">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/leaderboard?view=${t.key}`}
            aria-current={view === t.key ? "page" : undefined}
            className={`flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
              view === t.key ? "bg-gold text-bg-0 shadow-[0_6px_20px_-8px_var(--color-gold)]" : "text-text-1 hover:bg-bg-2 hover:text-text-0"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {!enabled ? (
        <EmptyState
          icon="Trophy"
          title="Leaderboard coming soon"
          line="The board isn't live yet. Join the Discord to get pinged the moment it opens."
          cta={{ label: "Join Discord", href: DISCORD_URL, external: true }}
        />
      ) : view === "weekly" ? (
        <WeeklyView find={find} />
      ) : view === "previous" ? (
        <PreviousView />
      ) : (
        <MonthlyView find={find} />
      )}
    </div>
  );
}

async function MonthlyView({ find }: { find: string }) {
  const period = await getActivePeriod();

  if (!period) {
    return (
      <EmptyState
        icon="Trophy"
        title="Leaderboard dropping soon"
        line="No period is live right now. The next one is already scheduled — get notified in Discord."
        cta={{ label: "Notify me", href: DISCORD_URL, external: true }}
      />
    );
  }

  const [rows, sync, casino] = await Promise.all([
    getLiveBoard(period, 100),
    getLatestSuccessfulSync(period.id),
    getCasinoInfo(),
  ]);
  const resetInstant = `${period.end_at}T${PERIOD_RESET_TIME_UTC}Z`;
  const topPrize = Number(period.prize_pool) > 0 ? formatMoney(period.prize_pool) : "—";

  return (
    <div className="space-y-8">
      {/* hero: prize pool + countdown */}
      <section className="relative isolate overflow-hidden rounded-[26px] border border-gold/30 p-6 md:p-8"
        style={{ background: "linear-gradient(150deg, color-mix(in srgb, #f5c451 16%, var(--color-bg-1)), var(--color-bg-1) 55%, color-mix(in srgb, #8b5cf6 10%, var(--color-bg-1)))" }}>
        <div className="tunnel-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <Icon name="Trophy" strokeWidth={1.2} aria-hidden className="pointer-events-none absolute -right-10 -top-6 h-72 w-72 rotate-12 text-gold/10" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="label inline-flex items-center gap-2 text-gold/90">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-volt" /></span>
              {period.title || "Current period"} · live
            </p>
            <p className="font-bang mt-3 text-5xl tracking-wide text-gold md:text-7xl [text-shadow:0_0_40px_rgba(245,196,81,0.35)]">{topPrize}</p>
            <p className="mt-2 text-sm text-text-1">prize pool · wager on <b className="text-text-0">{casino.name}</b> with code</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <CopyChip value={casino.code} />
              {sync && <span className="text-xs text-text-2"><RelativeTime iso={sync.cache_updated_at ?? sync.fetched_at} prefix="Updated " /></span>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-bg-0/50 p-4 backdrop-blur">
            <p className="label mb-2 text-center">Board resets in</p>
            <Countdown target={resetInstant} />
          </div>
        </div>
      </section>

      <FindMe initial={find} />

      {rows.length === 0 ? (
        <EmptyState
          icon="Trophy"
          title="No wagers yet this period"
          line="Be the first on the board. Sign up with the code and your wagers show up here within 10 minutes."
          cta={{ label: "How it works", href: "/how-it-works" }}
        />
      ) : (
        <>
          <Podium rows={rows} />
          <LeaderboardTable rows={rows} startRank={4} />
          <PrizeDistribution period={period} />
        </>
      )}
    </div>
  );
}

function WeeklyView({ find }: { find: string }) {
  void find;
  return (
    <EmptyState
      icon="Trophy"
      title="No weekly board running"
      line="Weekly boards spin up around big streams. The monthly board is always live — check that tab."
      cta={{ label: "View monthly", href: "/leaderboard?view=monthly" }}
    />
  );
}

async function PreviousView() {
  const closed = await getClosedPeriods(24);
  if (closed.length === 0) {
    return (
      <EmptyState
        icon="Trophy"
        title="No closed periods yet"
        line="Finished boards get archived here with their frozen final standings and payouts."
      />
    );
  }
  return (
    <div>
      <SectionHeading kicker="Archive" title="Previous periods" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {closed.map((p) => (
          <ArtCard key={p.id} href={`/leaderboard/${p.id}`} tone={["#f5c451", "#7a4a12"]} icon="Trophy" headline={formatMoney(p.prize_pool)}
            badge={{ label: "Final" }} title={p.title || "Monthly"} sub={<span className="font-mono text-xs">{p.start_at} → {p.end_at}</span>}
            footer={`${p.winner_count} winner${p.winner_count === 1 ? "" : "s"} · see results →`} />
        ))}
      </div>
    </div>
  );
}

function PrizeDistribution({ period }: { period: Awaited<ReturnType<typeof getActivePeriod>> }) {
  if (!period || period.prize_distribution.length === 0) return null;
  return (
    <div className="surface p-6">
      <SectionHeading kicker="Payouts" title="Prize distribution" />
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {period.prize_distribution
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((d) => (
            <div key={d.rank} className="flex items-center justify-between border-b border-line/60 py-2">
              <span className="font-mono text-sm text-text-1">#{d.rank}</span>
              <span className="font-mono text-sm text-gold">
                {formatMoney((Number(period.prize_pool) * d.percentage) / 100)}
              </span>
            </div>
          ))}
      </div>
      <p className="mt-4 text-xs text-text-2">
        Amounts update live with the prize pool. See the <Link href="/rules" className="text-text-1 underline">rules</Link> for how wagers are counted.
      </p>
    </div>
  );
}
