import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeaturedRound, getRoundGuesses, countRoundGuesses, getGbHistory } from "@/lib/guessBalance";
import { isPageEnabled } from "@/lib/pages";
import { formatMoney } from "@/lib/money";
import { KICK_URL } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Countdown } from "@/components/ui/Countdown";
import { attempt, Unavailable, Pager, pageParam, iso } from "@/components/events/shared";
import { ArtCard } from "@/components/ui/ArtCard";
import { CopyChip } from "@/components/ui/CopyChip";

const TONE: [string, string] = ["#22d3ee", "#0b4a6b"];

export const metadata: Metadata = {
  title: "Guess the Balance",
  description: "Guess the final bonus-hunt balance in Kick chat. Closest wins.",
};
export const dynamic = "force-dynamic";
const PAGE = 50;

function Rules({ linked }: { linked: boolean }) {
  return (
    <details className="group surface p-5 text-sm text-text-1">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-text-1 hover:text-text-0">
        <Icon name="Info" className="h-4 w-4" /> How it works <Icon name="ChevronDown" className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>Type <code className="text-gold">!gb 12345.67</code> in Kick chat — the whole message, a plain amount (commas like 25,000 are fine).</li>
        <li>One guess per Kick account. Change your mind as often as you like: your latest guess sent before the cutoff counts.</li>
        <li>{linked ? "Guesses close automatically the moment the first bonus is opened." : "Guesses close when the team closes the round or at the deadline."} Messages that arrive after the cutoff are ignored.</li>
        <li>Closest to the final balance wins. On an exact tie, whoever locked in their final guess first wins.</li>
      </ul>
    </details>
  );
}

