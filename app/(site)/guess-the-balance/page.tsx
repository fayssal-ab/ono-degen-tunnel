import type { Metadata } from "next";
import { getCurrentRound, getLatestSettledRound, getRoundGuesses, getGbHistory } from "@/lib/guessBalance";
import { formatMoney } from "@/lib/money";
import { KICK_URL } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading, Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Guess the Balance",
  description: "Guess the final bonus-hunt balance in Kick chat. Closest wins.",
};
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

export default async function GuessBalancePage() {
  if (!(await isPageEnabled("/guess-the-balance"))) notFound();
  const round = (await getCurrentRound()) ?? (await getLatestSettledRound());
  const history = await getGbHistory();

  if (!round) {
    return (
      <div className="space-y-10">
        <PageHeader kicker="Watch" title="Guess the Balance" icon="Gauge" iconColor="cyan" lead="Call the final balance — closest wins." />
        <EmptyState
          icon="HelpCircle"
          title="No round open"
          line="Rounds open alongside bonus hunts on stream. Type !gb <amount> in Kick chat when one is live."
          cta={{ label: "Watch stream", href: "/stream" }}
        />
        {history.length > 0 && <GbHistory history={history} />}
      </div>
    );
  }

  const guesses = await getRoundGuesses(round);
  const settled = round.status === "settled";

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Watch"
        title={round.title || "Guess the Balance"}
        lead="Closest to the final balance wins. One guess per person — your latest counts."
        right={<Badge tone={settled ? "gold" : round.status === "open" ? "volt" : "neutral"}>{settled ? "Settled" : round.status === "open" ? "Open" : "Closed"}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="label">Prize</p>
          <p className="mt-1.5 font-mono text-lg font-bold text-gold">{round.prize || "—"}</p>
        </div>
        <div className="surface p-5">
          <p className="label">Guesses</p>
          <p className="mt-1.5 font-mono text-lg font-bold tabular-nums">{guesses.length}</p>
        </div>
        <div className="surface p-5">
          <p className="label">{settled ? "Final balance" : "Status"}</p>
          <p className="mt-1.5 font-mono text-lg font-bold tabular-nums">
            {settled && round.actual_balance != null ? formatMoney(round.actual_balance) : round.status === "open" ? "Open now" : "Awaiting result"}
          </p>
        </div>
      </div>

      {!settled && (
        <div className="surface flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Icon name="MessageSquare" className="h-5 w-5 text-volt" />
            <p className="text-sm text-text-1">
              Enter in Kick chat: <code className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-gold">!gb 25000</code>
            </p>
          </div>
          <a href={KICK_URL} target="_blank" rel="noreferrer" className="press inline-flex h-10 items-center gap-2 rounded-xl bg-volt px-4 text-sm font-semibold text-bg-0 hover:brightness-110">
            <Icon name="Radio" className="h-4 w-4" /> Open chat
          </a>
        </div>
      )}

      <section>
        <SectionHeading kicker={settled ? "Results" : "Live"} title={settled ? "Final standings" : "Guesses coming in"} />
        {guesses.length === 0 ? (
          <p className="surface p-6 text-sm text-text-1">No guesses yet. Be the first in chat.</p>
        ) : (
          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
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
                  <tr key={i} className={`border-b border-line/60 last:border-0 ${g.isWinner ? "bg-gold/10" : ""}`}>
                    {settled && <td className="px-4 py-2.5 font-mono text-gold">#{i + 1}</td>}
                    <td className="px-4 py-2.5 font-mono text-text-0">
                      {g.maskedName}
                      {g.isWinner && <span className="ml-2 text-xs text-gold">winner</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-0">{formatMoney(g.amount)}</td>
                    {settled && (
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-2">
                        {g.offBy != null ? formatMoney(g.offBy) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            <p className="mt-1 text-xs text-text-2">
              Final {h.actual_balance != null ? formatMoney(h.actual_balance) : "—"}
            </p>
            <p className="mt-3 text-sm">
              <span className="text-text-2">Winner </span>
              <span className="font-mono text-gold">{h.winner ?? "—"}</span>
              {h.prize && <span className="text-text-2"> · {h.prize}</span>}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
