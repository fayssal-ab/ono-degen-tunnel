"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KoMatch, KoParticipant, KoState } from "@/lib/knockout";

// Presentation pieces shared by the admin dashboard, the public page and the
// OBS overlay. Usernames are public Kick chat handles (as on giveaways).

export const ROUND_NAMES: Record<number, string> = { 1: "Round of 16", 2: "Quarter-finals", 3: "Semi-finals", 4: "Finals" };

/** "Round of 16 · Battle 3", "3rd-place match", "Grand Final". */
export function matchLabel(m: Pick<KoMatch, "round" | "match_index">): string {
  if (m.round === 4) return m.match_index === 1 ? "3rd-place match" : "Grand Final";
  return `${ROUND_NAMES[m.round]} · Battle ${m.match_index + 1}`;
}
const STATE_LABEL: Record<KoParticipant["state"], string> = { registered: "Registered", in_knockout: "In knockout", eliminated: "Eliminated", champion: "Champion" };
const STATE_TONE: Record<KoParticipant["state"], string> = {
  registered: "border-cyan/40 text-cyan", in_knockout: "border-volt/40 text-volt", eliminated: "border-danger/40 text-danger", champion: "border-gold/60 text-gold",
};

export function SlotArt({ p, size = 96, fluid, className = "" }: {
  p: Pick<KoParticipant, "slot_image" | "slot_name">; size?: number; className?: string;
  /** CSS length overriding `size` (e.g. clamp(...)) so the art scales with the screen */
  fluid?: string;
}) {
  // A slot typed by the viewer that isn't in the catalogue has no art: show a
  // clean name tile, never a placeholder image.
  const initials = p.slot_name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-gradient-to-br from-bg-3 to-bg-2 ${className}`} style={{ width: fluid ?? size, height: fluid ?? size }}>
      {p.slot_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.slot_image} alt={p.slot_name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-display font-extrabold text-gold" style={{ fontSize: fluid ? `calc(${fluid} * 0.32)` : Math.max(10, size * 0.32) }}>{initials || "?"}</span>
      )}
    </span>
  );
}

export function StateBadge({ state }: { state: KoParticipant["state"] }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>;
}

export function ParticipantRow({ p, index }: { p: KoParticipant; index: number }) {
  return (
    <li className={`entrant-in flex min-w-0 items-center gap-3 rounded-xl border border-line bg-bg-1 p-2 ${p.state === "eliminated" ? "opacity-50" : ""}`}>
      <span className="w-6 text-center font-mono text-xs text-text-2">{index + 1}</span>
      <SlotArt p={p} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-text-0">{p.username}</span>
        <span className="block truncate text-xs text-text-2">{p.slot_name}{p.slot_provider ? ` · ${p.slot_provider}` : ""}</span>
      </span>
      <StateBadge state={p.state} />
    </li>
  );
}

export function Counter({ value, max, open }: { value: number; max: number; open: boolean }) {
  return (
    <div className="flex items-end gap-3">
      <span className="font-display text-5xl font-extrabold tabular-nums text-text-0">{value}<span className="text-text-2">/{max}</span></span>
      <span className={`mb-2 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${open ? "pulse-ring border-volt/50 text-volt" : "border-line-strong text-text-1"}`}>
        {open ? "Registration open" : "Registration closed"}
      </span>
    </div>
  );
}

// Fighter column: art, username, slot, provider, result. Every column has the
// same structure and width (minmax(0,1fr)) so both sides line up and a long
// name truncates instead of running into the VS.
function FighterCard({ p, side, outcome, big, result, showPending }: {
  p: KoParticipant | null; side: "l" | "r"; outcome: "win" | "lose" | null; big: boolean; result?: KoMatch["p1_result"]; showPending?: boolean;
}) {
  const art = big ? "220px" : "clamp(84px, min(24vw, 11vw + 40px), 190px)";
  const anim = side === "l" ? "ko-slide-l" : "ko-slide-r";
  // small (dashboard / public page): each player sits in their own card
  const box = big ? "" : `rounded-2xl border p-3 sm:p-4 ${outcome === "win" ? "border-gold/60 bg-gold/10" : "border-line bg-bg-1/60"}`;
  if (!p) {
    return (
      <div className={`flex min-w-0 flex-col items-center gap-2 text-center ${anim} ${box}`}>
        <span className="grid place-items-center rounded-2xl border border-dashed border-line-strong text-2xl text-text-2" style={{ width: art, height: art }}>?</span>
        <span className="font-display text-xl text-text-2">TBD</span>
      </div>
    );
  }
  return (
    <div className={`flex min-w-0 flex-col items-center gap-1.5 text-center transition-[opacity,filter] duration-500 ${anim} ${box} ${outcome === "lose" ? "opacity-45 grayscale" : ""}`}>
      <div className={`relative mb-1 overflow-hidden rounded-2xl ${outcome === "win" ? "ko-glow" : ""}`}>
        <SlotArt p={p} fluid={art} className="rounded-2xl" />
        <span className="ko-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        {outcome === "win" && <span className="absolute inset-x-0 bottom-0 bg-gold py-1 text-center text-[10px] font-black uppercase tracking-[0.3em] text-bg-0">Winner</span>}
      </div>
      <p className={`w-full truncate font-display font-extrabold leading-tight ${big ? "text-4xl" : "text-[clamp(1rem,3.2vw,1.35rem)]"} ${outcome === "win" ? "text-gold" : "text-text-0"}`}>{p.username}</p>
      <p className={`w-full truncate font-semibold leading-tight ${big ? "text-xl" : "text-sm"} text-cyan`}>{p.slot_name}</p>
      <p className={`w-full truncate leading-tight ${big ? "text-sm" : "text-[10px]"} uppercase tracking-wider text-text-2`}>{p.slot_provider || " "}</p>
      {result ? (
        <div className="mt-2">
          <p className={`font-display font-extrabold tabular-nums leading-none ${big ? "text-6xl" : "text-[clamp(1.5rem,4.5vw,2.1rem)]"} ${outcome === "win" ? "text-gold" : "text-text-1"}`}>x{result.multi}</p>
          <p className={`mt-1 font-mono ${big ? "text-base" : "text-[11px]"} text-text-2`}>${Number(result.payout).toLocaleString("en-US")} / ${Number(result.cost).toLocaleString("en-US")}</p>
        </div>
      ) : showPending ? (
        <p className={`mt-2 font-mono uppercase tracking-[0.2em] text-text-2 ${big ? "text-sm" : "text-[10px]"}`}>Bonus pending</p>
      ) : null}
    </div>
  );
}

/** Animated 1v1 card. `key` it by match id + status so the entrance replays. */
export function VsScreen({ match, big = false }: { match: KoMatch; big?: boolean }) {
  const outcome = (p: KoParticipant | null) => (match.winner_id == null || !p ? null : match.winner_id === p.id ? "win" : "lose");
  const art = big ? "220px" : "clamp(84px, min(24vw, 11vw + 40px), 190px)";
  const pending = match.status === "live";
  return (
    <div className="relative">
      <p className="label mb-4 text-center">
        {matchLabel(match)}
        {match.status === "live" && <span className="ml-2 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">LIVE</span>}
        {match.status === "rolled" && <span className="ml-2 text-gold">· awaiting confirmation</span>}
        {match.status === "bye" && <span className="ml-2 text-volt">· bye</span>}
      </p>
      <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch ${big ? "gap-10" : "gap-2 sm:gap-3"}`}>
        <FighterCard p={match.p1} side="l" outcome={outcome(match.p1)} big={big} result={match.p1_result} showPending={pending} />
        {/* VS sits on the art's centre line, whatever the text below */}
        <span className={`grid place-items-center self-start ${big ? "" : "py-3 sm:py-4"}`} style={{ height: art, boxSizing: "content-box" }}>
          <span className={`ko-vs font-bang leading-none ${big ? "text-8xl" : "text-[clamp(22px,4vw,32px)]"} bg-gradient-to-b from-gold-hi to-magenta bg-clip-text px-1 text-transparent`}>VS</span>
        </span>
        <FighterCard p={match.p2} side="r" outcome={outcome(match.p2)} big={big} result={match.p2_result} showPending={pending} />
      </div>
    </div>
  );
}

