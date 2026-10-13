"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HuntOverlayState } from "@/lib/bonusHunt";

// Bonus hunt OBS overlay: header stats + the bonus list (slot art, name,
// bet, payout, multiplier). The next bonus to open is highlighted and kept
// in view; the list scrolls by itself as bonuses are opened.

const money = (v: string | number | null | undefined) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Thumb({ src, name }: { src: string | null; name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-[#18223f]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="font-display text-xs font-bold text-gold">{initials}</span>}
    </span>
  );
}

export function HuntOverlay({ initial, rows, side }: { initial: HuntOverlayState | null; rows: number; side: "left" | "right" }) {
  const [state, setState] = useState(initial);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const d = (await (await fetch("/api/bonus-hunt/state", { cache: "no-store" })).json()) as { ok: boolean; state: HuntOverlayState | null };
        if (d.ok && !stop) setState(d.state);
      } catch { /* keep last state */ }
      if (!stop) setTimeout(tick, 2000);
    };
    const t = setTimeout(tick, 2000);
    return () => { stop = true; clearTimeout(t); };
  }, []);

  const nextIndex = useMemo(() => state?.entries.findIndex((e) => e.payout == null) ?? -1, [state]);

  // keep the next bonus (or the end of the list) in view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const target = list.children[nextIndex >= 0 ? nextIndex : list.children.length - 1] as HTMLElement | undefined;
    if (!target) return;
    const top = target.offsetTop - list.clientHeight / 2 + target.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [nextIndex, state?.entries.length]);

  if (!state) return null;
  const { hunt, entries, stats } = state;
  const rowH = 56;
  const pct = stats.count ? Math.round((stats.opened / stats.count) * 100) : 0;
  const profit = stats.profit != null ? Number(stats.profit) : null;

  return (
    <div className={`flex min-h-dvh items-start p-8 ${side === "right" ? "justify-end" : "justify-start"}`}>
      <div className="w-[470px] overflow-hidden rounded-3xl border border-white/10 shadow-2xl" style={{ background: "rgba(5,7,13,0.9)" }}>
        {/* header */}
        <div className="border-b border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-display text-2xl font-extrabold text-white">{hunt.title || "Bonus Hunt"}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${stats.complete ? "bg-gold text-black" : hunt.opening_started_at ? "bg-[#ff4d5e] text-white" : "bg-[#34d399] text-black"}`}>
              {stats.complete ? "Finished" : hunt.opening_started_at ? "Opening" : "Collecting"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase tracking-widest text-white/50">Start</p>
              <p className="font-mono text-sm font-bold text-white">{money(hunt.start_balance)}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase tracking-widest text-white/50">{stats.complete ? "Final" : "Won"}</p>
              <p className="font-mono text-sm font-bold text-[#34d399]">{money(stats.currentWin)}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase tracking-widest text-white/50">{stats.complete ? "Profit" : "Break-even"}</p>
              <p className={`font-mono text-sm font-bold ${stats.complete ? (profit != null && profit < 0 ? "text-[#ff4d5e]" : "text-[#34d399]") : "text-gold"}`}>
                {stats.complete ? `${profit != null && profit < 0 ? "−" : "+"}${money(Math.abs(profit ?? 0))}` : stats.breakEvenX != null ? `x${stats.breakEvenX.toFixed(2)}` : "—"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-white/60">
            <span>{stats.opened} / {stats.count} opened</span>
            <span>Bets {money(stats.sumBets)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#22d3ee,#8b5cf6,#f5c451)" }} />
          </div>
        </div>

        {/* bonus list */}
        {entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-white/60">Collecting bonuses…</p>
        ) : (
          <ol ref={listRef} className="overflow-hidden px-3 py-2" style={{ height: Math.min(entries.length, rows) * rowH + 16 }}>
            {entries.map((e, i) => {
              const opened = e.payout != null;
              const mult = opened && Number(e.bet) > 0 ? Number(e.payout) / Number(e.bet) : null;
              const next = i === nextIndex;
              return (
                <li key={e.id} className={`flex items-center gap-3 rounded-xl px-2 transition-colors duration-500 ${next ? "bg-gold/15 ring-1 ring-gold/60" : ""}`} style={{ height: rowH }}>
                  <span className="w-6 text-center font-mono text-xs text-white/40">{i + 1}</span>
                  <Thumb src={e.image_url} name={e.slot_name} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${opened ? "text-white/70" : "text-white"}`}>{e.slot_name}</span>
                    <span className="block truncate text-[11px] text-white/45">{next ? <span className="font-bold text-gold">NEXT UP</span> : e.provider || " "}</span>
                  </span>
                  <span className="w-[70px] text-right font-mono text-xs text-white/60">{money(e.bet)}</span>
                  <span className="w-[86px] text-right">
                    {opened ? (
                      <>
                        <span className="block font-mono text-xs text-white">{money(e.payout)}</span>
                        <span className={`block font-mono text-sm font-bold ${mult == null ? "text-white/50" : mult >= 100 ? "text-[#34d399]" : mult >= 1 ? "text-gold" : "text-[#ff4d5e]"}`}>
                          {mult != null ? `x${mult.toFixed(2)}` : "—"}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-xs text-white/35">—</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {(stats.bestHit || stats.worstHit) && (
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3 text-xs">
            <p className="truncate text-white/60">Best <span className="font-mono font-bold text-[#34d399]">{stats.bestHit ? `x${stats.bestHit.multiplier.toFixed(2)}` : "—"}</span> {stats.bestHit?.entry.slot_name}</p>
            <p className="truncate text-right text-white/60">Worst <span className="font-mono font-bold text-[#ff4d5e]">{stats.worstHit ? `x${stats.worstHit.multiplier.toFixed(2)}` : "—"}</span> {stats.worstHit?.entry.slot_name}</p>
          </div>
        )}
      </div>
    </div>
  );
}
