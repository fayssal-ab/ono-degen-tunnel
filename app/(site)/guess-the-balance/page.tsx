import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeaturedRound, getRoundGuesses, countRoundGuesses, getGbHistory } from "@/lib/guessBalance";
import { isPageEnabled } from "@/lib/pages";
import { formatMoney } from "@/lib/money";
import { KICK_URL } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading, Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Countdown } from "@/components/ui/Countdown";
import { attempt, Unavailable, Pager, pageParam, iso } from "@/components/events/shared";

export const metadata: Metadata = {
  title: "Guess the Balance",
  description: "Guess the final bonus-hunt balance in Kick chat. Closest wins.",
};
export const dynamic = "force-dynamic";
const PAGE = 50;

function Rules({ linked }: { linked: boolean }) {
  return (
    <section className="surface p-6 text-sm text-text-1">
      <p className="label mb-2">Rules</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Type <code className="text-gold">!gb 12345.67</code> in Kick chat — the whole message, a plain amount (commas like 25,000 are fine).</li>
        <li>One guess per Kick account. Change your mind as often as you like: your latest guess sent before the cutoff counts.</li>
        <li>{linked ? "Guesses close automatically the moment the first bonus is opened." : "Guesses close when the team closes the round or at the deadline."} Messages that arrive after the cutoff are ignored.</li>
        <li>Closest to the final balance wins. On an exact tie, whoever locked in their final guess first wins.</li>
      </ul>
    </section>
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

  const header = <PageHeader kicker="Watch" title="Guess the Balance" lead="Call the final balance — closest wins." />;
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
      <PageHeader
        kicker="Watch"
        title={round.title || "Guess the Balance"}
        lead="Closest to the final balance wins. One guess per person — your latest counts."
        right={<Badge tone={settled ? "gold" : round.status === "open" ? "volt" : "neutral"}>{settled ? "Settled" : round.status === "open" ? "Open" : "Closed — awaiting result"}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="label">Prize</p>
          <p className="mt-1.5 font-mono text-lg font-bold text-gold">{round.prize || "—"}</p>
        </div>
        <div className="surface p-5">
          <p className="label">Players</p>
          <p className="mt-1.5 font-mono text-lg font-bold tabular-nums">{total.toLocaleString("en-US")}</p>
        </div>
        <div className="surface p-5">
          <p className="label">{settled ? "Final balance" : round.status === "open" && round.deadline_at ? "Closes in" : "Status"}</p>
          {settled && round.actual_balance != null ? (
            <p className="mt-1.5 font-mono text-lg font-bold tabular-nums">{formatMoney(round.actual_balance)}</p>
          ) : round.status === "open" && round.deadline_at ? (
            <Countdown target={iso(round.deadline_at)} label="Closes" doneText="Closing…" className="mt-1.5" />
          ) : (
            <p className="mt-1.5 font-mono text-lg font-bold">{round.status === "open" ? "Open now" : "Awaiting result"}</p>
          )}
        </div>
      </div>

      {settled && (
        <div className="surface gold-border flex flex-wrap items-center gap-3 p-5">
          <Icon name="Trophy" className="h-5 w-5 text-gold" />
          {winner ? (
            <p className="text-sm text-text-0">Winner <span className="font-mono text-gold">{winner.maskedName}</span> guessed {formatMoney(winner.amount)} — off by {formatMoney(winner.offBy ?? "0")}.</p>
          ) : page === 1 ? <p className="text-sm text-text-1">No guesses were entered for this round.</p> : <p className="text-sm text-text-1">See page 1 for the winner.</p>}
        </div>
      )}

      {round.status === "open" && (
        <div className="surface flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Icon name="MessageSquare" className="h-5 w-5 text-volt" />
            <p className="text-sm text-text-1">Enter in Kick chat: <code className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-gold">!gb 25000</code></p>
          </div>
          <a href={KICK_URL} target="_blank" rel="noreferrer" className="press inline-flex h-10 items-center gap-2 rounded-xl bg-volt px-4 text-sm font-semibold text-bg-0 hover:brightness-110">
            <Icon name="Radio" className="h-4 w-4" /> Open chat
          </a>
        </div>
      )}

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {history.map((h) => (
          <div key={h.id} className="surface p-5">
            <p className="text-sm text-text-0">{h.title || "Round"}</p>
            <p className="mt-1 text-xs text-text-2">Final {h.actual_balance != null ? formatMoney(h.actual_balance) : "—"} · {h.guesses} players</p>
            <p className="mt-3 text-sm">
              <span className="text-text-2">Winner </span>
              <span className="font-mono text-gold">{h.winner ?? "—"}</span>
              {h.off_by != null && <span className="text-text-2"> · off by {formatMoney(h.off_by)}</span>}
            </p>
            {h.prize && <p className="mt-1 text-xs text-text-2">{h.prize}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
