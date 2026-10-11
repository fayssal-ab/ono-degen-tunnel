import { formatMoney } from "@/lib/money";
import { Icon } from "@/components/ui/Icon";
import type { DisplayRow } from "./types";

// Top-3 podium with distinct gold/silver/bronze treatments (prompt §5.2).
// Order on screen: 2nd · 1st · 3rd, with 1st raised. No drawn art — CSS discs.
const STYLES: Record<
  number,
  { ring: string; glow: string; order: string; raise: string; disc: string; ink: string }
> = {
  1: {
    ring: "ring-gold",
    glow: "shadow-[0_0_40px_-8px_var(--color-gold)]",
    order: "order-2",
    raise: "md:-mt-6",
    disc: "linear-gradient(140deg,#ffd97a,#c08a2a)",
    ink: "#3a2a07",
  },
  2: {
    ring: "ring-text-1",
    glow: "",
    order: "order-1",
    raise: "md:mt-4",
    disc: "linear-gradient(140deg,#e2e8f0,#8894a6)",
    ink: "#2a3340",
  },
  3: {
    ring: "ring-[#b07a46]",
    glow: "",
    order: "order-3",
    raise: "md:mt-6",
    disc: "linear-gradient(140deg,#c9843d,#6e441c)",
    ink: "#2a1708",
  },
};

export function Podium({ rows }: { rows: DisplayRow[] }) {
  const top = rows.filter((r) => r.rank <= 3).sort((a, b) => a.rank - b.rank);
  if (top.length === 0) return null;

  return (
    <div className="flex flex-col items-stretch justify-center gap-4 md:flex-row md:items-end">
      {top.map((row) => {
        const s = STYLES[row.rank];
        return (
          <div
            key={row.rank}
            className={`surface relative flex flex-1 flex-col items-center px-5 py-6 ${s.order} ${s.raise} ${row.rank === 1 ? s.glow : ""}`}
          >
            {row.rank === 1 && (
              <span className="label absolute -top-3 inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-bg-0">
                <Icon name="Crown" className="h-3.5 w-3.5" /> Champion
              </span>
            )}
            <div
              className={`relative grid h-20 w-20 place-items-center rounded-full ring-2 ${s.ring}`}
              style={{ background: s.disc, color: s.ink }}
            >
              <span className="font-display text-3xl font-extrabold">{row.rank}</span>
            </div>
            <p className="mt-4 max-w-full truncate font-mono text-sm text-text-0">{row.maskedName}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-text-0">
              {formatMoney(row.wagered)}
            </p>
            {row.prize && Number(row.prize) > 0 && (
              <p className="mt-2 rounded-full bg-gold/10 px-3 py-1 font-mono text-sm font-semibold text-gold">
                {formatMoney(row.prize)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
