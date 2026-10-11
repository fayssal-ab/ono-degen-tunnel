import Link from "next/link";
import type { Race, RaceEntryRow } from "@/lib/races";
import { maskUsername } from "@/lib/mask";
import { formatMoney, prizeForPercentage, d } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Countdown } from "@/components/ui/Countdown";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { iso, UtcTime } from "./shared";

// Server-only race presentation. Usernames are masked here, before any
// payload reaches the client.

export interface PublicEntry {
  rank: number;
  name: string;
  wagered: string;
  prize: string;
}

export function toPublicEntries(rows: RaceEntryRow[]): PublicEntry[] {
  return rows.map((e) => ({ rank: e.rank, name: maskUsername(e.username), wagered: e.wagered, prize: e.prize }));
}

const STATUS: Record<Race["status"], { tone: "volt" | "gold" | "plasma" | "neutral"; label: string }> = {
  live: { tone: "volt", label: "Live" },
  upcoming: { tone: "gold", label: "Upcoming" },
  finalizing: { tone: "plasma", label: "Final results pending" },
  closed: { tone: "neutral", label: "Closed" },
};

export function RaceHeader({ race }: { race: Race }) {
  const s = STATUS[race.status];
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl">{race.name}</h2>
          <Badge tone={s.tone}>{s.label}</Badge>
          <Badge>{race.kind === "7d" ? "7 days" : "24h"}</Badge>
        </div>
        <p className="mt-1 font-mono text-sm text-gold">{formatMoney(race.prize_pool)} pool</p>
        <p className="mt-1 text-xs text-text-2"><UtcTime value={race.start_at} /> → <UtcTime value={race.end_at} /></p>
      </div>
      {race.status === "upcoming" && <Countdown target={iso(race.start_at)} label="Starts" doneText="Starting…" />}
      {race.status === "live" && <Countdown target={iso(race.end_at)} label="Ends" doneText="Ending…" />}
      {race.status === "finalizing" && <p className="max-w-xs text-sm text-text-1">The race has ended. Results freeze after the next wager sync confirms the final numbers.</p>}
    </div>
  );
}

export function RaceRules({ race }: { race: Race }) {
  const total = race.prize_distribution.reduce((s, e) => s.plus(e.percentage), d(0));
  return (
    <div className="grid gap-4 text-sm text-text-1 md:grid-cols-2">
      <div>
        <p className="label mb-1">How it&apos;s scored</p>
        <p>Your score is how much you wager during the race window — the growth of your period wager between our syncs at the start and the end (syncs run about every 10 minutes, so boundaries are accurate to one sync). Ties are broken by account, not by luck.</p>
        {race.last_sample_at && (
          <p className="mt-2 text-xs text-text-2">Last updated <RelativeTime iso={race.last_sample_at} /> (data as of <UtcTime value={race.last_sample_at} />).</p>
        )}
        {race.pending_baseline > 0 && (
          <p className="mt-2 text-xs text-text-2">{race.pending_baseline} player(s) not ranked yet: we have no wager sample from before the race for them, so their race wager can&apos;t be measured fairly.</p>
        )}
      </div>
      <div>
        <p className="label mb-1">Prizes</p>
        <ol className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
          {race.prize_distribution.map((e) => (
            <li key={e.rank} className="flex justify-between"><span className="text-text-2">#{e.rank}</span><span className="text-gold">{formatMoney(prizeForPercentage(race.prize_pool, e.percentage))}</span></li>
          ))}
        </ol>
        {total.lt(100) && <p className="mt-2 text-xs text-text-2">{total.toString()}% of the pool is distributed.</p>}
        <p className="mt-1 text-xs text-text-2">Prizes for ranks nobody reaches are not paid out.</p>
      </div>
    </div>
  );
}

export function RaceTable({ entries }: { entries: PublicEntry[] }) {
  return (
    <ol className="space-y-2">
      {entries.map((e) => (
        <li key={e.rank} className="flex items-center gap-3 rounded-xl border border-line bg-bg-1 px-4 py-3 sm:gap-4">
          <span className={`w-10 font-mono text-sm font-bold ${e.rank <= 3 ? "text-gold" : "text-text-2"}`}>#{e.rank}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-text-0">{e.name}</span>
          <span className="font-mono text-sm tabular-nums text-text-1">{formatMoney(e.wagered)}</span>
          {d(e.prize).gt(0) && <span className="hidden font-mono text-sm tabular-nums text-gold sm:inline">{formatMoney(e.prize)}</span>}
        </li>
      ))}
    </ol>
  );
}

export function RaceLink({ race }: { race: Race }) {
  return <Link href={`/races/${race.id}`} className="text-sm text-gold hover:underline">Full standings →</Link>;
}