type Spinner = Pick<KoParticipant, "username" | "slot_name" | "slot_image" | "slot_provider">;
const BYE: Spinner = { username: "BYE", slot_name: "Free pass", slot_image: "", slot_provider: "" };

/**
 * Roller animation state: the result is already decided server-side
 * (crypto.randomInt) and stored; this only animates it — entrants cycle fast,
 * slow down, land on player 1, then player 2.
 */
export function useRollSpin(match: KoMatch, pool: KoParticipant[], onDone?: () => void) {
  // Snapshot the pool once: the parent re-polls state every ~1.5 s and a new
  // array identity must not restart the reveal.
  const [items] = useState<Spinner[]>(() => (pool.length ? pool.map((p) => ({ ...p })) : [BYE]));
  const [phase, setPhase] = useState<0 | 1 | 2>(0); // 0 spinning p1, 1 spinning p2, 2 done
  const [shown, setShown] = useState<[Spinner, Spinner]>([items[0], items[0]]);
  const done = useRef(onDone);
  const finals = useRef<[Spinner, Spinner]>([match.p1 ?? BYE, match.p2 ?? BYE]);
  useEffect(() => { done.current = onDone; finals.current = [match.p1 ?? BYE, match.p2 ?? BYE]; }, [onDone, match.p1, match.p2]);
  const p1Id = match.p1?.id ?? 0;
  const p2Id = match.p2?.id ?? 0;

  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const [f1, f2] = finals.current;
    if (reduce) {
      timers.push(setTimeout(() => { setShown([f1, f2]); setPhase(2); done.current?.(); }, 0));
      return () => timers.forEach(clearTimeout);
    }
    const spin = (slot: 0 | 1, final: Spinner, then: () => void) => {
      let delay = 45;
      let i = Math.floor(Math.random() * items.length); // visual only
      const step = () => {
        if (cancelled) return;
        i = (i + 1) % items.length;
        setShown((s) => (slot === 0 ? [items[i], s[1]] : [s[0], items[i]]));
        delay *= 1.12;
        if (delay < 420) timers.push(setTimeout(step, delay));
        else { setShown((s) => (slot === 0 ? [final, s[1]] : [s[0], final])); timers.push(setTimeout(then, 750)); }
      };
      step();
    };
    spin(0, f1, () => {
      setPhase(1);
      spin(1, f2, () => { setPhase(2); done.current?.(); });
    });
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [match.id, match.roll_seq, p1Id, p2Id, items]);

  return { phase, shown };
}

