import type { ReactNode } from "react";
import { FeatureIcon, type FeatureColor } from "./FeatureIcon";
import { bangSize } from "./bangSize";

// Consistent page header across every route (kicker + title + optional lead +
// right-aligned slot). A giant outlined watermark word sits behind the title
// for the editorial feel (defaults to the title), and an optional branded
// FeatureIcon badge sits beside it.
export function PageHeader({
  kicker,
  title,
  lead,
  right,
  watermark,
  accent = "cyan",
  icon,
  iconColor = "cyan",
}: {
  kicker?: string;
  title: string;
  lead?: string;
  right?: ReactNode;
  watermark?: string | null;
  accent?: "gold" | "cyan";
  icon?: string;
  iconColor?: FeatureColor;
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
        <div className="flex min-w-0 items-start gap-4">
          {icon && <FeatureIcon icon={icon} color={iconColor} size="lg" className="mt-1" />}
          <div className="min-w-0 max-w-2xl">
            {kicker && <p className="label">{kicker}</p>}
            <h1 className={`font-bang mt-1.5 tracking-wide ${bangSize(title, "text-3xl md:text-4xl")}`}>{title}</h1>
            {lead && <p className="mt-2 text-sm text-text-1 md:text-base">{lead}</p>}
          </div>
        </div>
        {right}
      </div>
    </div>
  );
}
