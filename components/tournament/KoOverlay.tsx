"use client";

import { useMemo, useState } from "react";
import type { KoMatch, KoParticipant, KoState } from "@/lib/knockout";
import { useKoState } from "./useKoState";
import { Podium, RollReveal, RollSlot, VsScreen, matchLabel, SlotArt, useRollSpin } from "./parts";

// Stream overlay. Default: a compact card, sized to its content, in a corner
// of the 1920×1080 scene — registration call-to-action with the latest picks,
// then the live battle (avatars, names, slots), then the podium. No title or
// prize bar: only the players. `layout=full` keeps the big centred version.
// Transparent everywhere except the card.

export type OverlayPos = "bl" | "br" | "tl" | "tr";
const POS: Record<OverlayPos, string> = {
  bl: "items-end justify-start", br: "items-end justify-end", tl: "items-start justify-start", tr: "items-start justify-end",
};
const money = (v: string | number) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function KoOverlay({ initial, layout = "compact", pos = "bl" }: { initial: KoState | null; layout?: "compact" | "full"; pos?: OverlayPos }) {
  const { state } = useKoState(initial, 1200);
  const [revealed, setRevealed] = useState<number | null>(null);
  const pool = useMemo(() => state?.participants.filter((p) => p.state === "registered") ?? [], [state]);
  if (!state) return null;
  if (layout === "full") return <FullOverlay state={state} pool={pool} revealed={revealed} setRevealed={setRevealed} />;

  const t = state.tournament;
  const focus = state.focus && state.focus.status !== "empty" && state.focus.status !== "void" ? state.focus : null;
  const rolling = focus?.status === "rolled" && revealed !== focus.roll_seq;
  const match = focus ?? (t.status === "closed" ? state.nextReady : null);

  let body: React.ReactNode = null;
  if (state.champion) {
    body = <CompactPodium state={state} />;
  } else if (match) {
    body = rolling && focus
      ? <CompactRoll key={`roll-${focus.roll_seq}`} match={focus} pool={pool} onDone={() => setRevealed(focus.roll_seq)} />
      : <CompactBattle key={`${match.id}-${match.status}-${match.winner_id}`} match={match} />;
  } else if (t.status === "open") {
    body = <CompactJoin state={state} />;
  } else if (t.status === "closed" && state.registered > 0) {
    body = <p className="px-6 py-8 text-center font-display text-[24px] font-extrabold text-text-0">Bracket rolling soon<span className="mt-1 block font-sans text-[14px] font-normal text-text-2">{state.registered} players in</span></p>;
  } else {
    return null;
  }

  return (
    <div className={`flex min-h-dvh p-10 ${POS[pos]}`}>
      <div className="w-[660px] overflow-hidden rounded-3xl border border-white/10 shadow-2xl" style={{ background: "rgba(5,7,13,0.9)" }}>
        {body}
      </div>
    </div>
  );
}