/** One roller slot: avatar + username, slot name small underneath. */
export function RollSlot({ s, state, big = false, compact = false }: { s: Spinner | null; state: "waiting" | "spinning" | "locked"; big?: boolean; compact?: boolean }) {
  const art = big ? 132 : compact ? 64 : 72;
  const tone = state === "locked" ? "border-gold/70 bg-gold/10 ko-glow" : state === "spinning" ? "border-line-strong bg-bg-1" : "border-line bg-bg-1/60";
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-2xl border ${compact ? "p-2.5" : "p-3"} transition-colors ${tone}`}>
      {s && state !== "waiting" ? (
        <SlotArt p={s} size={art} className={state === "spinning" ? "opacity-80" : ""} />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-xl border border-dashed border-line-strong text-text-2" style={{ width: art, height: art }}>?</span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className={`block truncate font-display font-extrabold leading-tight ${big ? "text-4xl" : compact ? "text-[18px]" : "text-xl"} ${state === "locked" ? "text-gold" : state === "spinning" ? "text-text-0" : "text-text-2"}`}>
          {s && state !== "waiting" ? s.username : "Waiting…"}
        </span>
        <span className={`mt-0.5 block truncate leading-tight ${big ? "text-lg" : compact ? "text-[12px]" : "text-xs"} ${state === "locked" ? "text-cyan" : "text-text-2"}`}>
          {s && state !== "waiting" ? s.slot_name : " "}
        </span>
      </span>
    </div>
  );
}

/** Roller reveal for the dashboard / big overlay; ends on the VS card. */
export function RollReveal({ match, pool, big = false, onDone }: { match: KoMatch; pool: KoParticipant[]; big?: boolean; onDone?: () => void }) {
  const { phase, shown } = useRollSpin(match, pool, onDone);
  if (phase === 2) return <VsScreen key={`vs-${match.id}`} match={match} big={big} />;
  const st = (slot: 0 | 1) => (phase > slot ? "locked" : phase === slot ? "spinning" : "waiting");
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <p className="label text-gold">Rolling {phase === 0 ? "player 1" : "player 2"}…</p>
      <div className={`grid w-full items-center ${big ? "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-10" : "mx-auto max-w-md grid-cols-1 gap-2"}`}>
        <RollSlot s={shown[0]} state={st(0)} big={big} />
        <span className={`text-center font-bang leading-none ${big ? "text-7xl" : "text-[22px]"} text-text-2`}>VS</span>
        <RollSlot s={shown[1]} state={st(1)} big={big} />
      </div>
    </div>
  );
}

function BracketCell({ m, champion }: { m: KoMatch; champion: number | null }) {
  const row = (p: KoParticipant | null, res: KoMatch["p1_result"]) => {
    const won = p && m.winner_id === p.id;
    const lost = p && m.winner_id != null && m.winner_id !== p.id;
    return (
      <div className={`flex items-center gap-2 px-2 py-1.5 ${won ? "bg-gold/10" : ""} ${lost ? "opacity-40" : ""}`}>
        {p ? <SlotArt p={p} size={26} className="rounded-md" /> : <span className="h-[26px] w-[26px] rounded-md border border-dashed border-line" />}
        <span className={`min-w-0 flex-1 truncate text-xs ${won ? "font-semibold text-gold" : "text-text-1"}`}>{p ? p.username : m.status === "void" ? "—" : "TBD"}</span>
        {res && <span className={`font-mono text-[10px] ${won ? "text-gold" : "text-text-2"}`}>x{res.multi}</span>}
        {won && champion === p?.id && <span className="text-xs">👑</span>}
      </div>
    );
  };
  const tone = m.status === "live" ? "border-danger/60 shadow-[0_0_18px_-6px_var(--color-danger)]" : m.status === "rolled" ? "border-gold/50" : m.winner_id ? "border-gold/30" : "border-line";
  return (
    <div className={`overflow-hidden rounded-lg border bg-bg-2 ${tone} ${m.status === "void" ? "opacity-30" : ""}`}>
      {row(m.p1, m.p1_result)}
      <div className="h-px bg-line" />
      {m.status === "bye" ? <div className="px-2 py-1.5 text-xs text-text-2">bye</div> : row(m.p2, m.p2_result)}
    </div>
  );
}

/** 16-player bracket: horizontal columns on desktop, stacked rounds on mobile. */
export function Bracket16({ state }: { state: KoState }) {
  const champ = state.tournament.champion_id ? Number(state.tournament.champion_id) : null;
  const byRound = (r: number) => state.matches.filter((m) => m.round === r);
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <div className="grid min-w-[960px] grid-cols-5 gap-4">
          {[1, 2, 3, 4].map((r) => (
            <div key={r} className="flex flex-col">
              <p className="label mb-3 text-center">{ROUND_NAMES[r]}</p>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {byRound(r).map((m) => (
                  <div key={m.id}>
                    {r === 4 && <p className="mb-1 text-center text-[10px] uppercase tracking-wider text-text-2">{matchLabel(m)}</p>}
                    <BracketCell m={m} champion={champ} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-col">
            <p className="label mb-3 text-center">Podium</p>
            <div className="flex flex-1 items-center">
              <Podium state={state} compact />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-6 lg:hidden">
        {state.champion && <Podium state={state} compact />}
        {[4, 3, 2, 1].map((r) => (
          <section key={r}>
            <p className="label mb-2">{ROUND_NAMES[r]}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{byRound(r).map((m) => (
              <div key={m.id}>{r === 4 && <p className="mb-1 text-[10px] uppercase tracking-wider text-text-2">{matchLabel(m)}</p>}<BracketCell m={m} champion={champ} /></div>
            ))}</div>
          </section>
        ))}
      </div>
    </>
  );
}

export function ChampionCard({ p, compact = false, celebrate = false }: { p: KoParticipant | null; compact?: boolean; celebrate?: boolean }) {
  const bursts = useMemo(() => Array.from({ length: celebrate ? 28 : 0 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return { bx: `${Math.cos(a) * (160 + (i % 4) * 40)}px`, by: `${Math.sin(a) * (120 + (i % 3) * 40)}px`, c: ["var(--color-gold)", "var(--color-magenta)", "var(--color-cyan)", "var(--color-volt)"][i % 4], d: `${(i % 7) * 0.08}s` };
  }), [celebrate]);
  if (!p) {
    return <div className="w-full rounded-xl border border-dashed border-line p-4 text-center text-sm text-text-2">To be crowned</div>;
  }
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-gold/50 bg-gradient-to-b from-gold/15 to-transparent text-center ko-glow ${compact ? "p-3" : "p-8"}`}>
      {bursts.map((b, i) => (
        <span key={i} className="ko-burst pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
          style={{ background: b.c, animationDelay: b.d, ["--bx" as string]: b.bx, ["--by" as string]: b.by }} />
      ))}
      <p className={`ko-crown ${compact ? "text-2xl" : "text-4xl md:text-6xl"}`}>👑</p>
      <div className={`mx-auto mt-2 w-fit ${compact ? "" : "mt-4"}`}><SlotArt p={p} size={56} fluid={compact ? undefined : "clamp(96px, 28vw, 160px)"} /></div>
      <p className={`mt-2 truncate font-display font-extrabold text-gold ${compact ? "text-base" : "text-3xl md:text-5xl"}`}>{p.username}</p>
      <p className={`truncate text-cyan ${compact ? "text-[11px]" : "text-base md:text-xl"}`}>{p.slot_name}</p>
      {!compact && <p className="mt-2 label text-gold">Tournament champion</p>}
    </div>
  );
}

