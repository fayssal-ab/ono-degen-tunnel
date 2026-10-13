import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicAwards } from "@/lib/prizes";
import { isPageEnabled } from "@/lib/pages";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { attempt, Unavailable, Pager, pageParam, UtcTime } from "@/components/events/shared";

export const metadata: Metadata = {
  title: "Prizes awarded",
  description: "Every prize paid out — tournaments, giveaways, races and more.",
};
export const dynamic = "force-dynamic";
const PAGE = 50;
const SOURCE = { tournament: "Tournament", giveaway: "Giveaway", race: "Race", leaderboard: "Leaderboard", gb: "Guess the Balance", challenge: "Challenge", manual: "Stream" } as const;
const PLACE = ["", "🥇", "🥈", "🥉"];

export default async function PrizesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isPageEnabled("/prizes"))) notFound();
  const page = pageParam((await searchParams).page);
  const header = <PageHeader kicker="Rewards" title="Prizes awarded" lead="Every prize confirmed as paid to its winner." />;
  const result = await attempt(() => getPublicAwards(PAGE, (page - 1) * PAGE));
  if (!result.ok) return <div className="space-y-10">{header}<Unavailable what="Prizes" /></div>;
  const { awards, total, sum } = result.data;

  return (
    <div className="space-y-10">
      {header}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface p-6"><p className="label">Total paid out</p><p className="mt-2 font-display text-4xl font-extrabold text-gold">{formatMoney(sum)}</p></div>
        <div className="surface p-6"><p className="label">Prizes paid</p><p className="mt-2 font-display text-4xl font-extrabold">{total.toLocaleString("en-US")}</p></div>
      </div>
      {awards.length === 0 ? (
        <EmptyState icon="Gift" title="No prizes yet" line="Win a tournament, a giveaway or a race — every confirmed payout shows up here." />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label px-4 py-3 font-normal">Winner</th>
                <th className="label px-4 py-3 font-normal">Event</th>
                <th className="label px-4 py-3 text-right font-normal">Prize</th>
                <th className="label px-4 py-3 text-right font-normal">Paid</th>
              </tr>
            </thead>
            <tbody>
              {awards.map((a) => (
                <tr key={a.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-text-0">{a.source === "tournament" && a.place ? `${PLACE[a.place] ?? ""} ` : ""}{a.winner}</td>
                  <td className="px-4 py-2.5"><Badge>{SOURCE[a.source]}</Badge> <span className="text-text-1">{a.title}</span></td>
                  <td className="px-4 py-2.5 text-right font-mono text-gold">{a.amount != null ? formatMoney(a.amount) : a.prize_label || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-text-2"><UtcTime value={a.paid_at} />{a.received && <span className="mt-0.5 block text-volt">✓ confirmed by winner</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager base="/prizes" page={page} pages={Math.ceil(total / PAGE)} />
    </div>
  );
}
