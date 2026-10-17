import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveRaces, getClosedRaces, getRaceEntries, countRaceEntries } from "@/lib/races";
import { isPageEnabled } from "@/lib/pages";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/Badge";
import { RaceRules, RaceTable, RaceLink, RaceTop, toPublicEntries } from "@/components/events/RaceParts";
import { ArtCard } from "@/components/ui/ArtCard";
import { Countdown } from "@/components/ui/Countdown";
import { Icon } from "@/components/ui/Icon";
import { iso } from "@/components/events/shared";
import { attempt, Unavailable, Pager, pageParam, UtcTime } from "@/components/events/shared";

const TONE: [string, string] = ["#ff8a3d", "#7a2a12"];

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

  const header = <PageHeader kicker="Compete" title="Races" lead="Short sprints. Most wagered in the window wins." icon="Flag" iconColor="gold" accent="gold" />;
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
          {withEntries.map(({ race, entries, total }) => {
            const live = race.status === "live";
            return (
              <section key={race.id} className="overflow-hidden rounded-[26px] border border-[#ff8a3d]/25 p-4 md:p-5"
                style={{ background: "linear-gradient(160deg, color-mix(in srgb, #ff8a3d 12%, var(--color-bg-1)), var(--color-bg-1) 60%)" }}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                  <div className="self-start">
                  <ArtCard tone={TONE} icon="Flag" headline={formatMoney(race.prize_pool)}
                    badge={{ label: live ? "Live" : race.status === "upcoming" ? "Upcoming" : "Final results soon", live }}
                    title={race.name} sub={<>{race.kind === "7d" ? "7-day race" : "24h race"} · <UtcTime value={race.end_at} /></>} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="label flex items-center gap-1.5 text-[#ffb37a]"><Icon name="Flag" className="h-3.5 w-3.5" /> {live ? "Race is on" : race.status === "upcoming" ? "Starting soon" : "Race over"}</p>
                      {race.status === "upcoming" && <Countdown target={iso(race.start_at)} label="Starts" doneText="Starting…" />}
                      {live && <Countdown target={iso(race.end_at)} label="Ends" doneText="Ending…" />}
                    </div>
                    {race.status === "upcoming" ? (
                      <p className="rounded-2xl border border-white/10 bg-bg-0/40 p-5 text-sm text-text-1">Wager with the code once it starts — the board fills up here live.</p>
                    ) : entries.length === 0 ? (
                      <p className="rounded-2xl border border-white/10 bg-bg-0/40 p-5 text-sm text-text-1">No qualifying wagers yet — get in early.</p>
                    ) : (
                      <>
                        <RaceTop entries={entries} />
                        <RaceTable entries={entries.filter((e) => e.rank > 3)} />
                        {total > entries.length && <RaceLink race={race} />}
                      </>
                    )}
                  </div>
                </div>
                <details className="group mt-4 rounded-2xl border border-white/10 bg-bg-0/30 px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-text-1 hover:text-text-0">
                    <Icon name="Info" className="h-4 w-4" /> Rules &amp; prize split <Icon name="ChevronDown" className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="pt-4"><RaceRules race={race} /></div>
                </details>
              </section>
            );
          })}
        </div>
      )}

      {archive.total > 0 && (
        <section>
          <SectionHeading kicker="Archive" title="Past races" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {archive.races.map((r) => (
              <ArtCard key={r.id} href={`/races/${r.id}`} tone={TONE} icon="Flag" headline={formatMoney(r.prize_pool)}
                badge={{ label: "Finished" }} title={r.name} sub={<UtcTime value={r.end_at} />} />
            ))}
          </div>
          <Pager base="/races" param="archive" page={archivePage} pages={Math.ceil(archive.total / ARCHIVE_PAGE)} />
        </section>
      )}
    </div>
  );
}
