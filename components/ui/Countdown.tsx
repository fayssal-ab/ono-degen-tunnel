"use client";

import { useEffect, useState } from "react";

// Counts down to an ISO instant. Renders nothing time-specific on the server
// (avoids hydration mismatch); fills in on mount. Shows the reset time in the
// visitor's own timezone, labelled (CLAUDE.md: timezone is an assumption).
function parts(ms: number) {
  const clamp = Math.max(0, ms);
  const s = Math.floor(clamp / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    done: clamp === 0,
  };
}

export function Countdown({ target, className = "" }: { target: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const targetMs = new Date(target).getTime();
  const p = now == null ? null : parts(targetMs - now);

  const localLabel =
    now == null
      ? ""
      : new Date(target).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        });

  const cell = (value: number | null, label: string) => (
    <div className="flex flex-col items-center">
      <span className="font-mono text-2xl font-bold tabular-nums text-text-0" suppressHydrationWarning>
        {value == null ? "—" : String(value).padStart(2, "0")}
      </span>
      <span className="label mt-1">{label}</span>
    </div>
  );

  return (
    <div className={className}>
      {p?.done ? (
        <p className="font-mono text-lg text-volt">Resetting…</p>
      ) : (
        <div className="flex items-end gap-4">
          {cell(p?.d ?? null, "days")}
          <span className="pb-6 text-text-2">:</span>
          {cell(p?.h ?? null, "hrs")}
          <span className="pb-6 text-text-2">:</span>
          {cell(p?.m ?? null, "min")}
          <span className="pb-6 text-text-2">:</span>
          {cell(p?.s ?? null, "sec")}
        </div>
      )}
      {localLabel && (
        <p className="mt-2 text-xs text-text-2" suppressHydrationWarning>
          Resets {localLabel} (your time)
        </p>
      )}
    </div>
  );
}
