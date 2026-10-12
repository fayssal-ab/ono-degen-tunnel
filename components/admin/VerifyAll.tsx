"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Runs time-boxed thumbnail-check batches back to back until every slot is
// checked (or Stop is pressed), showing progress. Safe to stop and resume.
export function VerifyAll({ unknown: initialUnknown }: { unknown: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [unknown, setUnknown] = useState(initialUnknown);
  const [pool, setPool] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function run() {
    setRunning(true);
    setError(null);
    stop.current = false;
    let failures = 0;
    while (!stop.current) {
      try {
        const res = await fetch("/api/admin/slots/verify", { method: "POST" });
        const data = (await res.json()) as { ok: boolean; batch?: { checked: number }; stats?: { unknown: number; pool: number } };
        if (!data.ok || !data.stats) throw new Error("failed");
        failures = 0;
        setUnknown(data.stats.unknown);
        setPool(data.stats.pool);
        if (data.stats.unknown === 0 || data.batch?.checked === 0) break;
      } catch {
        if (++failures >= 3) { setError("slot.report images unreachable — try again later."); break; }
      }
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {running ? (
        <button onClick={() => { stop.current = true; }} className="press inline-flex h-10 items-center rounded-xl border border-line-strong px-4 text-sm">Stop</button>
      ) : (
        <button onClick={run} disabled={unknown === 0} className="press inline-flex h-10 items-center gap-2 rounded-xl bg-volt px-4 text-sm font-semibold text-bg-0 disabled:opacity-40">
          Verify all thumbnails
        </button>
      )}
      <span className="font-mono text-sm text-text-1">
        {running ? "Checking… " : ""}{unknown.toLocaleString("en-US")} left{pool != null ? ` · tournament pool ${pool.toLocaleString("en-US")}` : ""}
      </span>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
