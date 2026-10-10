import { formatMoney } from "@/lib/money";
import { Icon } from "@/components/ui/Icon";
import type { DisplayRow } from "./types";

function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0)
    return <span className="inline-flex items-center text-text-2">—</span>;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${up ? "text-volt" : "text-danger"}`}>
      <Icon name={up ? "ChevronUp" : "ChevronDown"} className="h-3.5 w-3.5" />
      {Math.abs(delta)}
    </span>
  );
}

// Dense standings table (prompt §5.2). Rows are pre-masked; highlightRank marks
// the visitor's own row after a "find me". from/showPrize tune reuse (board vs
// race vs archive).
export function LeaderboardTable({
  rows,
  startRank = 1,
  showPrize = true,
  highlightRank = null,
}: {
  rows: DisplayRow[];
  startRank?: number;
  showPrize?: boolean;
  highlightRank?: number | null;
}) {
  const shown = rows.filter((r) => r.rank >= startRank);
  if (shown.length === 0) return null;

  return (
    <div className="surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="label px-4 py-3 font-normal">Rank</th>
            <th className="label px-4 py-3 font-normal">Player</th>
            <th className="label px-4 py-3 text-right font-normal">Wagered</th>
            {showPrize && <th className="label px-4 py-3 text-right font-normal">Prize</th>}
            <th className="label px-2 py-3 text-center font-normal">24h</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const me = highlightRank === row.rank;
            return (
              <tr
                key={row.rank}
                className={`border-b border-line/60 last:border-0 transition-colors ${
                  me ? "bg-gold/10" : "hover:bg-bg-3/50"
                }`}
              >
                <td className="px-4 py-3">
                  <span className={`font-mono font-semibold tabular-nums ${row.rank <= 3 ? "text-gold" : "text-text-1"}`}>
                    #{row.rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-text-0">{row.maskedName}</span>
                  {me && <span className="ml-2 text-xs text-gold">you</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-text-0">
                  {formatMoney(row.wagered)}
                </td>
                {showPrize && (
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {row.prize && Number(row.prize) > 0 ? (
                      <span className="text-gold">{formatMoney(row.prize)}</span>
                    ) : (
                      <span className="text-text-2">—</span>
                    )}
                  </td>
                )}
                <td className="px-2 py-3 text-center">
                  <Delta delta={row.delta} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
