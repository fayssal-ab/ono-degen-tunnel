"use client";

import { useState, type ReactNode } from "react";

// Lightweight client tab switcher. Panels are passed as a map; the first key is
// active by default unless `initial` is given.
export function Tabs({
  tabs,
  initial,
}: {
  tabs: { key: string; label: string; panel: ReactNode }[];
  initial?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-bg-1 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors ${
              active === t.key ? "bg-bg-3 text-text-0" : "text-text-1 hover:text-text-0"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{current?.panel}</div>
    </div>
  );
}
