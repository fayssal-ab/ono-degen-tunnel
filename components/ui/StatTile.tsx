"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

// A labelled number that counts up when it scrolls into view (prompt §3.4).
// `format` is a string token (not a function) so this client component can be
// rendered from a server component without passing a function across the RSC
// boundary. Respects reduced motion (jumps straight to the value).
type Fmt = "number" | "money" | "moneyCompact";

function render(n: number, fmt: Fmt): string {
  if (fmt === "money") return formatMoney(n, { cents: false });
  if (fmt === "moneyCompact") return formatMoneyCompact(n);
  return Math.round(n).toLocaleString();
}

export function StatTile({
  label,
  value,
  format = "number",
  sub,
}: {
  label: string;
  value: number;
  format?: Fmt;
  sub?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const dur = 900;
        const tick = (t: number) => {
          const k = Math.min(1, (t - start) / dur);
          const eased = 1 - Math.pow(1 - k, 3);
          setDisplay(value * eased);
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <div ref={ref} className="surface p-5">
      <p className="label">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-text-0">{render(display, format)}</p>
      {sub && <p className="mt-1 text-xs text-text-2">{sub}</p>}
    </div>
  );
}
