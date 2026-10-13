"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icon";

// Winner side of the prize ledger: claim (where to send it) → admin pays →
// "I received it". Each step is a small POST; the page refreshes after.
export type Method = "stake" | "rainbet" | "other";
export interface PrizeRow {
  id: number; title: string; source: string; place: number | null; amount: string | null; prize_label: string;
  status: "pending" | "paid"; created_at: string; paid_at: string | null; claimed_at: string | null; received_at: string | null;
  payout_method: Method | null; payout_username: string; claim_note: string;
}
const METHOD: Record<Method, string> = { stake: "Stake", rainbet: "Rainbet", other: "Other" };
const SOURCE: Record<string, string> = { tournament: "Tournament", giveaway: "Giveaway", gb: "Guess the Balance", challenge: "Challenge", manual: "Stream" };
const PLACE = ["", "🥇", "🥈", "🥉"];
const money = (v: string) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const input = "h-10 w-full rounded-xl border border-line bg-bg-2 px-3 text-sm focus:border-gold focus:outline-none";
const btn = "press inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-40";

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json()) as { ok?: boolean; message?: string };
    return d.ok ? null : d.message ?? "Something went wrong. Try again.";
  } catch { return "Network error. Try again."; }
}

export function MethodPicker({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Send to">
      {(Object.keys(METHOD) as Method[]).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)}
          className={`flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${value === m ? "border-gold bg-gold/10 text-gold" : "border-line bg-bg-2 text-text-1 hover:border-line-strong"}`}>
          {m === "other" ? <Icon name="Wallet" className="h-4 w-4" /> : <BrandIcon brand={m} className="h-4 w-4" />} {METHOD[m]}
        </button>
      ))}
    </div>
  );
}

function Steps({ p }: { p: PrizeRow }) {
  const done = [true, p.claimed_at != null, p.status === "paid", p.received_at != null];
  const labels = ["Won", "Claimed", "Paid", "Received"];
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1">
      {labels.map((l, i) => (
        <li key={l} className="text-center">
          <span className={`block h-1.5 rounded-full ${done[i] ? "bg-gold" : "bg-white/10"}`} />
          <span className={`mt-1 block text-[10px] uppercase tracking-wider ${done[i] ? "text-gold" : "text-text-2"}`}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

function PrizeCard({ p, defaults }: { p: PrizeRow; defaults: { method: Method | null; username: string } }) {
  const router = useRouter();
  const [editing, setEditing] = useState(p.status === "pending" && !p.claimed_at);
  const [method, setMethod] = useState<Method>(p.payout_method ?? defaults.method ?? "stake");
  const [username, setUsername] = useState(p.payout_username || defaults.username);
  const [note, setNote] = useState(p.claim_note);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const action = p.status === "pending" && !p.claimed_at ? "claim" : p.status === "paid" && !p.received_at ? "receive" : null;

  async function run(url: string, body: unknown) {
    setBusy(true); setErr(null);
    const e = await post(url, body);
    setBusy(false);
    if (e) setErr(e); else { setEditing(false); router.refresh(); window.dispatchEvent(new Event("odt:me")); }
  }

  return (
    <li className={`rounded-2xl border p-4 ${action ? "border-gold/50 bg-gold/5" : "border-line bg-bg-1"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-lg">{p.place && p.place <= 3 ? PLACE[p.place] : <Icon name="Gift" className="h-5 w-5 text-gold" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-text-0">{p.title || "Prize"}</span>
          <span className="block text-xs text-text-2">{SOURCE[p.source] ?? p.source} · won {p.created_at.slice(0, 10)}</span>
        </span>
        <span className="font-mono text-lg font-bold text-gold">{p.amount != null ? money(p.amount) : p.prize_label || "—"}</span>
      </div>
      <Steps p={p} />

      {p.claimed_at && !editing && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-1">
          <Icon name="Send" className="h-4 w-4 text-text-2" /> Send to <span className="font-semibold text-text-0">{p.payout_method ? METHOD[p.payout_method] : "—"}</span> · <span className="font-mono text-text-0">{p.payout_username}</span>
          {p.status === "pending" && <button onClick={() => setEditing(true)} className="ml-auto text-xs text-gold underline">Edit</button>}
        </p>
      )}
      {p.status === "pending" && p.claimed_at && !editing && <p className="mt-2 text-xs text-text-2">Claimed — waiting for the payment.</p>}

      {editing && p.status === "pending" && (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); run("/api/account/prizes/claim", { id: p.id, method, username, note }); }}>
          <p className="label">Where should we send it?</p>
          <MethodPicker value={method} onChange={setMethod} />
          <input required minLength={2} maxLength={191} value={username} onChange={(e) => setUsername(e.target.value)} className={input}
            placeholder={method === "other" ? "Wallet address / where to send" : `Your ${METHOD[method]} username`} aria-label="Username or address" />
          <input maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder="Note for the team (optional)" aria-label="Note" />
          <div className="flex gap-2">
            <button disabled={busy} className={`${btn} bg-gold text-bg-0 hover:bg-gold-hi`}><Icon name="HandCoins" className="h-4 w-4" /> {p.claimed_at ? "Save" : "Claim prize"}</button>
            {p.claimed_at && <button type="button" onClick={() => setEditing(false)} className={`${btn} border border-line text-text-1`}>Cancel</button>}
          </div>
        </form>
      )}

      {action === "receive" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-text-1">Paid{p.paid_at ? ` on ${p.paid_at.slice(0, 10)}` : ""}. Got it? Confirm so it shows as received.</p>
          <button disabled={busy} onClick={() => { if (window.confirm("Confirm you received this prize?")) run("/api/account/prizes/received", { id: p.id }); }}
            className={`${btn} bg-volt text-bg-0 hover:brightness-110`}><Icon name="CircleCheck" className="h-4 w-4" /> I received it</button>
        </div>
      )}
      {p.received_at && <p className="mt-3 flex items-center gap-2 text-sm text-volt"><Icon name="CircleCheck" className="h-4 w-4" /> Received — thanks for confirming!</p>}
      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
    </li>
  );
}

export function PrizeList({ prizes, defaults }: { prizes: PrizeRow[]; defaults: { method: Method | null; username: string } }) {
  return <ul className="space-y-3">{prizes.map((p) => <PrizeCard key={p.id} p={p} defaults={defaults} />)}</ul>;
}

export function PayoutSettings({ defaults }: { defaults: { method: Method | null; username: string } }) {
  const [method, setMethod] = useState<Method>(defaults.method ?? "stake");
  const [username, setUsername] = useState(defaults.username);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      const err = await post("/api/account/settings", { method, username });
      setBusy(false);
      setMsg(err ? { ok: false, text: err } : { ok: true, text: "Saved. New prize claims use this by default." });
    }}>
      <MethodPicker value={method} onChange={setMethod} />
      <input required minLength={2} maxLength={191} value={username} onChange={(e) => setUsername(e.target.value)} className={input}
        placeholder={method === "other" ? "Wallet address / where to send" : `Your ${METHOD[method]} username`} aria-label="Default payout username" />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className={`${btn} border border-line-strong text-text-0 hover:border-gold hover:text-gold`}>Save</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-volt" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
