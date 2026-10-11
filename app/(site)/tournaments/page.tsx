import type { Metadata } from "next";
import { getLiveTournament, getBracket, type Bracket, type Match } from "@/lib/tournaments";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "8-slot slot-battle bracket. Highest multiplier advances.",
};
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

const ROUND_LABEL: Record<number, string> = { 1: "Quarter-finals", 2: "Semi-finals", 3: "Final" };

export default async function TournamentsPage() {
  if (!(await isPageEnabled("/tournaments"))) notFound();
  const t = await getLiveTournament();

  if (!t) {
    return (
      <div className="space-y-10">
        <PageHeader kicker="Compete" title="Tournaments" lead="Eight slots. Highest multiplier wins." />
        <EmptyState
          icon="Swords"
          title="No tournament live"
          line="Slot battles run on stream. The bracket shows up here the moment one kicks off."
          cta={{ label: "Watch stream", href: "/stream" }}
        />
      </div>
    );
  }

  const bracket = await getBracket(t);

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Compete"
        title={t.title || "Slot Battle"}
        lead="Highest win multiplier advances each round."
        right={
          <div className="flex items-center gap-2">
            {t.prize && <Badge tone="gold">{t.prize}</Badge>}
            <Badge tone={t.status === "live" ? "volt" : "neutral"}>{t.status === "live" ? "Live" : "Finished"}</Badge>
          </div>
        }
      />

      {/* bracket */}
      <div className="surface overflow-x-auto p-6">
        <div className="flex min-w-[720px] items-stretch gap-6">
          {[1, 2, 3].map((round) => (
            <div key={round} className="flex flex-1 flex-col justify-around gap-4">
              <p className="label text-center">{ROUND_LABEL[round]}</p>
              {(bracket.rounds[round] ?? []).map((m) => (
                <BracketMatch key={`${round}-${m.match_index}`} match={m} bracket={bracket} />
              ))}
            </div>
          ))}

          {/* champion */}
          <div className="flex flex-col justify-center gap-4">
            <p className="label text-center">Champion</p>
            <div className="gold-border surface flex min-w-44 flex-col items-center gap-2 p-5 text-center">
              <Icon name="Crown" className="h-6 w-6 text-gold" />
              {bracket.championSeed != null ? (
                <span className="font-display text-base font-bold text-gold">
                  {bracket.competitors.get(bracket.championSeed)?.name ?? `Seed ${bracket.championSeed}`}
                </span>
              ) : (
                <span className="text-sm text-text-2">TBD</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* seed list */}
      <section>
        <p className="label mb-3">The eight</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from(bracket.competitors.values()).map((c) => (
            <div key={c.seed} className="surface flex items-center gap-2 p-3">
              <span className="font-mono text-xs text-text-2">#{c.seed}</span>
              <span className="truncate text-sm text-text-0">{c.name}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Side({ bracket, seed, score, won }: { bracket: Bracket; seed: number | null; score: string | null; won: boolean }) {
  const name = seed != null ? bracket.competitors.get(seed)?.name ?? `Seed ${seed}` : "TBD";
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 ${won ? "text-gold" : "text-text-1"}`}>
      <span className="truncate text-sm">{name}</span>
      <span className="font-mono text-xs tabular-nums">{score != null ? `${Number(score).toFixed(0)}×` : "—"}</span>
    </div>
  );
}

function BracketMatch({ match, bracket }: { match: Match; bracket: Bracket }) {
  const aWon = match.winner_seed != null && match.winner_seed === match.a.seed;
  const bWon = match.winner_seed != null && match.winner_seed === match.b.seed;
  return (
    <div className={`overflow-hidden rounded-xl border ${match.winner_seed != null ? "border-gold/40" : "border-line"} bg-bg-2 divide-y divide-line`}>
      <Side bracket={bracket} seed={match.a.seed} score={match.a.score} won={aWon} />
      <Side bracket={bracket} seed={match.b.seed} score={match.b.score} won={bWon} />
    </div>
  );
}
