"use client";

import { useCallback, useMemo, useState } from "react";
import type { KoState, KoMatch } from "@/lib/knockout";
import { useKoState } from "./useKoState";
import { KickWebhookPanel } from "@/components/admin/KickWebhookPanel";
import { useJoinReader, type ReaderStatus } from "./useJoinReader";
import { Bracket16, Counter, ParticipantRow, Podium, RollReveal, VsScreen, ROUND_NAMES } from "./parts";

// Live control room for the 16-player knockout. All state comes from the
// server (polled); every button is a server action with backend rule checks.

const btn = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40";
const gold = `${btn} bg-gold text-bg-0 hover:bg-gold-hi`;
const volt = `${btn} bg-volt text-bg-0 hover:brightness-110`;
const ghost = `${btn} border border-line-strong text-text-1 hover:border-gold hover:text-gold`;
const danger = `${btn} border border-danger/50 text-danger hover:bg-danger/10`;

const READER: Record<ReaderStatus, { label: string; tone: string }> = {
  off: { label: "Chat reader off", tone: "text-text-2" },
  connecting: { label: "Connecting to Kick chat…", tone: "text-gold" },
  live: { label: "Listening to Kick chat", tone: "text-volt" },
  reconnecting: { label: "Reconnecting to Kick chat…", tone: "text-gold" },
  error: { label: "Kick chat unreachable — retrying", tone: "text-danger" },
};

const OUTCOME: Record<string, string> = {
  registered: "registered", rerolled: "slot changed", duplicate_message: "duplicate ignored", no_tournament: "no tournament",
  registration_closed: "registration closed", full: "full (16/16)", locked_in_bracket: "locked in bracket", eliminated: "eliminated — ignored",
  pending_roll: "being rolled — ignored", no_slots: "no verified slots!", processing_failed: "server error", network_error: "network error",
};

type Tab = "bracket" | "round" | "qualified" | "eliminated" | "final";

