"use client";

import { useMemo, useState } from "react";
import type { KoState } from "@/lib/knockout";
import { useKoState } from "./useKoState";
import { Podium, RollReveal, VsScreen, matchLabel, SlotArt } from "./parts";

// Stream overlay: current battle with VS / roll reveal / winner, grand final
// and champion celebration; during registration a !join call-to-action with
// the latest entrants. Transparent everywhere except the card.

export function KoOverlay({ initial }: { initial: KoState | null }) {
  const { state } = useKoState(initial, 1200);
  const [revealed, setRevealed] = useState<number | null>(null);
  const pool = useMemo(() => state?.participants.filter((p) => p.state === "registered") ?? [], [state]);
  if (!state) return null;
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
          <RollReveal key={`roll-${focus.roll_seq}`} match={focus} pool={pool} big onDone={() => setRevealed(focus.roll_seq)} />
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
