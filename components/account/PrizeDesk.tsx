"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icon";
import { PAYOUT_LABEL, USDC_HINT, USDC_NETWORK, checkDestination, describeDestination, type PayoutMethod } from "@/lib/payout";

// /account/prizes: the winner's prize desk. Claim (where to send it) → admin
// pays → "I received it". Saved payout wallets (Stake, USDC on Ethereum) each
// live on their own card and pre-fill every claim. Each action is a small
// POST; the page refreshes after.

export interface PrizeRow {
  id: number; title: string; source: string; place: number | null; amount: string | null; prize_label: string;
  status: "pending" | "paid"; created_at: string; paid_at: string | null; claimed_at: string | null; received_at: string | null;
  payout_method: string | null; payout_username: string; payout_network: string; claim_note: string;
  discord_channel_id: string | null;
}
export interface Wallets { preferred: PayoutMethod | null; stake: string; usdc: string; network: string }

const SOURCE: Record<string, { label: string; icon: string; tone: string }> = {
  tournament: { label: "Tournament", icon: "Swords", tone: "text-plasma border-plasma/40 bg-plasma/10" },
  giveaway: { label: "Giveaway", icon: "Gift", tone: "text-volt border-volt/40 bg-volt/10" },
  gb: { label: "Guess the Balance", icon: "Gauge", tone: "text-cyan border-cyan/40 bg-cyan/10" },
  challenge: { label: "Challenge", icon: "Target", tone: "text-magenta border-magenta/40 bg-magenta/10" },
  manual: { label: "Stream prize", icon: "Sparkles", tone: "text-gold border-gold/40 bg-gold/10" },
};
const MEDAL = ["", "🥇", "🥈", "🥉"];
const money = (v: string | number) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v: string | null) => (v ? new Date(`${v.replace(" ", "T")}Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

type Stage = "claim" | "claimed" | "paid" | "received";
const stageOf = (p: PrizeRow): Stage => (p.received_at ? "received" : p.status === "paid" ? "paid" : p.claimed_at ? "claimed" : "claim");

const input = "h-11 w-full rounded-xl border border-line bg-bg-2 px-3 text-sm text-text-0 placeholder:text-text-2 focus:border-gold focus:outline-none";
const btn = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-40";

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json()) as { ok?: boolean; message?: string };
    return d.ok ? null : d.message ?? "Something went wrong. Try again.";
  } catch { return "Network error. Try again."; }
}

function useRefresh() {
  const router = useRouter();
  return () => { router.refresh(); window.dispatchEvent(new Event("odt:me")); };
}

// ── method visuals ────────────────────────────────────────────────────────
function MethodMark({ m, className = "h-6 w-6" }: { m: PayoutMethod; className?: string }) {
  if (m === "usdc") {
    return <span className={`grid shrink-0 place-items-center rounded-full bg-[#2775CA] text-white ${className}`}><Icon name="DollarSign" className="h-[60%] w-[60%]" strokeWidth={2.6} /></span>;
  }
  return <BrandIcon brand={m} className={className} />;
}

function MethodTabs({ value, onChange, saved }: { value: PayoutMethod; onChange: (m: PayoutMethod) => void; saved: Wallets }) {
  const has = { stake: !!saved.stake, usdc: !!saved.usdc };
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Send to">
      {(["stake", "usdc"] as PayoutMethod[]).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)}
          className={`press relative flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-semibold transition-colors sm:text-sm ${value === m ? "border-gold bg-gold/10 text-gold shadow-[0_0_24px_-10px_var(--color-gold)]" : "border-line bg-bg-2 text-text-1 hover:border-line-strong"}`}>
          <MethodMark m={m} className="h-8 w-8" />
          {PAYOUT_LABEL[m]}
          {has[m] && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-volt" title="Saved" />}
        </button>
      ))}
    </div>
  );
}


