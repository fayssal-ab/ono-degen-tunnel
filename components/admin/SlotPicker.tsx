"use client";

import { useEffect, useRef, useState } from "react";

// Type a slot name → fuzzy matches from the slot catalogue with their real
// thumbnails → pick one and the form submits with its catalogue id. The server
// re-reads name/provider/image from the catalogue; nothing is typed by hand.

interface Result {
  id: string;
  name: string;
  provider: string;
  imageUrl: string | null;
  onlyOnStake?: boolean;
}

function Tile({ name, src, size = 44 }: { name: string; src: string | null; size?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-bg-3" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-mono text-[10px] text-text-2">{initials}</span>
      )}
    </span>
  );
}

export function SlotPicker({ defaultBet = "" }: { defaultBet?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const query = q.trim();
  const shown = query.length < 2 ? [] : results;

  useEffect(() => {
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/slots/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { results: [], error: "unauthorized" }))
        .then((d: { results: Result[]; error?: string }) => { setResults(d.results ?? []); setActive(0); setError(d.error ?? null); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  function submit(slotId: string, customName = "") {
    const form = formRef.current?.closest("form");
    const bet = form?.elements.namedItem("bet") as HTMLInputElement | null;
    if (bet && !bet.value.trim()) { bet.focus(); bet.reportValidity(); return; }
    if (idRef.current) idRef.current.value = slotId;
    if (nameRef.current) nameRef.current.value = customName;
    form?.requestSubmit();
    setQ("");
    setResults([]);
  }

  return (
    <div ref={formRef} className="relative space-y-2">
      <input type="hidden" name="slot_id" ref={idRef} />
      <input type="hidden" name="custom_name" ref={nameRef} />
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); if (shown[active]) submit(shown[active].id); }
          }}
          placeholder="Type a slot name — e.g. Gates of Olympus"
          aria-label="Slot name"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls="slot-picker-list"
          autoComplete="off"
          maxLength={80}
          className="h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none"
        />
        <input name="bet" defaultValue={defaultBet} placeholder="Bet ($)" inputMode="decimal" required aria-label="Bet"
          className="h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none" />
      </div>
      {query.length >= 2 && (
        <div id="slot-picker-list" role="listbox" className="max-h-96 overflow-y-auto rounded-xl border border-line bg-bg-2">
          {loading && shown.length === 0 && <p className="p-3 text-sm text-text-2">Searching…</p>}
          {error === "catalog_unavailable" && <p className="p-3 text-sm text-danger">Slot catalogue unavailable — sync it in Admin → Slot catalogue.</p>}
          {shown.map((r, i) => (
            <button type="button" key={r.id} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => submit(r.id)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-bg-3" : ""}`}>
              <Tile name={r.name} src={r.imageUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-0">{r.name}{r.onlyOnStake && <span className="ml-2 rounded bg-volt/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-volt">Only on Stake</span>}</span>
                <span className="block truncate text-xs text-text-2">{r.provider}</span>
              </span>
              <span className="text-xs text-gold">Add</span>
            </button>
          ))}
          {!loading && shown.length === 0 && !error && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="text-text-2">No match in the slot catalogue.</span>
              <button type="button" onClick={() => submit("", query)} className="rounded-lg border border-line px-3 py-1.5 text-text-1 hover:border-gold hover:text-gold">
                Add “{query}” without catalogue data
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
