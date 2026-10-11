import type { Metadata } from "next";
import { getLiveRaces, getRaceEntries } from "@/lib/races";
import { maskUsername } from "@/lib/mask";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Countdown } from "@/components/ui/Countdown";

export const metadata: Metadata = {
  title: "Races",
  description: "Short wager sprints — most wagered in the window wins.",
};
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

export default async function RacesPage() {
  if (!(await isPageEnabled("/races"))) notFound();
  const races = await getLiveRaces();

  if (races.length === 0) {
    return (
      <div className="space-y-10">
        <PageHeader kicker="Compete" title="Races" icon="Flag" iconColor="electric" lead="24h & weekly sprints for the pot." />
        <EmptyState
          icon="Flag"
          title="No race running"
          line="Races spin up around big streams. The next one will appear here with a live countdown."
          cta={{ label: "Join Discord", href: "/#play" }}
        />
      </div>
    );
  }

  const withEntries = await Promise.all(
    races.map(async (race) => ({
      race,
      entries: (await getRaceEntries(race.id, 5)).map((e) => ({
        rank: e.rank,
        name: maskUsername(e.username),
        wagered: e.wagered,
        prize: e.prize,
      })),
    }))
  );

  return (
    <div className="space-y-10">
      <PageHeader kicker="Compete" title="Races" lead="Short sprints. Most wagered in the window wins — snapshots update every 10 minutes." />

      <div className="space-y-6">
        {withEntries.map(({ race, entries }) => (
          <div key={race.id} className="surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl">{race.name}</h2>
                  <Badge tone="volt">{race.kind}</Badge>
                </div>
                <p className="mt-1 font-mono text-sm text-gold">{formatMoney(race.prize_pool)} pool</p>
              </div>
              <Countdown target={new Date(race.end_at).toISOString()} />
            </div>

            {entries.length === 0 ? (
              <p className="pt-5 text-sm text-text-1">No qualifying wagers yet — get in early.</p>
            ) : (
              <ol className="mt-5 space-y-2">
                {entries.map((e) => (
                  <li key={e.rank} className="flex items-center gap-4 rounded-xl border border-line bg-bg-1 px-4 py-3">
                    <span className={`font-mono text-sm font-bold ${e.rank <= 3 ? "text-gold" : "text-text-2"}`}>#{e.rank}</span>
                    <span className="flex-1 truncate font-mono text-sm text-text-0">{e.name}</span>
                    <span className="font-mono text-sm tabular-nums text-text-1">{formatMoney(e.wagered)}</span>
                    {Number(e.prize) > 0 && <span className="font-mono text-sm tabular-nums text-gold">{formatMoney(e.prize)}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
