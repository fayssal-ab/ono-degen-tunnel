"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KoState } from "@/lib/knockout";

// Polls the public live-state endpoint. Netlify functions can't hold a
// server-push stream, so the dashboard/overlay poll (default 1.5 s, paused
// while the tab is hidden) — state lives in MySQL, a refresh never resets it.
export function useKoState(initial: KoState | null = null, intervalMs = 1500, id?: number) {
  const [state, setState] = useState<KoState | null>(initial);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(initial !== null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournament/state${id ? `?id=${id}` : ""}`, { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; state: KoState | null };
      if (!data.ok) throw new Error("unavailable");
      setState(data.state);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    let stopped = false;
    const loop = async () => {
      if (!document.hidden) await refresh();
      if (!stopped) timer.current = setTimeout(loop, intervalMs);
    };
    loop();
    return () => { stopped = true; if (timer.current) clearTimeout(timer.current); };
  }, [refresh, intervalMs]);

  return { state, error, loaded, refresh };
}