const MEDAL = ["🥇", "🥈", "🥉"];

/** 1st / 2nd / 3rd with prize amounts. Champion card in the middle, celebrated. */
export function Podium({ state, compact = false }: { state: KoState; compact?: boolean }) {
  const t = state.tournament;
  const places: [KoParticipant | null, string | null][] = [[state.champion, t.prize_1], [state.runnerUp, t.prize_2], [state.third, t.prize_3]];
  if (compact) {
    return (
      <ol className="w-full space-y-2">
        {places.map(([p, amount], i) => (
          <li key={i} className={`flex items-center gap-2 rounded-lg border p-2 ${i === 0 ? "border-gold/50 bg-gold/10" : "border-line bg-bg-2"}`}>
            <span className="text-lg">{MEDAL[i]}</span>
            {p ? <SlotArt p={p} size={28} className="rounded-md" /> : null}
            <span className={`min-w-0 flex-1 truncate text-xs ${i === 0 ? "font-semibold text-gold" : "text-text-1"}`}>{p?.username ?? "—"}</span>
            {amount != null && <span className="font-mono text-[11px] text-text-2">${Number(amount).toLocaleString("en-US")}</span>}
          </li>
        ))}
      </ol>
    );
  }
  const [first, second, third] = places;
  const side = ([p, amount]: [KoParticipant | null, string | null], place: 2 | 3) => (
    <div className={`flex flex-col items-center gap-2 rounded-2xl border border-line bg-bg-2/80 p-4 text-center ${place === 2 ? "ko-slide-l" : "ko-slide-r"}`}>
      <span className="text-4xl">{MEDAL[place - 1]}</span>
      {p ? <SlotArt p={p} size={96} /> : <span className="grid h-24 w-24 place-items-center rounded-xl border border-dashed border-line text-text-2">—</span>}
      <p className="max-w-[14ch] truncate font-display text-xl font-extrabold text-text-0">{p?.username ?? "—"}</p>
      {p && <p className="max-w-[18ch] truncate text-sm text-cyan">{p.slot_name}</p>}
      <p className="label">{place === 2 ? "2nd place" : "3rd place"}{amount != null ? ` · $${Number(amount).toLocaleString("en-US")}` : ""}</p>
    </div>
  );
  return (
    <div className="grid items-end gap-4 md:grid-cols-[1fr_1.3fr_1fr]">
      <div className="order-2 md:order-1">{side(second, 2)}</div>
      <div className="order-1 md:order-2">
        <ChampionCard p={first[0]} celebrate />
        {first[1] != null && <p className="mt-2 text-center font-mono text-lg text-gold">${Number(first[1]).toLocaleString("en-US")}</p>}
      </div>
      <div className="order-3">{side(third, 3)}</div>
    </div>
  );
}
