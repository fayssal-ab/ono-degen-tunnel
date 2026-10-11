"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

// Little hit-game: each planet has 5 HP. Click it 5× (HP pips are tiny planet
// icons) and it cracks open, revealing what it is — an ONO feature with a link.
// Replaces a wall of feature copy with something you play. Keyboard-accessible
// (Enter/Space) and harmless under reduced motion (animations just no-op).
type Planet = {
  id: string;
  label: string;
  blurb: string;
  href: string;
  cta: string;
  from: string;
  to: string;
  pos: React.CSSProperties;
  size: number;
};

const PLANETS: Planet[] = [
  { id: "gw", label: "Giveaways", blurb: "Free to enter, drawn live, provably fair.", href: "/giveaways", cta: "Enter", from: "#34d399", to: "#0b3b2e", pos: { top: "14%", left: "12%" }, size: 96 },
  { id: "lb", label: "Leaderboard", blurb: "Wager under the code. Climb. Split the pool.", href: "/leaderboard", cta: "Climb", from: "#ffd97a", to: "#5a3f12", pos: { top: "52%", left: "32%" }, size: 118 },
  { id: "vip", label: "VIP Club", blurb: "The deeper you go, the bigger the perks.", href: "/vip", cta: "See tiers", from: "#8b5cf6", to: "#241046", pos: { top: "20%", right: "14%" }, size: 108 },
  { id: "rc", label: "Races", blurb: "24h & weekly sprints for cash.", href: "/races", cta: "Race", from: "#22d3ee", to: "#083947", pos: { bottom: "12%", right: "26%" }, size: 84 },
];

const MAX_HP = 5;

export function PlanetGame() {
  const [hp, setHp] = useState<Record<string, number>>(() => Object.fromEntries(PLANETS.map((p) => [p.id, MAX_HP])));
  const [cracked, setCracked] = useState<Record<string, boolean>>({});
  const [reveal, setReveal] = useState<Planet | null>(null);
  const [hit, setHit] = useState<string | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const done = PLANETS.filter((p) => cracked[p.id]).length;

  function strike(p: Planet) {
    if (cracked[p.id]) return;
    setHit(p.id);
    if (hitTimer.current) clearTimeout(hitTimer.current);
    hitTimer.current = setTimeout(() => setHit(null), 180);
    setHp((prev) => {
      const next = Math.max(0, (prev[p.id] ?? MAX_HP) - 1);
      if (next === 0) {
        setCracked((c) => ({ ...c, [p.id]: true }));
        setReveal(p);
      }
      return { ...prev, [p.id]: next };
    });
  }

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="label">Mini-game</p>
          <h2 className="font-bang text-2xl tracking-wide md:text-3xl">Crack the tunnel</h2>
        </div>
        <span className="font-mono text-sm text-text-2">{done}/{PLANETS.length} found</span>
      </div>

      <div className="surface relative h-[26rem] overflow-hidden md:h-[24rem]">
        <div className="tunnel-grid absolute inset-0 opacity-40" aria-hidden />

        {PLANETS.map((p) => {
          const left = hp[p.id] ?? MAX_HP;
          const isCracked = cracked[p.id];
          return (
            <div key={p.id} className="absolute flex flex-col items-center gap-2" style={p.pos}>
              {/* HP pips as little planet icons */}
              <div className={`flex gap-1 transition-opacity ${isCracked ? "opacity-0" : "opacity-100"}`}>
                {Array.from({ length: MAX_HP }).map((_, i) => (
                  <span
                    key={i}
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: i < left ? `radial-gradient(circle at 32% 30%, ${p.from}, ${p.to})` : "transparent",
                      border: `1px solid ${i < left ? "transparent" : "var(--color-line-strong)"}`,
                      boxShadow: i < left ? `0 0 8px -2px ${p.from}` : "none",
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                aria-label={`Hit ${p.label} (${left} left)`}
                onClick={() => strike(p)}
                data-cursor="pointer"
                className={`planet-sphere relative ${hit === p.id ? "planet-hit" : ""} ${isCracked ? "planet-pop pointer-events-none" : ""}`}
                style={{
                  width: p.size,
                  height: p.size,
                  background: `radial-gradient(circle at 34% 30%, ${p.from} 0%, ${p.to} 62%, #060810 100%)`,
                  boxShadow: `0 0 50px -10px color-mix(in srgb, ${p.from} 55%, transparent), inset -16px -12px 46px rgba(0,0,0,0.6)`,
                }}
              >
                {/* shards on crack */}
                {isCracked &&
                  Array.from({ length: 7 }).map((_, i) => (
                    <span
                      key={i}
                      className="planet-shard absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
                      style={
                        {
                          background: p.from,
                          "--sx": `${Math.cos((i / 7) * 6.28) * 90}px`,
                          "--sy": `${Math.sin((i / 7) * 6.28) * 90}px`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
              </button>

              <span className={`font-mono text-xs uppercase tracking-wide transition-colors ${isCracked ? "text-text-2" : "text-text-1"}`}>
                {isCracked ? p.label : "???"}
              </span>
            </div>
          );
        })}

        {/* reveal readout */}
        {reveal && (
          <div className="pop-in absolute inset-x-3 bottom-3 mx-auto max-w-md rounded-2xl border border-line-strong bg-bg-1/90 p-4 backdrop-blur md:inset-x-auto md:left-1/2 md:-translate-x-1/2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bang text-lg tracking-wide text-gradient-gold">{reveal.label}</p>
                <p className="truncate text-sm text-text-1">{reveal.blurb}</p>
              </div>
              <Link href={reveal.href} className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-gold px-3 text-sm font-semibold text-bg-0 hover:bg-gold-hi">
                {reveal.cta} <Icon name="ArrowRight" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {done === PLANETS.length && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-volt/40 bg-volt/10 px-3 py-1 text-xs font-semibold text-volt">
            <Icon name="Check" className="h-3.5 w-3.5" /> Tunnel mapped
          </div>
        )}
      </div>
    </section>
  );
}
