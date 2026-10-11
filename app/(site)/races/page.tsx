import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveRaces, getClosedRaces, getRaceEntries, countRaceEntries } from "@/lib/races";
import { isPageEnabled } from "@/lib/pages";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/Badge";
import { RaceHeader, RaceRules, RaceTable, RaceLink, toPublicEntries } from "@/components/events/RaceParts";
import { attempt, Unavailable, Pager, pageParam, UtcTime } from "@/components/events/shared";

export const metadata: Metadata = {
  title: "Races",
  description: "Short wager sprints — most wagered in the window wins.",
};
export const dynamic = "force-dynamic";

const ARCHIVE_PAGE = 9;

export default async function RacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isPageEnabled("/races"))) notFound();
  const archivePage = pageParam((await searchParams).archive);
  const result = await attempt(async () => {
    const races = await getActiveRaces();
    const withEntries = await Promise.all(races.map(async (race) => ({
      race,
      entries: race.status === "upcoming" ? [] : toPublicEntries(await getRaceEntries(race.id, 10)),
      total: race.status === "upcoming" ? 0 : await countRaceEntries(race.id),
    })));
    const archive = await getClosedRaces(ARCHIVE_PAGE, (archivePage - 1) * ARCHIVE_PAGE);
    return { withEntries, archive };
  });

  const header = <PageHeader kicker="Compete" title="Races" lead="Short sprints. Most wagered in the window wins." />;
  if (!result.ok) return <div className="space-y-10">{header}<Unavailable what="Races" /></div>;
  const { withEntries, archive } = result.data;

  return (
    <div className="space-y-10">
      {header}

      {withEntries.length === 0 ? (
        <EmptyState
          icon="Flag"
          title="No race running"
          line="Races spin up around big streams. The next one will appear here with a live countdown."
          cta={{ label: "Watch stream", href: "/stream" }}
        />
      ) : (
        <div className="space-y-6">
          {withEntries.map(({ race, entries, total }) => (
            <div key={race.id} className="surface space-y-5 p-6">
              <RaceHeader race={race} />
              <RaceRules race={race} />
              {race.status !== "upcoming" && (entries.length === 0 ? (
                <p className="text-sm text-text-1">No qualifying wagers yet — get in early.</p>
              ) : (
                <div className="space-y-3">
                  <RaceTable entries={entries} />
                  {total > entries.length && <RaceLink race={race} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {archive.total > 0 && (
        <section>
          <SectionHeading kicker="Archive" title="Past races" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archive.races.map((r) => (
              <Link key={r.id} href={`/races/${r.id}`} className="surface block p-5 hover:border-gold/40">
                <p className="text-sm text-text-0">{r.name}</p>
                <p className="mt-1 text-xs text-text-2"><UtcTime value={r.end_at} /></p>
                <p className="mt-3 font-mono text-sm text-gold">{formatMoney(r.prize_pool)} pool</p>
              </Link>
            ))}
          </div>
          <Pager base="/races" param="archive" page={archivePage} pages={Math.ceil(archive.total / ARCHIVE_PAGE)} />
        </section>
      )}
    </div>
  );
}
