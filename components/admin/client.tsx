"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Decimal from "decimal.js";

// Small interactive helpers for admin forms. Display-only maths here; every
// value is re-validated server-side.

export function SubmitButton({ children, className, confirm }: { children: React.ReactNode; className: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

/** Live payout preview for a prize pool + "50,30,20" split, reading sibling inputs by name. */
export function DistributionPreview({ poolName = "prize_pool", distName = "distribution" }: { poolName?: string; distName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<{ rank: number; pct: string; amount: string }[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const update = () => {
      const pool = (form.elements.namedItem(poolName) as HTMLInputElement | null)?.value.trim() ?? "";
      const dist = (form.elements.namedItem(distName) as HTMLInputElement | null)?.value ?? "";
      try {
        const poolD = new Decimal(pool || "0");
        const parts = dist.split(",").map((p) => p.trim()).filter(Boolean);
        let total = new Decimal(0);
        const out = parts.map((p, i) => {
          const pct = new Decimal(p);
          if (pct.lte(0)) throw new Error("bad");
          total = total.plus(pct);
          return { rank: i + 1, pct: pct.toString(), amount: poolD.mul(pct).div(100).toFixed(2) };
        });
        setRows(out);
        setProblem(total.gt(100) ? `Total ${total}% exceeds 100%` : total.lt(100) ? `${new Decimal(100).minus(total)}% is not distributed` : null);
      } catch {
        setRows([]);
        setProblem("Invalid amount or split");
      }
    };
    update();
    form.addEventListener("input", update);
    return () => form.removeEventListener("input", update);
  }, [poolName, distName]);

  return (
    <div ref={ref} className="rounded-xl border border-line bg-bg-1 p-3 text-xs">
      <p className="label mb-2">Payout preview</p>
      {problem && <p className="mb-2 text-gold">{problem}</p>}
      {rows.length === 0 ? (
        <p className="text-text-2">Enter a pool and a split.</p>
      ) : (
        <ol className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono sm:grid-cols-4">
          {rows.slice(0, 40).map((r) => (
            <li key={r.rank} className="flex justify-between gap-2">
              <span className="text-text-2">#{r.rank} · {r.pct}%</span>
              <span className="text-text-0">${r.amount}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface Suggestion {
  name: string;
  provider: string;
  imageUrl: string;
}

/**
 * Slot name input with slot.report suggestions (admin-only endpoint). Picking
 * a suggestion fills the sibling `${prefix}provider` / `${prefix}image_url`
 * inputs. Degrades to a plain input when no API key is configured.
 */
export function SlotNameInput({ name = "slot_name", prefix = "", defaultValue = "", className, required = true }: {
  name?: string; prefix?: string; defaultValue?: string; className: string; required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const listId = `slots-${name}`;
  const suggestions = value.trim().length < 2 ? [] : items;

  useEffect(() => {
    if (value.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/slots/search?q=${encodeURIComponent(value)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results: Suggestion[] }) => setItems(d.results ?? []))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value]);

  function onChange(v: string) {
    setValue(v);
    const hit = items.find((i) => i.name === v);
    const form = ref.current?.form;
    if (hit && form) {
      const provider = form.elements.namedItem(`${prefix}provider`) as HTMLInputElement | null;
      const image = form.elements.namedItem(`${prefix}image_url`) as HTMLInputElement | null;
      if (provider && !provider.value) provider.value = hit.provider;
      if (image && !image.value) image.value = hit.imageUrl;
    }
  }

  return (
    <>
      <input ref={ref} name={name} value={value} onChange={(e) => onChange(e.target.value)} list={listId}
        maxLength={191} required={required} autoComplete="off" className={className} />
      <datalist id={listId}>
        {suggestions.map((i) => <option key={i.name} value={i.name}>{i.provider}</option>)}
      </datalist>
    </>
  );
}
