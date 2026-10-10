"use client";

import { useState } from "react";
import { Icon } from "./Icon";

export interface AccordionItem {
  q: string;
  a: string;
}

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="surface divide-y divide-line overflow-hidden">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={isOpen ? "acc-open" : ""}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-sm font-medium text-text-0">{item.q}</span>
              <Icon name="ChevronDown" className="acc-chevron h-4 w-4 shrink-0 text-text-2 transition-transform" />
            </button>
            {isOpen && <p className="px-5 pb-5 text-sm leading-relaxed text-text-1">{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
