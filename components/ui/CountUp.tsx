"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoneyCompact } from "@/lib/money";

// A number that counts up once it scrolls into view. Reduced motion: shows
// the value straight away. `money` formats like $12.4K.
export function CountUp({ value, money = false, className }: { value: number; money?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches || value <= 0) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / 1400);
        setShown(value * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      setShown(0);
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);
  return <span ref={ref} className={className}>{money ? formatMoneyCompact(shown) : Math.round(shown).toLocaleString("en-US")}</span>;
}
