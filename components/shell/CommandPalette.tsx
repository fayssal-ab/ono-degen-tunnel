"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_DESTINATIONS } from "@/lib/nav";
import { Icon } from "@/components/ui/Icon";

// Cmd/Ctrl+K palette. Opened by the shortcut or by a "odt:open-palette" event
// (dispatched by the TopBar search button). Filters nav + extra destinations
// and includes a "look up my leaderboard rank" shortcut (prompt §4).
export function CommandPalette({ hidden = [] }: { hidden?: string[] }) {
  const router = useRouter();
  const hiddenSet = new Set(hidden);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") close();
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("odt:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("odt:open-palette", onOpen);
    };
  }, [close]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = ALL_DESTINATIONS.filter((d) => !hiddenSet.has(d.href)).map((d) => ({ kind: "nav" as const, ...d }));
    const rankLookup = {
      kind: "rank" as const,
      label: q ? `Find "${query.trim()}" on the leaderboard` : "Find me on the leaderboard",
      href: `/leaderboard${q ? `?find=${encodeURIComponent(query.trim())}` : ""}`,
      icon: "Crosshair",
    };
    if (!q) return [...items.slice(0, 8), rankLookup];
    const matched = items.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.keywords?.some((k) => k.toLowerCase().includes(q))
    );
    return [...matched, rankLookup];
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(index: number) {
    const item = results[index];
    if (!item) return;
    router.push(item.href);
    close();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button className="absolute inset-0 bg-bg-0/70 backdrop-blur-sm" aria-label="Close" onClick={close} />
      <div className="surface relative w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="Search" className="h-4 w-4 text-text-2" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(active);
              }
            }}
            placeholder="Jump to a page, or type a username to find your rank…"
            className="h-14 flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-2 focus:outline-none"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((item, i) => (
            <li key={`${item.kind}-${item.href}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                  i === active ? "bg-bg-3 text-text-0" : "text-text-1"
                }`}
              >
                <Icon
                  name={item.icon}
                  className={`h-4 w-4 ${item.kind === "rank" ? "text-gold" : "text-text-2"}`}
                />
                <span>{item.label}</span>
                {i === active && <Icon name="CornerDownLeft" className="ml-auto h-3.5 w-3.5 text-text-2" />}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-text-2">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