// ── claim ─────────────────────────────────────────────────────────────────
function ClaimPanel({ p, wallets, onCancel }: { p: PrizeRow; wallets: Wallets; onCancel?: () => void }) {
  const refresh = useRefresh();
  const start: PayoutMethod = p.payout_method === "stake" || p.payout_method === "usdc" ? p.payout_method : wallets.preferred ?? (wallets.stake ? "stake" : wallets.usdc ? "usdc" : "stake");
  const [method, setMethod] = useState<PayoutMethod>(start);
  const [values, setValues] = useState<Record<PayoutMethod, string>>({
    stake: p.payout_method === "stake" ? p.payout_username : wallets.stake,
    usdc: p.payout_method === "usdc" ? p.payout_username : wallets.network === USDC_NETWORK ? wallets.usdc : "",
  });
  const [note, setNote] = useState(p.claim_note);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = checkDestination(method, values[method]);
    if (!check.ok) { setErr(check.error); return; }
    setBusy(true); setErr(null);
    const e2 = await post("/api/account/prizes/claim", { id: p.id, method, value: check.dest.value, network: check.dest.network, note, remember });
    setBusy(false);
    if (e2) setErr(e2); else { onCancel?.(); refresh(); }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-2xl border border-gold/30 bg-bg-1/70 p-4">
      <p className="font-display text-sm font-bold uppercase tracking-wider text-text-0">Where should we send it?</p>
      <MethodTabs value={method} onChange={(m) => { setMethod(m); setErr(null); }} saved={wallets} />
      <label className="block">
        <span className="label">{method === "usdc" ? "USDC wallet address (Ethereum)" : "Your Stake username"}</span>
        <input value={values[method]} onChange={(e) => { setValues({ ...values, [method]: e.target.value }); setErr(null); }} maxLength={64} autoComplete="off" spellCheck={false}
          placeholder={method === "usdc" ? USDC_HINT : "username"} className={`${input} mt-1 ${method === "usdc" ? "font-mono" : ""}`} />
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} className={input} placeholder="Note for the team (optional)" aria-label="Note" />
      <label className="flex items-center gap-2 text-sm text-text-1">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[var(--color-gold)]" />
        Save it to my payout wallets
      </label>
      {err && <p role="alert" className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"><Icon name="CircleAlert" className="h-4 w-4 shrink-0" />{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className={`${btn} bg-gold text-bg-0 shadow-[0_8px_30px_-12px_var(--color-gold)] hover:bg-gold-hi`}>
          <Icon name={busy ? "LoaderCircle" : "HandCoins"} className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {p.claimed_at ? "Save" : "Claim prize"}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className={`${btn} border border-line text-text-1 hover:text-text-0`}>Cancel</button>}
      </div>
    </form>
  );
}

// ── prize card ────────────────────────────────────────────────────────────
const STEPS: { key: Stage; label: string; icon: string }[] = [
  { key: "claim", label: "Won", icon: "Trophy" },
  { key: "claimed", label: "Claimed", icon: "Send" },
  { key: "paid", label: "Paid", icon: "Banknote" },
  { key: "received", label: "Received", icon: "CircleCheckBig" },
];

