import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFeaturedTournament, getTournamentById, getFinishedTournaments, getBracket, type Bracket, type Match } from "@/lib/tournaments";
import { isPageEnabled } from "@/lib/pages";
import { d } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, SectionHeading } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Countdown } from "@/components/ui/Countdown";
import { attempt, Unavailable, iso, UtcTime } from "@/components/events/shared";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "8-slot slot-battle bracket. Highest multiplier advances.",
};
export const dynamic = "force-dynamic";

const ROUND_LABEL: Record<number, string> = { 1: "Quarter-finals", 2: "Semi-finals", 3: "Final" };
const STATUS = { live: { tone: "volt", label: "Live" }, upcoming: { tone: "gold", label: "Upcoming" }, finished: { tone: "neutral", label: "Finished" } } as const;

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isPageEnabled("/tournaments"))) notFound();
  const idParam = Number((await searchParams).id);
  const requested = Number.isInteger(idParam) && idParam > 0 ? idParam : null;

  const result = await attempt(async () => {
    const t = requested ? await getTournamentById(requested) : await getFeaturedTournament();
    const bracket = t ? await getBracket(t) : null;
    const archive = await getFinishedTournaments(12);
    return { t, bracket, archive };
  });

  const header = (extra?: React.ReactNode, title = "Tournaments") => (
    <PageHeader kicker="Compete" title={title} lead="Eight slots. Highest win multiplier advances each round." right={extra} />
  );
  if (!result.ok) return <div className="space-y-10">{header()}<Unavailable what="Tournaments" /></div>;
  const { t, bracket, archive } = result.data;
  if (requested && !t) notFound();

  return (
    <div className="space-y-10">
      {t && bracket ? (
        <>
          {header(
            <div className="flex items-center gap-2">
              {t.prize && <Badge tone="gold">{t.prize}</Badge>}
              <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
            </div>,
            t.title || "Slot Battle"
          )}
          {requested && <Link href="/tournaments" className="inline-flex items-center gap-1 text-sm text-text-1 hover:text-text-0"><Icon name="ChevronLeft" className="h-4 w-4" /> Current tournament</Link>}

          {t.status === "upcoming" && (
            <div className="surface flex flex-wrap items-center justify-between gap-4 p-6">
              <p className="text-sm text-text-1">The bracket is set. Matches are played live on stream.</p>
              {t.starts_at && <Countdown target={iso(t.starts_at)} label="Starts" doneText="Starting soon" />}
            </div>
          )}

          {t.status !== "upcoming" && <BracketView bracket={bracket} />}

          <section>
            <p className="label mb-3">The eight</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from(bracket.competitors.values()).map((c) => (
                <div key={c.seed} className="surface flex items-center gap-2 p-3">
                  <span className="font-mono text-xs text-text-2">#{c.seed}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-text-0">{c.name}</span>
                    {c.provider && <span className="block truncate text-xs text-text-2">{c.provider}</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="surface p-6 text-sm text-text-1">
            <p className="label mb-2">Rules</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Seeds 1–8 meet in the quarter-finals as 1v8, 4v5, 2v7, 3v6.</li>
              <li>Each slot gets its bonus played on stream; the higher win multiplier advances.</li>
              <li>An exact tie is replayed — the replay result decides the match.</li>
              <li>Results are entered by the team from the stream and are final once the next round starts.</li>
            </ul>
          </section>
        </>
      ) : (
        <>
          {header()}
          <EmptyState icon="Swords" title="No tournament live" line="Slot battles run on stream. The bracket shows up here the moment one is announced." cta={{ label: "Watch stream", href: "/stream" }} />
        </>
      )}

      {archive.length > 0 && (
        <section>
          <SectionHeading kicker="Archive" title="Past tournaments" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archive.map((a) => (
              <Link key={a.id} href={`/tournaments?id=${a.id}`} className="surface block p-5 hover:border-gold/40">
                <p className="text-sm text-text-0">{a.title || "Slot battle"}</p>
                <p className="mt-1 text-xs text-text-2"><UtcTime value={a.finished_at} /></p>
                <p className="mt-3 text-sm"><Icon name="Crown" className="mr-1 inline h-4 w-4 text-gold" /><span className="text-gold">{a.champion ?? "—"}</span></p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function fmt(score: string | null) {
  if (score == null) return "—";
  return `${d(score).toDecimalPlaces(2).toString()}×`;
}

function Side({ bracket, seed, score, won }: { bracket: Bracket; seed: number | null; score: string | null; won: boolean }) {
  const name = seed != null ? bracket.competitors.get(seed)?.name ?? `Seed ${seed}` : "TBD";
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 ${won ? "text-gold" : "text-text-1"}`}>
      <span className="truncate text-sm">{name}</span>
      <span className="font-mono text-xs tabular-nums">{fmt(score)}</span>
    </div>
  );
}

function BracketMatch({ match, bracket }: { match: Match; bracket: Bracket }) {
  const aWon = match.winner_seed != null && match.winner_seed === match.a.seed;
  const bWon = match.winner_seed != null && match.winner_seed === match.b.seed;
  return (
    <div className={`overflow-hidden rounded-xl border ${match.winner_seed != null ? "border-gold/40" : "border-line"} divide-y divide-line bg-bg-2`}>
      <Side bracket={bracket} seed={match.a.seed} score={match.a.score} won={aWon} />
      <Side bracket={bracket} seed={match.b.seed} score={match.b.score} won={bWon} />
    </div>
  );
}

function Champion({ bracket }: { bracket: Bracket }) {
  return (
    <div className="gold-border surface flex min-w-44 flex-col items-center gap-2 p-5 text-center">
      <Icon name="Crown" className="h-6 w-6 text-gold" />
      {bracket.championSeed != null ? (
        <span className="font-display text-base font-bold text-gold">{bracket.competitors.get(bracket.championSeed)?.name ?? `Seed ${bracket.championSeed}`}</span>
      ) : (
        <span className="text-sm text-text-2">TBD</span>
      )}
    </div>
  );
}

function BracketView({ bracket }: { bracket: Bracket }) {
  return (
    <>
      {/* desktop: horizontal bracket */}
      <div className="surface hidden p-6 md:block">
        <div className="flex items-stretch gap-6">
          {[1, 2, 3].map((round) => (
            <div key={round} className="flex flex-1 flex-col justify-around gap-4">
              <p className="label text-center">{ROUND_LABEL[round]}</p>
              {(bracket.rounds[round] ?? []).map((m) => <BracketMatch key={`${round}-${m.match_index}`} match={m} bracket={bracket} />)}
            </div>
          ))}
          <div className="flex flex-col justify-center gap-4">
            <p className="label text-center">Champion</p>
            <Champion bracket={bracket} />
          </div>
        </div>
      </div>
      {/* mobile: rounds stacked */}
      <div className="space-y-6 md:hidden">
        <Champion bracket={bracket} />
        {[3, 2, 1].map((round) => (
          <section key={round}>
            <p className="label mb-2">{ROUND_LABEL[round]}</p>
            <div className="space-y-2">
              {(bracket.rounds[round] ?? []).map((m) => <BracketMatch key={`${round}-${m.match_index}`} match={m} bracket={bracket} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