export function KoDashboard({ initial, overlayUrl }: { initial: KoState | null; overlayUrl: string }) {
  const { state, error, refresh } = useKoState(initial, 1500);
  const t = state?.tournament ?? null;
  const running = t != null && (t.status === "open" || t.status === "closed");
  // Kick webhook connected → the server gets chat itself; the browser reader only covers the gap.
  const [webhook, setWebhook] = useState<boolean | null>(null);
  const reader = useJoinReader(running && webhook !== true, refresh);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [revealed, setRevealed] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("bracket");
  const [form, setForm] = useState({ title: "", prize: "", p1: "", p2: "", p3: "" });

  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(t && action !== "create" ? { id: t.id } : {}), ...extra }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; detail?: string | null; error?: string };
      if (!data.ok) setMsg({ tone: "err", text: `${data.message ?? data.error ?? "Refused"}${data.detail ? ` (${data.detail})` : ""}` });
      await refresh();
    } catch {
      setMsg({ tone: "err", text: "Network error — nothing changed. Try again." });
    } finally {
      setBusy(null);
    }
  }, [t, refresh]);

  const pool = useMemo(() => state?.participants.filter((p) => p.state === "registered") ?? [], [state]);
  const focus: KoMatch | null = state?.focus ?? null;
  const firstRoundOpen = state ? state.matches.some((m) => m.round === 1 && m.status === "empty") : false;
  const canRoll = running && !state?.pendingRoll && !state?.live && firstRoundOpen && ((state?.eligible ?? 0) >= 2 || (state?.eligible === 1 && t?.status === "closed"));

  if (!state || !t || !running) {
    return (
      <div className="space-y-6">
        {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">Live state unavailable — check the database connection.</p>}
        {state?.champion && (
          <div className="surface p-6"><p className="label mb-3">Last tournament · {state.tournament.title}</p><Podium state={state} /></div>
        )}
        <form className="surface grid gap-3 p-6 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={(e) => {
          e.preventDefault();
          act("create", { title: form.title, prize: form.prize, prizes: [form.p1 || null, form.p2 || null, form.p3 || null] });
        }}>
          <label className="block"><span className="label">New tournament title</span>
            <input required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Friday Knockout" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none" />
          </label>
          <label className="block"><span className="label">Prize</span>
            <input maxLength={120} value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} placeholder="$500" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none" />
          </label>
          <button disabled={busy !== null} className={gold}>Create tournament</button>
          <div className="grid gap-3 sm:col-span-3 sm:grid-cols-3">
            {(["p1", "p2", "p3"] as const).map((k, i) => (
              <label key={k} className="block"><span className="label">{["🥇 1st", "🥈 2nd", "🥉 3rd"][i]} place prize ($)</span>
                <input inputMode="decimal" pattern="\d{1,9}(\.\d{1,2})?" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={["300", "150", "50"][i]}
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none" />
              </label>
            ))}
            <p className="text-xs text-text-2 sm:col-span-3">The 3 podium prizes are added automatically to Admin → Prizes when the tournament ends; confirm each one once it&apos;s paid.</p>
          </div>
        </form>
        {msg && <p role="alert" className="text-sm text-danger">{msg.text}</p>}
      </div>
    );
  }

  const showRoll = focus && focus.status === "rolled" && revealed !== focus.roll_seq;
  const tabs: { key: Tab; label: string }[] = [
    { key: "bracket", label: "Full bracket" }, { key: "round", label: "Current round" }, { key: "qualified", label: "Qualified" },
    { key: "eliminated", label: "Eliminated" }, { key: "final", label: "Finals" },
  ];
  const currentRound = Math.min(...state.matches.filter((m) => ["empty", "rolled", "ready", "live"].includes(m.status)).map((m) => m.round), 4);

  return (
    <div className="space-y-6">
      <KickWebhookPanel onStatus={setWebhook} />
      {/* header */}
      <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="label">Tournament #{t.id}{t.prize ? ` · ${t.prize}` : ""}</p>
          <h2 className="font-display text-2xl font-extrabold">{t.title}</h2>
          <p className={`mt-1 text-xs ${webhook ? "text-volt" : READER[reader.status].tone}`}>● {webhook ? "Kick chat connected via webhook" : READER[reader.status].label}</p>
          <p className="text-[11px] text-text-2">
            {reader.lastSeen ? <>Last chat message: <span className="text-text-1">{reader.lastSeen.username}</span> at {new Date(reader.lastSeen.at).toLocaleTimeString()}</> : "No chat message received yet on this page"}
          </p>
        </div>
        <Counter value={state.registered} max={t.max_players} open={t.status === "open"} />
        <div className="flex flex-wrap gap-2">
          {t.status === "closed" ? (
            <button disabled={busy !== null || state.registered >= t.max_players} onClick={() => act("open")} className={volt}>Open registration</button>
          ) : (
            <button disabled={busy !== null} onClick={() => act("close", {}, "Close registration? Nobody new can join (registered players can still reroll until they are rolled).")} className={ghost}>Close registration</button>
          )}
          <button disabled={busy !== null} onClick={() => act("reset", {}, "Reset the tournament? It is cancelled and a new one can be created. This cannot be undone.")} className={danger}>Reset</button>
        </div>
      </div>

      {msg && <p role="alert" className={`rounded-xl border p-3 text-sm ${msg.tone === "err" ? "border-danger/40 bg-danger/10" : "border-volt/40 bg-volt/10"}`}>{msg.text}</p>}
      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">Lost connection to the server — retrying. Nothing is lost: the tournament is saved in the database.</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* battle stage */}
        <section className="surface relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,196,81,0.10),transparent_60%)]" />
          <div className="relative">
            {state.champion ? (
              <Podium state={state} />
            ) : focus && focus.status !== "empty" ? (
              showRoll ? (
                <RollReveal key={`roll-${focus.roll_seq}`} match={focus} pool={pool} onDone={() => setRevealed(focus.roll_seq)} />
              ) : (
                <VsScreen key={`${focus.id}-${focus.status}`} match={focus} />
              )
            ) : (
              <div className="py-16 text-center">
                <p className="font-display text-3xl font-extrabold text-text-0">{state.eligible >= 2 || firstRoundOpen ? "Ready to roll" : "Waiting for players"}</p>
                <p className="mt-2 text-sm text-text-2">{state.eligible} player(s) waiting · type <code className="text-gold">!join &lt;slot&gt;</code> in chat to enter</p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <button disabled={busy !== null || !canRoll} onClick={() => act("roll")} className={gold}>🎲 Roll 2 players</button>
              <button disabled={busy !== null || !state.pendingRoll} onClick={() => act("confirm")} className={volt}>Confirm battle</button>
              <button disabled={busy !== null || !state.pendingRoll} onClick={() => act("cancel_roll")} className={ghost}>Cancel roll</button>
              <button disabled={busy !== null || !!state.live || !!state.pendingRoll || !state.nextReady} onClick={() => act("start")} className={volt}>▶ Start battle</button>
            </div>
            {state.live && (
              <BattleResultForm
                key={state.live.id}
                match={state.live}
                busy={busy !== null}
                onSubmit={(p1, p2) => act("result", { matchId: state.live!.id, p1, p2 })}
              />
            )}
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button disabled={busy !== null || !!state.live} onClick={() => act("next")} className={ghost}>Next battle →</button>
            </div>
            {state.eligible === 1 && t.status === "open" && firstRoundOpen && (
              <p className="mt-3 text-center text-xs text-text-2">One player is waiting. Close registration to give them a bye, or wait for another !join.</p>
            )}
          </div>
        </section>

        {/* participants */}
        <section className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="label">Live participants</p>
            <span className="font-mono text-xs text-text-2">{state.eligible} unassigned</span>
          </div>
          {state.participants.length === 0 ? (
            <p className="text-sm text-text-2">{t.status === "open" ? "Waiting for the first !join…" : "Open registration to start collecting !join."}</p>
          ) : (
            <ol className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {state.participants.map((p, i) => <ParticipantRow key={p.id} p={p} index={i} />)}
            </ol>
          )}
          {reader.events.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="label mb-1">Chat log</p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-[11px] text-text-2">
                {reader.events.map((e, i) => <li key={i}><span className="text-text-1">{e.username}</span> · {OUTCOME[e.outcome] ?? e.outcome}{e.slot ? <> → <span className="text-cyan">{e.slot}</span></> : null}</li>)}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* views */}
      <section className="surface p-5">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {tabs.map((x) => (
            <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
              className={`rounded-lg px-3 py-1.5 text-sm ${tab === x.key ? "bg-bg-3 text-gold" : "text-text-1 hover:text-text-0"}`}>{x.label}</button>
          ))}
        </div>
        {tab === "bracket" && <Bracket16 state={state} />}
        {tab === "round" && (
          <div>
            <p className="label mb-3">{ROUND_NAMES[currentRound]}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {state.matches.filter((m) => m.round === currentRound && m.status !== "void").map((m) => (
                <div key={m.id} className="rounded-xl border border-line bg-bg-1 p-4"><VsScreen match={m} /></div>
              ))}
            </div>
          </div>
        )}
        {(tab === "qualified" || tab === "eliminated") && (
          <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {state.participants.filter((p) => (tab === "eliminated" ? p.state === "eliminated" : p.state === "in_knockout" || p.state === "champion")).map((p, i) => <ParticipantRow key={p.id} p={p} index={i} />)}
          </ol>
        )}
        {tab === "final" && (() => {
          const f = state.matches.find((m) => m.round === 4 && m.match_index === 0);
          const b = state.matches.find((m) => m.round === 4 && m.match_index === 1);
          return <div className="space-y-6">{b && <VsScreen match={b} />}{f && <VsScreen match={f} />}</div>;
        })()}
      </section>

      <p className="text-xs text-text-2">
        OBS: add a Browser Source (1920×1080) with <code className="text-gold">{overlayUrl}</code> — it updates by itself and shows no controls. The card fills the source window: resize and place it in OBS. <code className="text-gold">?layout=full</code> gives the big centred version.
      </p>
    </div>
  );
}

type Bonus = { cost: string; payout: string };
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

/** multiplier preview (display only; the server decides with exact decimals) */
function multi(b: Bonus): string | null {
  if (!MONEY.test(b.cost) || !MONEY.test(b.payout) || Number(b.cost) <= 0) return null;
  return (Number(b.payout) / Number(b.cost)).toFixed(2);
}

/**
 * Live battle result: what each player's bonus cost and paid. The higher
 * multiplier wins automatically; exact tie → replay.
 */
function BattleResultForm({ match, busy, onSubmit }: { match: KoMatch; busy: boolean; onSubmit: (p1: Bonus, p2: Bonus) => void }) {
  const [p1, setP1] = useState<Bonus>({ cost: "", payout: "" });
  const [p2, setP2] = useState<Bonus>({ cost: "", payout: "" });
  const m1 = multi(p1), m2 = multi(p2);
  const lead = m1 && m2 ? (Number(m1) > Number(m2) ? 1 : Number(m2) > Number(m1) ? 2 : 0) : null;
  const input = "h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-right font-mono text-sm focus:border-gold focus:outline-none";
  const side = (n: 1 | 2, b: Bonus, set: (v: Bonus) => void, m: string | null) => (
    <div className={`rounded-xl border p-3 ${lead === n ? "border-gold/60 bg-gold/10" : "border-line bg-bg-1"}`}>
      <p className="truncate text-sm font-semibold text-text-0">{(n === 1 ? match.p1 : match.p2)?.username ?? `Player ${n}`}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block"><span className="label">Bonus cost ($)</span>
          <input inputMode="decimal" value={b.cost} onChange={(e) => set({ ...b, cost: e.target.value.trim() })} placeholder="100" className={input} />
        </label>
        <label className="block"><span className="label">Payout ($)</span>
          <input inputMode="decimal" value={b.payout} onChange={(e) => set({ ...b, payout: e.target.value.trim() })} placeholder="125" className={input} />
        </label>
      </div>
      <p className={`mt-2 text-center font-display text-3xl font-extrabold ${lead === n ? "text-gold" : "text-text-1"}`}>{m ? `x${m}` : "x—"}</p>
    </div>
  );
  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => { e.preventDefault(); if (m1 && m2) onSubmit(p1, p2); }}
    >
      <p className="label text-center">Bonus results — the higher multiplier wins automatically</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {side(1, p1, setP1, m1)}
        {side(2, p2, setP2, m2)}
      </div>
      {lead === 0 && <p className="text-center text-sm text-gold">Exact tie — replay the bonus and enter the replay&apos;s results.</p>}
      <div className="flex justify-center">
        <button disabled={busy || !m1 || !m2 || lead === 0} className={gold}>Save result{lead ? ` — ${(lead === 1 ? match.p1 : match.p2)?.username ?? ""} wins` : ""}</button>
      </div>
    </form>
  );
}
