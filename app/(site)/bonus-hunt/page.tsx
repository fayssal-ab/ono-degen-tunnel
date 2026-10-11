import type { Metadata } from "next";
import { getActiveHunt, getHuntEntries, computeHuntStats, getHuntHistory } from "@/lib/bonusHunt";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading, Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SlotThumb } from "@/components/ui/SlotThumb";
import { attempt, Unavailable } from "@/components/events/shared";
import { d } from "@/lib/money";

export const metadata: Metadata = {
  title: "Bonus Hunt",
  description: "Live bonus hunt — bonuses collected, break-even multiplier, best and worst hits.",
};
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="surface p-4">
      <p className="label">{label}</p>
      <p className={`mt-1.5 font-mono text-lg font-bold tabular-nums ${tone ?? "text-text-0"}`}>{value}</p>
    </div>
  );
}

export default async function BonusHuntPage() {
  if (!(await isPageEnabled("/bonus-hunt"))) notFound();
  const result = await attempt(async () => {
    const hunt = await getActiveHunt();
    const history = await getHuntHistory();
    const entries = hunt ? await getHuntEntries(hunt.id) : [];
    return { hunt, history, entries };
  });
  if (!result.ok) {
    return (
      <div className="space-y-10">
        <PageHeader kicker="Watch" title="Bonus Hunt" lead="Bonuses tracked live, to the dollar." />
        <Unavailable what="The bonus hunt" />
      </div>
    );
  }
  const { hunt, history, entries } = result.data;

  if (!hunt) {
    return (
      <div className="space-y-10">
        <PageHeader kicker="Watch" title="Bonus Hunt" lead="Bonuses tracked live, to the dollar." />
        <EmptyState
          icon="Search"
          title="No hunt running"
          line="There's no active bonus hunt right now. They kick off live on stream — follow to catch the next one."
          cta={{ label: "Watch stream", href: "/stream" }}
        />
        {history.length > 0 && <History history={history} />}
      </div>
    );
  }

  const stats = computeHuntStats(hunt.start_balance, entries);
  const progress = stats.count > 0 ? stats.opened / stats.count : 0;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Watch"
        title={hunt.title || "Bonus Hunt"}
        lead="Live, updating as each bonus is opened."
        right={<Badge tone="volt">{stats.complete ? "All opened" : hunt.opening_started_at ? "Opening" : "Collecting"}</Badge>}
      />

      {/* stats grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Start balance" value={formatMoney(hunt.start_balance)} />
        <Stat label="Sum of bets" value={formatMoney(stats.sumBets)} />
        <Stat label={stats.complete ? "Final balance" : "Payouts so far"} value={formatMoney(stats.currentWin)} tone="text-volt" />
        {stats.complete ? (
          <Stat
            label="Profit vs start"
            value={`${d(stats.profit ?? "0").isNegative() ? "−" : "+"}${formatMoney(d(stats.profit ?? "0").abs().toFixed(2))}`}
            tone={d(stats.profit ?? "0").isNegative() ? "text-danger" : "text-volt"}
          />
        ) : (
          <Stat
            label="Break-even avg"
            value={stats.breakEvenX != null ? `${stats.breakEvenX.toFixed(2)}×` : "—"}
            tone="text-gold"
          />
        )}
      </div>

      {/* progress + best/worst */}
      <div className="surface p-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-1">Opened {stats.opened} / {stats.count} · {stats.remaining} remaining</span>
          <span className="text-text-2">{Math.round(progress * 100)}%</span>
        </div>
        <ProgressBar value={progress} className="mt-3" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-4">
            <p className="label">Best hit</p>
            {stats.bestHit ? (
              <p className="mt-1 text-sm text-text-0">
                <span className="font-mono text-volt">{stats.bestHit.multiplier.toFixed(0)}×</span> · {stats.bestHit.entry.slot_name}
              </p>
            ) : (
              <p className="mt-1 text-sm text-text-2">—</p>
            )}
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="label">Worst hit</p>
            {stats.worstHit ? (
              <p className="mt-1 text-sm text-text-0">
                <span className="font-mono text-danger">{stats.worstHit.multiplier.toFixed(2)}×</span> · {stats.worstHit.entry.slot_name}
              </p>
            ) : (
              <p className="mt-1 text-sm text-text-2">—</p>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-text-2">
        Start balance is the bankroll announced on stream. Sum of bets adds up each bonus&apos;s bet size (not the hunt&apos;s cost).
        Final balance is the total of all payouts once every bonus is opened; break-even is the average multiplier the remaining bonuses need to get back to the start balance.
      </p>

      {/* entries table */}
      <section>
        <SectionHeading kicker="Bonuses" title={`${entries.length} collected`} />
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label px-4 py-3 font-normal">#</th>
                <th className="label px-4 py-3 font-normal">Slot</th>
                <th className="label px-4 py-3 text-right font-normal">Bet</th>
                <th className="label px-4 py-3 text-right font-normal">Payout</th>
                <th className="label px-4 py-3 text-right font-normal">Multi</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const mult = e.payout != null && d(e.bet).gt(0) ? d(e.payout).div(d(e.bet)).toNumber() : null;
                return (
                  <tr key={e.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-text-2">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <SlotThumb name={e.slot_name} src={e.image_url} size={36} />
                        <div className="min-w-0">
                          <p className="truncate text-text-0">{e.slot_name}</p>
                          {e.provider && <p className="truncate text-xs text-text-2">{e.provider}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-1">{formatMoney(e.bet)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {e.payout != null ? <span className="text-text-0">{formatMoney(e.payout)}</span> : <span className="text-text-2">pending</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {mult != null ? (
                        <span className={mult >= 100 ? "text-volt" : mult >= 1 ? "text-gold" : "text-danger"}>{mult.toFixed(1)}×</span>
                      ) : (
                        <span className="text-text-2">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {history.length > 0 && <History history={history} />}
    </div>
  );
}

function History({ history }: { history: Awaited<ReturnType<typeof getHuntHistory>> }) {
  return (
    <section>
      <SectionHeading kicker="Archive" title="Past hunts" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {history.map((h) => (
          <div key={h.id} className="surface p-5">
            <p className="text-sm text-text-0">{h.title || "Bonus hunt"}</p>
            <p className="mt-1 text-xs text-text-2">{h.entries} bonuses · start {formatMoney(h.start_balance)}</p>
            {h.final_balance != null && <p className="mt-1 text-xs text-text-2">final {formatMoney(h.final_balance)}</p>}
            {h.best_multiplier != null && (
              <p className="mt-3 font-mono text-sm text-gold">Best {h.best_multiplier.toFixed(0)}×</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
