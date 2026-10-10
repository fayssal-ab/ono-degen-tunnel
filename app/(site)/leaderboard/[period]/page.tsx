import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { getPeriodById } from "@/lib/periods";
import { getFinalBoard } from "@/lib/board";
import { Badge } from "@/components/ui/Badge";
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Archived · frozen</p>
          <h1 className="mt-1 text-2xl md:text-3xl">{period.title || "Monthly"} results</h1>
          <p className="mt-1 font-mono text-sm text-text-1">
            {period.start_at} → {period.end_at}
          </p>
        </div>
        <Badge tone="gold">{formatMoney(period.prize_pool)} pool</Badge>
      </div>

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
