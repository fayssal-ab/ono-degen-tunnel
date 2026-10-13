"use client";

import type { KoState } from "@/lib/knockout";
import { useKoState } from "./useKoState";
import { Bracket16, Counter, ParticipantRow, Podium, VsScreen } from "./parts";

// Public live view: refreshes every few seconds while a tournament runs.
export function KoPublic({ initial, id }: { initial: KoState; id?: number }) {
  const running = initial.tournament.status === "open" || initial.tournament.status === "closed";
  const { state } = useKoState(initial, running ? 4000 : 60_000, id);
  const s = state ?? initial;
  const t = s.tournament;
  const current = s.live ?? s.focus;

  return (
    <div className="space-y-8">
      <div className="surface flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="label">{t.prize ? `Prize · ${t.prize}` : "Knockout"}</p>
          <h2 className="font-display text-3xl font-extrabold">{t.title}</h2>
          {t.status === "open" && <p className="mt-1 text-sm text-text-1">Type <code className="rounded bg-bg-3 px-1.5 text-gold">!join Gates of Olympus</code> in Kick chat to enter with that slot (plain <code className="rounded bg-bg-3 px-1.5 text-gold">!join</code> = random slot). Type it again before you&apos;re drawn to change your slot.</p>}
        </div>
        <Counter value={s.registered} max={t.max_players} open={t.status === "open"} />
      </div>

      {s.champion ? (
        <Podium state={s} />
      ) : current && current.status !== "empty" && current.status !== "void" ? (
        <section className="surface p-6"><VsScreen key={`${current.id}-${current.status}-${current.winner_id}`} match={current} /></section>
      ) : null}

      <section className="surface p-5">
        <p className="label mb-4">Bracket</p>
        <Bracket16 state={s} />
      </section>

      {s.participants.length > 0 && (
        <section>
          <p className="label mb-3">Players ({s.registered})</p>
          <ol className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">{s.participants.map((p, i) => <ParticipantRow key={p.id} p={p} index={i} />)}</ol>
        </section>
      )}
    </div>
  );
}
