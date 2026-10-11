"use client";

import { useEffect, useState } from "react";
import { BRAND_NAME } from "@/lib/constants";

// Cinematic first-load screen: brand mark → animated progress bar → fade out.
// Shows once per browser session (sessionStorage), and collapses to a near-
// instant flash under prefers-reduced-motion. Never blocks interaction after it
// fades (pointer-events drop with the fade).
export function Preloader() {
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("odt.loaded")) {
        setGone(true);
        return;
      }
    } catch {
      /* private mode — show it once */
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeAt = reduced ? 150 : 1500;
    const goneAt = reduced ? 350 : 2080;
    const t1 = setTimeout(() => {
      setOut(true);
      try {
        sessionStorage.setItem("odt.loaded", "1");
      } catch {
        /* ignore */
      }
    }, fadeAt);
    const t2 = setTimeout(() => setGone(true), goneAt);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div className={`preloader ${out ? "preloader-out" : ""}`} aria-hidden>
      <div className="flex flex-col items-center px-6 text-center">
        <span
          className="grid h-14 w-14 place-items-center rounded-2xl text-bg-0"
          style={{ background: "linear-gradient(135deg, var(--color-gold-hi), var(--color-gold))", boxShadow: "0 0 36px -8px var(--color-gold)" }}
        >
          <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="4" width="24" height="24" rx="7" />
            <rect x="9.5" y="9.5" width="13" height="13" rx="4" opacity="0.55" />
            <rect x="14" y="14" width="4" height="4" rx="1.3" />
          </svg>
        </span>

        <h1 className="font-bang text-gradient-gold mt-6 text-4xl tracking-wide md:text-5xl">{BRAND_NAME}</h1>
        <p className="label mt-2">Loading your degen experience</p>

        <div className="mt-6 h-1 w-56 overflow-hidden rounded-full bg-bg-3">
          <div
            className="loader-bar h-full rounded-full"
            style={{ background: "linear-gradient(90deg, var(--color-cyan), var(--color-plasma), var(--color-gold))" }}
          />
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="loader-dot h-1.5 w-1.5 rounded-full bg-text-1"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
