"use client";

import { useEffect, useState } from "react";

// Slot chooser for forms (challenges): type → catalogue matches with real
// thumbnails → pick one. Submits `slot_id` (catalogue entry, the server reads
// name/provider/art from it) plus `slot_name` (the typed name when no pick).

interface Result { id: string; name: string; provider: string; imageUrl: string | null; onlyOnStake?: boolean }

export function SlotField({ defaultName = "", defaultImage = null, defaultProvider = "" }: { defaultName?: string; defaultImage?: string | null; defaultProvider?: string }) {
  const [q, setQ] = useState(defaultName);
  const [picked, setPicked] = useState<Result | null>(defaultName ? { id: "", name: defaultName, provider: defaultProvider, imageUrl: defaultImage } : null);
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const query = q.trim();
  const shown = open && query.length >= 2 ? results : [];

  useEffect(() => {
    if (query.length < 2 || !open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/slots/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results: Result[] }) => setResults(d.results ?? []))
        .catch(() => {});
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, open]);

  return (
    <div className="relative">
      <input type="hidden" name="slot_id" value={picked?.id ?? ""} />
      <div className="flex items-center gap-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-bg-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {picked?.imageUrl ? <img src={picked.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px] text-text-2">art</span>}
        </span>
        <input
          name="slot_name"
          required
          maxLength={191}
          value={q}
          autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setPicked(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Type the slot — pick it from the list"
          className="h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none"
        />
      </div>
      {picked && <p className="mt-1 text-xs text-text-2">{picked.id ? `${picked.provider} · from the slot catalogue` : picked.provider ? picked.provider : "Not in the catalogue — saved as typed"}</p>}
      {shown.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-bg-2 shadow-xl">
          {shown.map((r) => (
            <button type="button" key={r.id} onClick={() => { setPicked(r); setQ(r.name); setOpen(false); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-bg-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.imageUrl ? <img src={r.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-text-2">—</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-0">{r.name}{r.onlyOnStake && <span className="ml-2 rounded bg-volt/15 px-1 text-[10px] font-bold text-volt">ONLY ON STAKE</span>}</span>
                <span className="block truncate text-xs text-text-2">{r.provider}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
