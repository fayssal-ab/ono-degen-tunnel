import Image from "next/image";
import { ASSETS } from "@/lib/assets";
import { formatMoney } from "@/lib/money";
import type { DisplayRow } from "./types";

// Top-3 podium with distinct gold/silver/bronze ring treatments (prompt §5.2).
// Order on screen: 2nd · 1st · 3rd, with 1st raised.
const STYLES: Record<number, { ring: string; glow: string; order: string; raise: string }> = {
  1: { ring: "ring-gold", glow: "shadow-[0_0_40px_-8px_var(--color-gold)]", order: "order-2", raise: "md:-mt-6" },
  2: { ring: "ring-text-1", glow: "", order: "order-1", raise: "md:mt-4" },
  3: { ring: "ring-[#b07a46]", glow: "", order: "order-3", raise: "md:mt-6" },
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
              <span className="label absolute -top-3 rounded-full bg-gold px-3 py-1 text-bg-0">Champion</span>
            )}
            <div className={`relative h-20 w-20 overflow-hidden rounded-2xl ring-2 ${s.ring}`}>
              <Image src={ASSETS.podium[row.rank] ?? ASSETS.podium[1]} alt="" fill unoptimized className="object-cover" />
              <span className="absolute inset-0 grid place-items-center font-display text-2xl font-extrabold text-text-0/90">
                {row.rank}
              </span>
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
