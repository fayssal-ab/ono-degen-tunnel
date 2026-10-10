import "server-only";
import { maskUsername } from "./mask";
import { prizeForPercentage } from "./money";
import {
  getLiveEntries,
  getFinalResults,
  getRankDeltas,
  percentageForRank,
  type Period,
  type BoardEntry,
} from "./periods";
import type { DisplayRow } from "@/components/leaderboard/types";

// Turn raw DB rows into client-safe DisplayRows: mask the username (golden
// rule 3), drop casino_id, attach the rank delta and the prize-preview. This
// is the ONLY bridge between DB rows and the client — masking cannot be
// forgotten if every board goes through here.
function toDisplay(entries: BoardEntry[], period: Period, deltas: Map<string, number>): DisplayRow[] {
  return entries.map((e) => {
    const prevRank = deltas.get(e.casino_id);
    const prize =
      e.prize ??
      (() => {
        const pct = percentageForRank(period.prize_distribution, e.rank);
        return pct > 0 ? prizeForPercentage(period.prize_pool, pct) : undefined;
      })();
    return {
      rank: e.rank,
      maskedName: maskUsername(e.username),
      wagered: e.wagered,
      prize,
      delta: prevRank != null ? prevRank - e.rank : null,
    };
  });
}

export async function getLiveBoard(period: Period, limit = 100): Promise<DisplayRow[]> {
  const [entries, deltas] = await Promise.all([getLiveEntries(period.id, limit), getRankDeltas(period.id)]);
  return toDisplay(entries, period, deltas);
}

export async function getFinalBoard(period: Period, limit = 100): Promise<DisplayRow[]> {
  const entries = await getFinalResults(period.id, limit);
  return toDisplay(entries, period, new Map());
}