export default async function GuessBalancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isPageEnabled("/guess-the-balance"))) notFound();
  const page = pageParam((await searchParams).page);
  const result = await attempt(async () => {
    const round = await getFeaturedRound();
    const [guesses, total, history] = await Promise.all([
      round ? getRoundGuesses(round, PAGE, (page - 1) * PAGE) : Promise.resolve([]),
      round ? countRoundGuesses(round.id) : Promise.resolve(0),
      getGbHistory(),
    ]);
    return { round, guesses, total, history };
  });

  const header = <PageHeader kicker="Watch" title="Guess the Balance" lead="Call the final balance — closest wins." icon="Gauge" iconColor="cyan" />;
  if (!result.ok) return <div className="space-y-10">{header}<Unavailable what="Guess the Balance" /></div>;
  const { round, guesses, total, history } = result.data;

  if (!round) {
    return (
      <div className="space-y-10">
        {header}
        <EmptyState icon="HelpCircle" title="No round open" line="Rounds open alongside bonus hunts on stream. Type !gb <amount> in Kick chat when one is live." cta={{ label: "Watch stream", href: "/stream" }} />
        <Rules linked />
        {history.length > 0 && <GbHistory history={history} />}
      </div>
    );
  }

  const settled = round.status === "settled";
  const winner = settled ? guesses.find((g) => g.isWinner) ?? null : null;
  const offset = (page - 1) * PAGE;

  return (
    <div className="space-y-10">
      <PageHeader kicker="Watch" title={round.title || "Guess the Balance"} watermark="Guess" icon="Gauge" iconColor="cyan"
        lead="Closest to the final balance wins. One guess per person — your latest counts." />

      <section className="relative isolate overflow-hidden rounded-[26px] border border-cyan/30 p-6 md:p-8"
        style={{ background: "linear-gradient(150deg, color-mix(in srgb, #22d3ee 14%, var(--color-bg-1)), var(--color-bg-1) 55%, color-mix(in srgb, #0ea5e9 10%, var(--color-bg-1)))" }}>
        <div className="tunnel-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <Icon name="Gauge" strokeWidth={1.2} aria-hidden className="pointer-events-none absolute -right-10 -top-8 h-72 w-72 rotate-12 text-cyan/10" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className={`label inline-flex items-center gap-2 ${round.status === "open" ? "text-volt" : settled ? "text-gold" : "text-text-1"}`}>
              {round.status === "open" && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-volt" /></span>}
              {settled ? "Settled" : round.status === "open" ? "Guesses open" : "Closed — awaiting result"}
            </p>
            <p className="label mt-4">{settled ? "Final balance" : "Final balance"}</p>
            <p className="font-bang text-6xl tracking-wide text-cyan md:text-8xl [text-shadow:0_0_40px_rgba(34,211,238,0.35)]">
              {settled && round.actual_balance != null ? formatMoney(round.actual_balance) : "$ ? ? ?"}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="rounded-2xl border border-white/10 bg-bg-0/50 px-4 py-2.5 backdrop-blur">
                <p className="label">Prize</p><p className="font-mono text-lg font-bold text-gold">{round.prize || "—"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-bg-0/50 px-4 py-2.5 backdrop-blur">
                <p className="label">Players</p><p className="font-mono text-lg font-bold tabular-nums">{total.toLocaleString("en-US")}</p>
              </div>
              {round.status === "open" && round.deadline_at && (
                <div className="rounded-2xl border border-white/10 bg-bg-0/50 px-4 py-2.5 backdrop-blur">
                  <Countdown target={iso(round.deadline_at)} label="Closes" doneText="Closing…" />
                </div>
              )}
            </div>
          </div>

          {round.status === "open" ? (
            <div className="rounded-2xl border border-cyan/30 bg-bg-0/60 p-5 backdrop-blur lg:w-80">
              <p className="label flex items-center gap-1.5"><Icon name="MessageSquare" className="h-3.5 w-3.5 text-volt" /> Type in Kick chat</p>
              <div className="mt-3"><CopyChip value="!gb 25000" /></div>
              <p className="mt-2 text-xs text-text-2">Your number instead of 25000. Latest guess before the cutoff counts.</p>
              <a href={KICK_URL} target="_blank" rel="noreferrer" className="press mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-volt text-sm font-bold text-bg-0 hover:brightness-110">
                <Icon name="Radio" className="h-4 w-4" /> Open chat
              </a>
            </div>
          ) : settled ? (
            <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5 lg:w-80">
              <p className="label flex items-center gap-1.5 text-gold"><Icon name="Trophy" className="h-3.5 w-3.5" /> Winner</p>
              {winner ? (
                <>
                  <p className="mt-2 truncate font-mono text-2xl font-bold text-gold">{winner.maskedName}</p>
                  <p className="mt-1 text-sm text-text-1">guessed {formatMoney(winner.amount)} · off by {formatMoney(winner.offBy ?? "0")}</p>
                </>
              ) : <p className="mt-2 text-sm text-text-1">{page === 1 ? "No guesses were entered for this round." : "See page 1 for the winner."}</p>}
            </div>
          ) : null}
        </div>
      </section>

      <Rules linked={round.hunt_id != null} />

      <section>
        <SectionHeading kicker={settled ? "Results" : "Live"} title={settled ? "Final standings" : "Latest guesses"} />
        {guesses.length === 0 ? (
          <p className="surface p-6 text-sm text-text-1">{total === 0 ? "No guesses yet. Be the first in chat." : "No guesses on this page."}</p>
        ) : (
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {settled && <th className="label px-4 py-3 font-normal">Rank</th>}
                  <th className="label px-4 py-3 font-normal">Player</th>
                  <th className="label px-4 py-3 text-right font-normal">Guess</th>
                  {settled && <th className="label px-4 py-3 text-right font-normal">Off by</th>}
                </tr>
              </thead>
              <tbody>
                {guesses.map((g, i) => (
                  <tr key={offset + i} className={`border-b border-line/60 last:border-0 ${g.isWinner ? "bg-gold/10" : ""}`}>
                    {settled && <td className="px-4 py-2.5 font-mono text-gold">#{offset + i + 1}</td>}
                    <td className="px-4 py-2.5 font-mono text-text-0">
                      {g.maskedName}
                      {g.isWinner && <span className="ml-2 text-xs text-gold">winner</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-0">{formatMoney(g.amount)}</td>
                    {settled && <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-2">{g.offBy != null ? formatMoney(g.offBy) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/guess-the-balance" page={page} pages={Math.ceil(total / PAGE)} />
      </section>

      {history.length > 0 && <GbHistory history={history} />}
    </div>
  );
}

function GbHistory({ history }: { history: Awaited<ReturnType<typeof getGbHistory>> }) {
  return (
    <section>
      <SectionHeading kicker="Archive" title="Past rounds" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {history.map((h) => (
          <ArtCard key={h.id} tone={TONE} icon="Gauge" headline={h.actual_balance != null ? formatMoney(h.actual_balance) : "—"}
            badge={{ label: `${h.guesses} player${h.guesses === 1 ? "" : "s"}` }} title={h.title || "Round"}
            sub={<>Winner <span className="font-mono text-gold">{h.winner ?? "—"}</span>{h.off_by != null && <> · off by {formatMoney(h.off_by)}</>}</>}
            footer={h.prize || undefined} />
        ))}
      </div>
    </section>
  );
}
