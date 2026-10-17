import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { getPeriodById } from "@/lib/periods";
import { getFinalBoard } from "@/lib/board";
import { Icon } from "@/components/ui/Icon";
import { Podium } from "@/components/leaderboard/Podium";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ period: string }>;
}): Promise<Metadata> {
  const { period } = await params;
  return { title: `Period #${period} results` };
}

// Reads immutable final_results only (golden rule 5) — never recomputed.
export default async function ArchivePage({ params }: { params: Promise<{ period: string }> }) {
  const { period: periodParam } = await params;
  const id = Number(periodParam);
  if (!Number.isInteger(id)) notFound();

  const period = await getPeriodById(id);
  if (!period || period.status !== "closed") notFound();

  const rows = await getFinalBoard(period, 100);

  return (
    <div className="space-y-8">
      <Link href="/leaderboard?view=previous" className="inline-flex items-center gap-1 text-sm text-text-1 hover:text-text-0">
        <Icon name="ChevronLeft" className="h-4 w-4" /> All periods
      </Link>

      <section className="relative isolate overflow-hidden rounded-[26px] border border-gold/30 p-6 md:p-8"
        style={{ background: "linear-gradient(150deg, color-mix(in srgb, #f5c451 14%, var(--color-bg-1)), var(--color-bg-1) 60%)" }}>
        <div className="tunnel-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <Icon name="Medal" strokeWidth={1.2} aria-hidden className="pointer-events-none absolute -right-8 -top-6 h-64 w-64 rotate-12 text-gold/10" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="label inline-flex items-center gap-2 text-gold/90"><Icon name="Lock" className="h-3.5 w-3.5" /> Archived · final results</p>
            <h1 className="font-bang mt-3 text-4xl tracking-wide md:text-6xl">{period.title || "Monthly"}</h1>
            <p className="mt-2 font-mono text-sm text-text-1">{period.start_at} → {period.end_at}</p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-2xl border border-white/10 bg-bg-0/50 px-5 py-3 text-right backdrop-blur">
              <p className="label">Prize pool</p>
              <p className="font-bang text-3xl tracking-wide text-gold md:text-4xl">{formatMoney(period.prize_pool)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg-0/50 px-5 py-3 text-right backdrop-blur">
              <p className="label">Players</p>
              <p className="font-bang text-3xl tracking-wide md:text-4xl">{rows.length}</p>
            </div>
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="surface p-8 text-center text-text-1">No results were recorded for this period.</p>
      ) : (
        <>
          <Podium rows={rows} />
          <LeaderboardTable rows={rows} startRank={4} />
        </>
      )}
    </div>
  );
}