function Tracker({ p }: { p: PrizeRow }) {
  const at = STEPS.findIndex((s) => s.key === stageOf(p));
  return (
    <ol className="relative mt-5 grid grid-cols-4">
      <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-4 h-0.5 rounded-full bg-white/10" />
      <span aria-hidden className="absolute left-[12.5%] top-4 h-0.5 rounded-full bg-gradient-to-r from-gold to-volt transition-all duration-700" style={{ width: `${(at / 3) * 75}%` }} />
      {STEPS.map((s, i) => {
        const done = i <= at;
        const now = i === at && s.key !== "received";
        return (
          <li key={s.key} className="relative flex flex-col items-center gap-1.5">
            <span className={`grid h-8 w-8 place-items-center rounded-full border-2 ${done ? "border-gold bg-gold text-bg-0" : "border-line bg-bg-1 text-text-2"} ${now ? "shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-gold)_25%,transparent)]" : ""} ${s.key === "received" && done ? "border-volt bg-volt" : ""}`}>
              <Icon name={s.icon} className="h-4 w-4" />
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${done ? "text-text-0" : "text-text-2"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PrizeCard({ p, wallets, guildId, focused }: { p: PrizeRow; wallets: Wallets; guildId: string | null; focused: boolean }) {
  const refresh = useRefresh();
  const stage = stageOf(p);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const src = SOURCE[p.source] ?? SOURCE.manual;
  const accent = stage === "claim" ? "from-gold" : stage === "claimed" ? "from-cyan" : stage === "paid" ? "from-plasma" : "from-volt";

  async function received() {
    if (!window.confirm("Confirm you received this prize?")) return;
    setBusy(true); setErr(null);
    const e = await post("/api/account/prizes/received", { id: p.id });
    setBusy(false);
    if (e) setErr(e); else refresh();
  }

  return (
    <li id={`prize-${p.id}`} className={`surface relative scroll-mt-28 overflow-hidden p-5 transition-shadow duration-700 sm:p-6 ${stage === "claim" ? "border-gold/50" : ""} ${focused ? "prize-focus" : ""}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${accent} to-transparent`} />
      {stage === "claim" && <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/15 blur-3xl" />}
      <div className="relative flex flex-wrap items-start gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/25 to-transparent text-2xl">
          {p.place && p.place <= 3 ? MEDAL[p.place] : <Icon name="Gift" className="h-6 w-6 text-gold" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold text-text-0">{p.title || "Prize"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${src.tone}`}><Icon name={src.icon} className="h-3 w-3" />{src.label}</span>
            won {day(p.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-gold sm:text-3xl">{p.amount != null ? money(p.amount) : p.prize_label || "—"}</p>
          {p.amount != null && p.prize_label && <p className="text-xs text-text-2">{p.prize_label}</p>}
        </div>
      </div>

      <Tracker p={p} />

      {stage === "claim" && <ClaimPanel p={p} wallets={wallets} />}

      {p.claimed_at && stage !== "claim" && !editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg-1/70 px-3 py-2.5 text-sm">
          {(p.payout_method === "stake" || p.payout_method === "usdc") && <MethodMark m={p.payout_method} className="h-5 w-5" />}
          <span className="text-text-2">Send to</span>
          <code className="min-w-0 break-all font-mono text-text-0">{describeDestination(p.payout_method, p.payout_username, p.payout_network)}</code>
          {stage === "claimed" && <button onClick={() => setEditing(true)} className="ml-auto text-xs font-semibold text-gold hover:underline">Change</button>}
        </div>
      )}
      {editing && stage === "claimed" && <ClaimPanel p={p} wallets={wallets} onCancel={() => setEditing(false)} />}

      {stage === "claimed" && !editing && <p className="mt-3 flex items-center gap-2 text-sm text-cyan"><Icon name="Clock" className="h-4 w-4" /> Claimed — the team is sending it.</p>}
      {stage === "paid" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-volt/40 bg-volt/10 p-4">
          <Icon name="PartyPopper" className="h-6 w-6 text-volt" />
          <p className="flex-1 text-sm text-text-0">Paid{p.paid_at ? ` on ${day(p.paid_at)}` : ""}! Got it? Confirm so it shows as received.</p>
          <button disabled={busy} onClick={received} className={`${btn} bg-volt text-bg-0 hover:brightness-110`}><Icon name="CircleCheck" className="h-4 w-4" /> I received it</button>
        </div>
      )}
      {stage === "received" && <p className="mt-3 flex items-center gap-2 text-sm text-volt"><Icon name="CircleCheckBig" className="h-4 w-4" /> Received {day(p.received_at)} — GG!</p>}
      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}

      {guildId && p.discord_channel_id && stage !== "received" && (
        <a href={`https://discord.com/channels/${guildId}/${p.discord_channel_id}`} target="_blank" rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#8f99ff] hover:underline">
          <BrandIcon brand="discord" className="h-3.5 w-3.5" /> Your prize ticket on Discord <Icon name="ArrowUpRight" className="h-3 w-3" />
        </a>
      )}
    </li>
  );
}

// ── payout wallets ────────────────────────────────────────────────────────
function WalletCard({ m, wallets }: { m: PayoutMethod; wallets: Wallets }) {
  const refresh = useRefresh();
  const saved = m === "usdc" ? wallets.usdc : wallets[m];
  const [editing, setEditing] = useState(!saved);
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const preferred = wallets.preferred === m;

  async function run(body: object, done: string) {
    setBusy(true); setMsg(null);
    const e = await post("/api/account/payout", body);
    setBusy(false);
    if (e) setMsg({ ok: false, text: e }); else { setMsg({ ok: true, text: done }); setEditing(false); refresh(); }
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    const check = checkDestination(m, value);
    if (!check.ok) { setMsg({ ok: false, text: check.error }); return; }
    run({ action: "save", method: m, value: check.dest.value, network: check.dest.network }, "Saved.");
  }

  return (
    <div className={`surface relative flex flex-col p-5 ${preferred ? "border-gold/50" : ""}`}>
      <div className="flex items-center gap-3">
        <MethodMark m={m} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-text-0">{PAYOUT_LABEL[m]}</p>
          <p className="text-xs text-text-2">{saved ? (m === "usdc" ? "Ethereum (ERC-20)" : "Username saved") : "Not set"}</p>
        </div>
        {saved && (
          <button type="button" disabled={busy || preferred} onClick={() => run({ action: "prefer", method: m }, "Now your default.")}
            title={preferred ? "Default for new claims" : "Make default"} aria-label={preferred ? "Default payout" : `Make ${PAYOUT_LABEL[m]} the default`}
            className={`grid h-9 w-9 place-items-center rounded-lg border ${preferred ? "border-gold/50 bg-gold/15 text-gold" : "border-line text-text-2 hover:text-gold"}`}>
            <Icon name="Star" className={`h-4 w-4 ${preferred ? "fill-current" : ""}`} />
          </button>
        )}
      </div>

      {!editing && saved ? (
        <div className="mt-4 flex flex-1 flex-col justify-between gap-3">
          <code className="block break-all rounded-lg border border-line bg-bg-1 px-3 py-2 font-mono text-sm text-text-0">{saved}</code>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditing(true); setMsg(null); }} className="press inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong text-sm text-text-1 hover:border-gold hover:text-gold"><Icon name="Pencil" className="h-3.5 w-3.5" /> Edit</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove your ${PAYOUT_LABEL[m]}?`)) run({ action: "clear", method: m }, "Removed.").then(() => setValue("")); }}
              className="press inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm text-text-2 hover:border-danger hover:text-danger" aria-label={`Remove ${PAYOUT_LABEL[m]}`}><Icon name="Trash2" className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ) : (
        <form onSubmit={save} className="mt-4 flex flex-1 flex-col gap-3">
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={64} autoComplete="off" spellCheck={false}
            placeholder={m === "usdc" ? USDC_HINT : "Stake username"}
            aria-label={m === "usdc" ? "USDC wallet address" : `${PAYOUT_LABEL[m]} username`} className={`${input} ${m === "usdc" ? "font-mono" : ""}`} />
          <div className="mt-auto flex gap-2">
            <button disabled={busy} className="press inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold text-sm font-bold text-bg-0 hover:bg-gold-hi disabled:opacity-40"><Icon name="Check" className="h-4 w-4" /> Save</button>
            {saved && <button type="button" onClick={() => { setEditing(false); setValue(saved); setMsg(null); }} className="press inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm text-text-1">Cancel</button>}
          </div>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-xs ${msg.ok ? "text-volt" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

// ── page body ─────────────────────────────────────────────────────────────
type Tab = "todo" | "all" | "done";

export function PrizeDesk({ prizes, wallets, guildId }: { prizes: PrizeRow[]; wallets: Wallets; guildId: string | null }) {
  const stats = useMemo(() => {
    const sum = (rows: PrizeRow[]) => rows.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    return {
      total: sum(prizes),
      toClaim: prizes.filter((p) => stageOf(p) === "claim").length,
      onTheWay: prizes.filter((p) => stageOf(p) === "claimed" || stageOf(p) === "paid").length,
      received: sum(prizes.filter((p) => stageOf(p) === "received" || p.status === "paid")),
    };
  }, [prizes]);
  const todo = prizes.filter((p) => stageOf(p) === "claim" || stageOf(p) === "paid");
  const [tab, setTab] = useState<Tab>(todo.length ? "todo" : "all");
  // a notification links to #prize-<id>: show that card (switching to "All" if
  // the current tab hides it), scroll to it and light it up for a moment
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    const go = () => {
      const id = Number(/^#prize-(\d+)$/.exec(window.location.hash)?.[1]);
      if (!id || !prizes.some((p) => p.id === id)) return;
      const p = prizes.find((x) => x.id === id)!;
      const needsAction = stageOf(p) === "claim" || stageOf(p) === "paid";
      setTab((t) => (t === "all" || (t === "todo" && needsAction) ? t : "all"));
      setFocus(id);
      requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`prize-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })));
      window.setTimeout(() => setFocus(null), 2600);
      // handled: drop the hash so a refresh after claiming doesn't jump back
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [prizes]);
  const shown = tab === "todo" ? todo : tab === "done" ? prizes.filter((p) => stageOf(p) === "received") : prizes;

  return (
    <div className="space-y-10">
      {/* trophy case */}
      <section className="relative overflow-hidden rounded-[24px] border border-gold/30 bg-gradient-to-br from-gold/15 via-bg-1 to-plasma/10 p-6 sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-gold/20 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 right-0 h-64 w-64 rounded-full bg-plasma/20 blur-3xl" />
        <div className="relative grid gap-6 sm:grid-cols-[1.4fr_repeat(3,1fr)] sm:items-end">
          <div>
            <p className="label text-gold/80">Total won</p>
            <p className="mt-1 font-mono text-4xl font-bold text-gold drop-shadow-[0_0_24px_rgba(245,196,81,0.35)] sm:text-5xl">{money(stats.total)}</p>
            <p className="mt-1 text-sm text-text-1">{prizes.length} prize{prizes.length === 1 ? "" : "s"} on stream</p>
          </div>
          {[
            { label: "To claim", value: String(stats.toClaim), icon: "HandCoins", tone: stats.toClaim ? "text-gold" : "text-text-0", pulse: stats.toClaim > 0 },
            { label: "On the way", value: String(stats.onTheWay), icon: "Send", tone: "text-cyan", pulse: false },
            { label: "Paid out", value: money(stats.received), icon: "Banknote", tone: "text-volt", pulse: false },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-bg-0/40 p-4 backdrop-blur">
              <p className="label flex items-center gap-1.5"><Icon name={s.icon} className="h-3.5 w-3.5" /> {s.label}
                {s.pulse && <span className="relative ml-auto flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-gold" /></span>}
              </p>
              <p className={`mt-1 font-mono text-2xl font-bold ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {([["todo", `Action needed${todo.length ? ` · ${todo.length}` : ""}`], ["all", "All"], ["done", "Received"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === k ? "bg-gold/15 text-gold" : "text-text-1 hover:bg-bg-2"}`}>{l}</button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="surface flex flex-col items-center gap-2 p-10 text-center">
            <Icon name={tab === "todo" ? "CircleCheckBig" : "Trophy"} className="h-8 w-8 text-text-2" />
            <p className="text-sm text-text-1">{tab === "todo" ? "Nothing to do — you're all caught up." : "No prize here yet. Good luck on stream!"}</p>
          </div>
        ) : (
          <ul className="space-y-4">{shown.map((p) => <PrizeCard key={p.id} p={p} wallets={wallets} guildId={guildId} focused={focus === p.id} />)}</ul>
        )}
      </section>

      <section id="wallets" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-text-0">Payout wallets</h2>
          <p className="mt-1 text-sm text-text-1">Save where you want to get paid. Each one is separate — set one or both. The ⭐ one is used first for new claims, on the site and in your Discord ticket.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(["stake", "usdc"] as PayoutMethod[]).map((m) => <WalletCard key={m} m={m} wallets={wallets} />)}
        </div>
      </section>
    </div>
  );
}
