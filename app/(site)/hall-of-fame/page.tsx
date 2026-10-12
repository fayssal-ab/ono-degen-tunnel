import type { Metadata } from "next";
import { getChampions, getBigHits, getGiveawayWins, getChallengeWins, getRaceWins, getTournamentWins, getGbWins } from "@/lib/hallOfFame";
import { attempt, Unavailable } from "@/components/events/shared";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Hall of Fame",
  description: "Champions, biggest hits and winners across the tunnel.",
};
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

function Row({ left, sub, right }: { left: string; sub?: string; right: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 px-4 py-3 last:border-0">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm text-text-0">{left}</p>
        {sub && <p className="truncate text-xs text-text-2">{sub}</p>}
      </div>
      <span className="shrink-0 font-mono text-sm text-gold">{right}</span>
    </div>
  );
}

function List({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  if (empty)
    return (
      <EmptyState icon="Trophy" title="Nothing here yet" line="This board fills in as seasons close and winners are crowned." />
    );
  return <div className="surface overflow-hidden">{children}</div>;
}

export default async function HallOfFamePage() {
  if (!(await isPageEnabled("/hall-of-fame"))) notFound();
  const header = (
    <PageHeader
      kicker="Legends"
      title="Hall of Fame"
      lead="The record books — champions, monster hits and everyone who's taken a prize home."
      right={<Icon name="Medal" className="h-8 w-8 text-gold" />}
    />
  );
  const result = await attempt(() => Promise.all([
    getChampions(), getBigHits(), getGiveawayWins(), getChallengeWins(), getRaceWins(), getTournamentWins(), getGbWins(),
  ]));
  if (!result.ok) return <div className="space-y-10">{header}<Unavailable what="The Hall of Fame" /></div>;
  const [champions, hits, giveaways, challenges, races, tournaments, gb] = result.data;

  return (
    <div className="space-y-10">
      {header}

      <Tabs
        tabs={[
          {
            key: "champions",
            label: "Champions",
            panel: (
              <List empty={champions.length === 0}>
                {champions.map((c, i) => (
                  <Row key={i} left={c.maskedName} sub={`${c.period_title} · ${formatMoney(c.wagered)} wagered`} right={formatMoney(c.prize)} />
                ))}
              </List>
            ),
          },
          {
            key: "races",
            label: "Race winners",
            panel: (
              <List empty={races.length === 0}>
                {races.map((r, i) => (
                  <Row key={i} left={r.maskedName} sub={`${r.race_name} · ${formatMoney(r.wagered)} wagered`} right={formatMoney(r.prize)} />
                ))}
              </List>
            ),
          },
          {
            key: "tournaments",
            label: "Tournament champions",
            panel: (
              <List empty={tournaments.length === 0}>
                {tournaments.map((t, i) => (
                  <Row key={i} left={t.champion} sub={`${t.title} · ${t.slot}`} right={t.prize || "—"} />
                ))}
              </List>
            ),
          },
          {
            key: "gb",
            label: "Balance guessers",
            panel: (
              <List empty={gb.length === 0}>
                {gb.map((g, i) => (
                  <Row key={i} left={g.maskedName} sub={`${g.title} · off by ${formatMoney(g.off_by)}`} right={g.prize || "—"} />
                ))}
              </List>
            ),
          },
          {
            key: "hits",
            label: "Biggest hits",
            panel: (
              <List empty={hits.length === 0}>
                {hits.map((h, i) => (
                  <Row key={i} left={h.slot_name} sub={h.hunt_title} right={`${h.multiplier.toFixed(0)}×`} />
                ))}
              </List>
            ),
          },
          {
            key: "giveaways",
            label: "Giveaway winners",
            panel: (
              <List empty={giveaways.length === 0}>
                {giveaways.map((g, i) => (
                  <Row key={i} left={g.maskedName} sub={g.giveaway_title} right={g.prize} />
                ))}
              </List>
            ),
          },
          {
            key: "challenges",
            label: "Challenge winners",
            panel: (
              <List empty={challenges.length === 0}>
                {challenges.map((c, i) => (
                  <Row key={i} left={c.maskedName} sub={`${c.slot_name} · ${Number(c.multiplier).toFixed(0)}×`} right={c.prize} />
                ))}
              </List>
            ),
          },
        ]}
      />
    </div>
  );
}
