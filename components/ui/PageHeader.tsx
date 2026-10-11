import type { ReactNode } from "react";

// Consistent page header across every route (kicker + title + optional lead +
// right-aligned slot for badges/actions). Keeps the whole site on one rhythm.
export function PageHeader({
  kicker,
  title,
  lead,
  right,
}: {
  kicker?: string;
  title: string;
  lead?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="max-w-2xl">
        {kicker && <p className="label">{kicker}</p>}
        <h1 className="font-bang mt-1.5 text-3xl tracking-wide md:text-4xl">{title}</h1>
        {lead && <p className="mt-2 text-sm text-text-1 md:text-base">{lead}</p>}
      </div>
      {right}
    </div>
  );
}
