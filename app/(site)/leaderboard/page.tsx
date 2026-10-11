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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Compete</p>
          <h1 className="mt-1 text-2xl md:text-3xl">Leaderboard</h1>
        </div>
        {isDemoMode() && <Badge tone="plasma">Demo data</Badge>}
      </div>

      {/* tabs */}
      <div className="flex gap-1 rounded-xl border border-line bg-bg-1 p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/leaderboard?view=${t.key}`}
            className={`flex-1 rounded-lg px-4 py-2 text-center text-sm transition-colors ${
              view === t.key ? "bg-bg-3 text-text-0" : "text-text-1 hover:text-text-0"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

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
      {/* header card: prize + countdown */}
      <div className="surface grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="label">{period.title || "Current period"}</p>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-gold">{topPrize}</p>
          <p className="mt-1 text-sm text-text-1">
            prize pool · wager with code{" "}
            <span className="font-mono font-semibold text-gold">{casino.code}</span> at {casino.name}
          </p>
          {sync && (
            <p className="mt-3 text-xs text-text-2">
              <RelativeTime iso={sync.cache_updated_at ?? sync.fetched_at} prefix="Updated " />
            </p>
          )}
        </div>
        <Countdown target={resetInstant} />
      </div>

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {closed.map((p) => (
          <Link key={p.id} href={`/leaderboard/${p.id}`} className="surface gold-border press block p-5">
            <p className="font-mono text-sm text-text-1">
              {p.start_at} → {p.end_at}
            </p>
            <p className="mt-2 text-lg">{p.title || "Monthly"}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-mono text-gold">{formatMoney(p.prize_pool)}</span>
              <span className="text-xs text-text-2">{p.winner_count} winners</span>
            </div>
          </Link>
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