function CompactJoin({ state }: { state: KoState }) {
  const t = state.tournament;
  const latest = [...state.participants].reverse().slice(0, 5);
  const pct = Math.min(100, Math.round((state.registered / t.max_players) * 100));
  return (
    <div className="grid grid-cols-[1fr_270px] gap-5 p-5">
      <div className="flex flex-col">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-2">Type in Kick chat</p>
        <p className="mt-1 whitespace-nowrap font-bang text-[56px] leading-none text-gold">!JOIN <span className="text-[26px] text-text-1">&lt;SLOT&gt;</span></p>
        <p className="mt-4 text-[13px] leading-snug text-text-1">Type it again with another slot to change your pick. {t.max_players}-player knockout, one battle at a time — higher multiplier goes through.</p>
        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-2">Bracket</span>
            <span className="font-display text-[26px] font-extrabold leading-none tabular-nums text-text-0">{state.registered}<span className="text-[16px] text-text-2"> / {t.max_players} seats</span></span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-volt via-cyan to-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-text-2">Latest picks</p>
        {latest.length ? (
          <ol className="space-y-1.5">
            {latest.map((p) => (
              <li key={`${p.id}-${p.slot_name}`} className="entrant-in flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
                <SlotArt p={p} size={38} className="rounded-lg" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold leading-tight text-text-0">{p.username}</span>
                  <span className="block truncate text-[11px] leading-tight text-cyan">{p.slot_name}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-[14px] text-text-2">Be the first to join</p>
        )}
      </div>
    </div>
  );
}

function CompactFighter({ p, side, outcome, result, live }: { p: KoParticipant | null; side: "l" | "r"; outcome: "win" | "lose" | null; result: KoMatch["p1_result"]; live: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col items-center rounded-2xl border p-3 text-center transition-[opacity,filter] duration-500 ${side === "r" ? "ko-slide-r" : "ko-slide-l"}
      ${outcome === "win" ? "ko-glow border-gold/60 bg-gold/10" : "border-white/10 bg-white/[0.03]"} ${outcome === "lose" ? "opacity-45 grayscale" : ""}`}>
      {p ? (
        <span className="relative">
          <SlotArt p={p} size={108} />
          {outcome === "win" && <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-gold py-0.5 text-center text-[9px] font-black uppercase tracking-[0.25em] text-bg-0">Winner</span>}
        </span>
      ) : <span className="grid h-[108px] w-[108px] shrink-0 place-items-center rounded-xl border border-dashed border-white/20 text-text-2">?</span>}
      <span className={`mt-2 block w-full truncate font-display text-[20px] font-extrabold leading-tight ${outcome === "win" ? "text-gold" : "text-text-0"}`}>{p?.username ?? "TBD"}</span>
      <span className="block w-full truncate text-[13px] leading-tight text-cyan">{p?.slot_name ?? "\u00a0"}</span>
      <span className="block w-full truncate text-[10px] uppercase leading-tight tracking-wider text-text-2">{p?.slot_provider || "\u00a0"}</span>
      {result ? (
        <span className="mt-2 block">
          <span className={`block font-display text-[30px] font-extrabold tabular-nums leading-none ${outcome === "win" ? "text-gold" : "text-text-1"}`}>x{result.multi}</span>
          <span className="mt-1 block font-mono text-[11px] text-text-2">{money(result.payout)} / {money(result.cost)}</span>
        </span>
      ) : (
        <span className="mt-2 block rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-text-2">{live ? "Bonus pending" : "Ready"}</span>
      )}
    </div>
  );
}

function CompactBattle({ match }: { match: KoMatch }) {
  const outcome = (p: KoParticipant | null) => (match.winner_id == null || !p ? null : match.winner_id === p.id ? "win" : "lose");
  const live = match.status === "live";
  return (
    <div className="p-5">
      {match.round === 4 && <p className="mb-3 text-center font-bang text-[24px] tracking-widest text-gold">{matchLabel(match)}</p>}
      {match.status === "bye" ? (
        <div className="mx-auto max-w-sm"><CompactFighter p={match.p1} side="l" outcome="win" result={null} live={false} /><p className="mt-2 text-center text-xs text-volt">Bye — goes through</p></div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <CompactFighter p={match.p1} side="l" outcome={outcome(match.p1)} result={match.p1_result} live={live} />
          <span className="ko-vs bg-gradient-to-b from-gold-hi to-magenta bg-clip-text px-1 font-bang text-[40px] leading-none text-transparent">VS</span>
          <CompactFighter p={match.p2} side="r" outcome={outcome(match.p2)} result={match.p2_result} live={live} />
        </div>
      )}
    </div>
  );
}

function CompactRoll({ match, pool, onDone }: { match: KoMatch; pool: KoParticipant[]; onDone: () => void }) {
  const { phase, shown } = useRollSpin(match, pool, onDone);
  const st = (slot: 0 | 1) => (phase > slot ? "locked" : phase === slot ? "spinning" : "waiting");
  return (
    <div className="p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <RollSlot s={shown[0]} state={st(0)} compact />
        <span className="px-1 font-bang text-[32px] leading-none text-text-2">VS</span>
        <RollSlot s={shown[1]} state={st(1)} compact />
      </div>
    </div>
  );
}

function CompactPodium({ state }: { state: KoState }) {
  const t = state.tournament;
  const rows: [KoParticipant | null, string | null][] = [[state.champion, t.prize_1], [state.runnerUp, t.prize_2], [state.third, t.prize_3]];
  return (
    <ol className="space-y-2 p-5">
      {rows.map(([p, amount], i) => (
        <li key={i} className={`flex items-center gap-3 rounded-2xl border p-2.5 ${i === 0 ? "ko-glow border-gold/60 bg-gold/10" : "border-white/10 bg-white/[0.03]"}`}>
          <span className="w-9 text-center text-[24px]">{["👑", "🥈", "🥉"][i]}</span>
          {p ? <SlotArt p={p} size={i === 0 ? 64 : 48} /> : null}
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-display font-extrabold leading-tight ${i === 0 ? "text-[24px] text-gold" : "text-[18px] text-text-0"}`}>{p?.username ?? "—"}</span>
            {p && <span className="block truncate text-[12px] text-cyan">{p.slot_name}</span>}
          </span>
          {amount != null && <span className={`font-mono text-[14px] font-bold ${i === 0 ? "text-gold" : "text-text-1"}`}>{money(amount)}</span>}
        </li>
      ))}
    </ol>
  );
}

