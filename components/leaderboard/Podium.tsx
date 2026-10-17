import { formatMoney } from "@/lib/money";
import { Icon } from "@/components/ui/Icon";
import { UserAvatar } from "@/components/ui/UserAvatar";
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
            className={`relative flex flex-1 flex-col items-center overflow-hidden rounded-[24px] border px-5 pb-6 pt-8 ${s.order} ${s.raise} ${row.rank === 1 ? `border-gold/50 ${s.glow}` : "border-white/10"}`}
            style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${row.rank === 1 ? "#f5c451" : row.rank === 2 ? "#cbd5e1" : "#c9843d"} 14%, var(--color-bg-1)), var(--color-bg-1))` }}
          >
            {row.rank === 1 && (
              <span className="label absolute top-3 inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-bg-0">
                <Icon name="Crown" className="h-3.5 w-3.5" /> Champion
              </span>
            )}
            <div className={`relative ${row.rank === 1 ? "mt-6" : ""}`}>
              <span className="block rounded-full p-1" style={{ background: s.disc }}>
                <UserAvatar name={row.maskedName} className={`rounded-full border-4 border-bg-0 ${row.rank === 1 ? "h-24 w-24 text-4xl" : "h-20 w-20 text-3xl"}`} />
              </span>
              <span className="absolute -bottom-2 left-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border-2 border-bg-0 font-display text-sm font-extrabold"
                style={{ background: s.disc, color: s.ink }}>{row.rank}</span>
            </div>
            <p className="mt-5 max-w-full truncate font-mono text-sm font-semibold text-text-0">{row.maskedName}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-text-0">{formatMoney(row.wagered)}</p>
            <p className="text-[11px] uppercase tracking-wider text-text-2">wagered</p>
            {row.prize && Number(row.prize) > 0 && (
              <p className="mt-3 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-sm font-bold text-gold">
                {formatMoney(row.prize)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
