import type { ReactNode } from "react";

// Consistent page header across every route (kicker + title + optional lead +
// right-aligned slot for badges/actions). An optional giant outlined watermark
// word sits behind the title for the editorial, gaming-hub feel — defaults to
// the title itself so every page picks it up without extra wiring.
export function PageHeader({
  kicker,
  title,
  lead,
  right,
  watermark,
  accent = "cyan",
}: {
  kicker?: string;
  title: string;
  lead?: string;
  right?: ReactNode;
  /** outlined word behind the title; pass `null` to disable, omit to use title */
  watermark?: string | null;
  accent?: "gold" | "cyan";
}) {
  const mark = watermark === undefined ? title : watermark;

  return (
    <div className="relative overflow-hidden border-b border-line pb-6">
      {mark && (
        <span
          aria-hidden
          className={`watermark watermark-sm ${accent === "gold" ? "watermark-gold" : "watermark-cyan"} -ml-0.5`}
        >
          {mark}
        </span>
      )}
      <div className={`relative z-10 flex flex-wrap items-end justify-between gap-4 ${mark ? "-mt-[0.3em]" : ""}`}>
        <div className="max-w-2xl">
          {kicker && <p className="label">{kicker}</p>}
          <h1 className="font-bang mt-1.5 text-3xl tracking-wide md:text-4xl">{title}</h1>
          {lead && <p className="mt-2 text-sm text-text-1 md:text-base">{lead}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}