function FullOverlay({ state, pool, revealed, setRevealed }: { state: KoState; pool: KoParticipant[]; revealed: number | null; setRevealed: (n: number) => void }) {
  const t = state.tournament;
  const focus = state.focus;
  const card = "rounded-3xl border border-line-strong p-10 shadow-2xl";
  const bg = { background: "rgba(5,7,13,0.88)" };

  let body: React.ReactNode = null;
  if (state.champion) {
    body = <div className={`${card} w-[1400px]`} style={bg}><Podium state={state} /></div>;
  } else if (focus && focus.status !== "empty" && focus.status !== "void") {
    body = (
      <div className={`${card} w-[1500px]`} style={bg}>
        {focus.round === 4 && <p className="mb-2 text-center font-bang text-5xl tracking-widest text-gold">{focus.match_index === 0 ? "GRAND FINAL" : "3RD PLACE MATCH"}</p>}
        {focus.status === "rolled" && revealed !== focus.roll_seq ? (
          <RollReveal key={`roll-${focus.roll_seq}`} match={focus} pool={pool} big onDone={() => setRevealed(focus.roll_seq ?? 0)} />
        ) : (
          <VsScreen key={`${focus.id}-${focus.status}-${focus.winner_id}`} match={focus} big />
        )}
      </div>
    );
  } else if (t.status === "open") {
    const latest = [...state.participants].slice(-6).reverse();
    body = (
      <div className={`${card} w-[1100px] text-center`} style={bg}>
        <p className="label text-volt">{t.title}</p>
        <p className="mt-3 font-bang text-7xl tracking-wide text-text-0">TYPE <span className="text-gold">!JOIN &lt;SLOT&gt;</span> IN CHAT</p>
        <p className="mt-4 font-display text-6xl font-extrabold tabular-nums text-text-0">{state.registered}<span className="text-text-2">/{t.max_players}</span></p>
        <div className="mt-8 grid grid-cols-3 gap-4">
          {latest.map((p) => (
            <div key={p.id} className="entrant-in flex items-center gap-3 rounded-2xl border border-line bg-bg-1 p-3 text-left">
              <SlotArt p={p} size={64} />
              <span className="min-w-0"><span className="block truncate text-xl font-bold text-text-0">{p.username}</span><span className="block truncate text-sm text-cyan">{p.slot_name}</span></span>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (state.nextReady) {
    body = <div className={`${card} w-[1500px]`} style={bg}><p className="label mb-2 text-center">Up next · {matchLabel(state.nextReady)}</p><VsScreen match={state.nextReady} big /></div>;
  }

  return <div className="flex min-h-dvh items-center justify-center p-10">{body}</div>;
}
