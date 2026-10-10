"use client";

import { useState } from "react";
import { Icon } from "./Icon";

// Click-to-copy code chip with a transient "Copied" toast (prompt §5.1).
export function CopyChip({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <button
      onClick={copy}
      className={`press inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 font-mono text-sm font-semibold text-gold hover:bg-gold/20 ${className}`}
      aria-label={`Copy code ${value}`}
    >
      {value}
      <Icon name={copied ? "Check" : "Copy"} className="h-3.5 w-3.5" />
      {copied && <span className="text-xs font-normal text-volt">Copied</span>}
    </button>
  );
}
