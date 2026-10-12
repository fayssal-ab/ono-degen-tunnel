"use client";

import { useEffect, useState } from "react";

// Curate which slots are on Stake: paste names (matched to the catalogue) and
// add Stake-only slots with art from Stake's image CDN. Once any slot is
// marked, tournament slots are drawn only from this list.

interface Match { line: string; slot: { id: string; name: string; provider: string; hasArt: boolean } | null }
interface StakeSlot { id: string; name: string; provider: string; imageUrl: string | null; source: string }
interface Stats { onStake: number; stakeOnly: number; pool: number }

const input = "w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none";
const btn = "press inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold disabled:opacity-40";

async function call(body: unknown) {
  const res = await fetch("/api/admin/slots/stake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function StakeSlots() {
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [slots, setSlots] = useState<StakeSlot[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [add, setAdd] = useState({ name: "", provider: "", imageUrl: "" });

  const apply = (d: { ok: boolean; slots?: StakeSlot[]; stats?: Stats; error?: string; detail?: string | null }) => {
    if (d.slots) setSlots(d.slots);
    if (d.stats) setStats(d.stats);
    if (!d.ok) setMsg(d.detail ? `Refused: ${d.detail}` : d.error === "unexpected" ? "Server error — nothing changed." : `Refused (${d.error}).`);
  };
  useEffect(() => { call({ action: "list" }).then(apply).catch(() => setMsg("Could not load the Stake list.")); }, []);

  async function run(body: unknown, after?: () => void) {
    setBusy(true); setMsg(null);
    try { const d = await call(body); apply(d); if (d.ok) after?.(); return d; } catch { setMsg("Network error — nothing changed."); } finally { setBusy(false); }
  }

  const found = matches?.filter((m) => m.slot) ?? [];
  const missing = matches?.filter((m) => !m.slot) ?? [];

  return (
    <section className="surface space-y-5 p-6">
      <div>
        <p className="label">Stake slots</p>
        <p className="mt-1 text-sm text-text-2">
          Stake has no public game list and blocks automated access, so mark the slots you play on Stake here. As soon as one is marked, tournament slots are drawn
          <strong className="text-text-0"> only </strong>from this list, and Stake slots show first in the Bonus Hunt picker.
        </p>
        {stats && <p className="mt-2 font-mono text-sm text-text-1">{stats.onStake} on Stake · {stats.stakeOnly} Stake-only added · {stats.pool} with verified art in the tournament pool</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-text-0">1 · Paste slot names from Stake (one per line)</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"Gates of Olympus\nSugar Rush 1000\nWanted Dead or a Wild"} className={`${input} py-2 font-mono`} />
        <button disabled={busy || !text.trim()} onClick={() => run({ action: "match", text }).then((d) => d?.matches && setMatches(d.matches))} className={`${btn} border border-line-strong text-text-1 hover:border-gold hover:text-gold`}>Match names</button>
        {matches && (
          <div className="rounded-xl border border-line bg-bg-1 p-3 text-sm">
            <p>{found.length} matched · {missing.length} not in the catalogue</p>
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto font-mono text-xs">
              {found.map((m) => <li key={m.line} className="text-text-1">✓ {m.line} → <span className="text-text-0">{m.slot!.name}</span> · {m.slot!.provider}{m.slot!.hasArt ? "" : " · no official art"}</li>)}
              {missing.map((m) => <li key={m.line} className="text-gold">✗ {m.line} — add it below as Stake-only</li>)}
            </ul>
            {found.length > 0 && (
              <button disabled={busy} onClick={() => run({ action: "mark", ids: found.map((m) => m.slot!.id) }, () => { setMatches(null); setText(""); })} className={`${btn} mt-3 bg-volt text-bg-0`}>
                Mark {found.length} as on Stake
              </button>
            )}
          </div>
        )}
      </div>

      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: "add", ...add }, () => setAdd({ name: "", provider: "", imageUrl: "" })); }}>
        <p className="text-sm text-text-0">2 · Add a Stake-only slot (Twist, Massive, Titan…)</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input required maxLength={191} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="Slot name — e.g. Bank Basher" className={`${input} h-11`} />
          <input required maxLength={120} value={add.provider} onChange={(e) => setAdd({ ...add, provider: e.target.value })} placeholder="Provider — e.g. Twist Gaming" className={`${input} h-11`} />
          <input required maxLength={512} value={add.imageUrl} onChange={(e) => setAdd({ ...add, imageUrl: e.target.value })} placeholder="https://mediumrare.imgix.net/…" className={`${input} h-11`} />
        </div>
        <p className="text-xs text-text-2">On Stake, right-click the game tile → “Copy image address”. The image is downloaded and checked before it is accepted.</p>
        <button disabled={busy} className={`${btn} bg-gold text-bg-0`}>Add Stake-only slot</button>
      </form>

      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}

      {slots.length > 0 && (
        <div>
          <p className="label mb-2">On Stake ({slots.length})</p>
          <ul className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
            {slots.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-bg-1 p-2 text-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-bg-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.imageUrl ? <img src={s.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px] text-text-2">no art</span>}
                </span>
                <span className="min-w-0 flex-1"><span className="block truncate text-text-0">{s.name}</span><span className="block truncate text-xs text-text-2">{s.provider}{s.source === "manual" ? " · Stake-only" : ""}</span></span>
                <button disabled={busy} onClick={() => run({ action: "unmark", ids: [s.id] })} className="text-xs text-text-2 hover:text-danger">Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
