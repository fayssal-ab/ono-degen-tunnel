"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// "Crack the tunnel" arcade: detailed CSS planets drift across the screen; hit
// one (click/tap) to knock its HP down, and on the last hit it blows up with a
// BANG + a win. Positions are driven straight on the DOM via refs (no 60fps
// React re-render), HP/booms live in state. Under reduced motion the planets
// sit still but are still hittable.
type PType = { name: string; bg: string; glow: string; ring?: boolean };

const TYPES: PType[] = [
  {
    name: "Earth",
    bg:
      "radial-gradient(circle at 72% 78%, rgba(0,0,0,.45), transparent 55%)," +
      "radial-gradient(circle at 30% 28%, rgba(220,245,255,.9), transparent 22%)," +
      "radial-gradient(16px 11px at 42% 58%, #2f9e5e, transparent 60%)," +
      "radial-gradient(20px 13px at 63% 40%, #37b06a, transparent 60%)," +
      "radial-gradient(11px 9px at 30% 70%, #2f9e5e, transparent 60%)," +
      "radial-gradient(circle at 50% 50%, #2b7fc4, #0c3b68 80%)",
    glow: "0 0 36px -6px #3aa0ff, inset -10px -8px 28px rgba(0,0,0,.55)",
  },
  {
    name: "Mars",
    bg:
      "radial-gradient(circle at 70% 76%, rgba(0,0,0,.45), transparent 55%)," +
      "radial-gradient(circle at 32% 30%, rgba(255,210,180,.8), transparent 22%)," +
      "radial-gradient(18px 11px at 58% 62%, #7a2f1b, transparent 60%)," +
      "radial-gradient(13px 9px at 38% 45%, #8a3a22, transparent 60%)," +
      "radial-gradient(circle at 50% 50%, #c14a1e, #5e220b 82%)",
    glow: "0 0 30px -8px #ff6a3a, inset -10px -8px 26px rgba(0,0,0,.6)",
  },
  {
    name: "Jupiter",
    bg:
      "radial-gradient(circle at 70% 76%, rgba(0,0,0,.4), transparent 55%)," +
      "radial-gradient(15px 10px at 64% 58%, #c0462f, transparent 60%)," +
      "repeating-linear-gradient(0deg, #e3c79a 0 10%, #c69b63 10% 18%, #ddb985 18% 26%, #b07f45 26% 34%, #e8cfa0 34% 42%)",
    glow: "0 0 30px -8px #e0b877, inset -10px -8px 26px rgba(0,0,0,.5)",
  },
  {
    name: "Neptune",
    bg:
      "radial-gradient(circle at 70% 76%, rgba(0,0,0,.45), transparent 55%)," +
      "radial-gradient(circle at 32% 30%, rgba(200,225,255,.7), transparent 22%)," +
      "radial-gradient(18px 11px at 55% 60%, #1b3a8a, transparent 60%)," +
      "radial-gradient(circle at 50% 50%, #2b64d4, #0b1f5e 82%)",
    glow: "0 0 32px -6px #4f7dff, inset -10px -8px 26px rgba(0,0,0,.55)",
  },
  {
    name: "Saturn",
    bg:
      "radial-gradient(circle at 70% 76%, rgba(0,0,0,.4), transparent 55%)," +
      "radial-gradient(circle at 32% 30%, rgba(255,240,210,.7), transparent 22%)," +
      "repeating-linear-gradient(0deg, #e8d3a0 0 14%, #cbae72 14% 26%)",
    glow: "0 0 30px -8px #e6cf9a, inset -10px -8px 26px rgba(0,0,0,.5)",
    ring: true,
  },
  {
    name: "Moon",
    bg:
      "radial-gradient(circle at 70% 76%, rgba(0,0,0,.5), transparent 55%)," +
      "radial-gradient(9px 9px at 40% 42%, #74747e, transparent 62%)," +
      "radial-gradient(7px 7px at 60% 60%, #7c7c85, transparent 62%)," +
      "radial-gradient(6px 6px at 52% 30%, #80808a, transparent 62%)," +
      "radial-gradient(circle at 50% 50%, #c4c4cc, #74747e 85%)",
    glow: "0 0 24px -8px #cfd3dc, inset -10px -8px 24px rgba(0,0,0,.5)",
  },
];

const BANGS = ["BANG!", "BOOM!", "POW!", "KA-POW!"];

interface Live {
  id: number;
  type: PType;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
}
interface Boom {
  id: number;
  x: number;
  y: number;
  reward: number;
  word: string;
  color: string;
}

const MAX_PLANETS = 5;

export function PlanetGame() {
  const arenaRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<Map<number, Live>>(new Map());
  const nodeRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const idRef = useRef(1);

  const [planets, setPlanets] = useState<Live[]>([]);
  const [booms, setBooms] = useState<Boom[]>([]);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const arena = arenaRef.current;
    if (!arena) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function spawn() {
      const a = arenaRef.current;
      if (!a) return;
      const w = a.clientWidth;
      const h = a.clientHeight;
      const type = TYPES[Math.floor(Math.random() * TYPES.length)];
      const size = 48 + Math.round(Math.random() * 54);
      const maxHp = 3 + Math.floor(Math.random() * 3); // 3..5
      // enter from left or right, drift across with a little vertical wander
      const fromLeft = Math.random() < 0.5;
      const speed = 0.25 + Math.random() * 0.5;
      const p: Live = {
        id: idRef.current++,
        type,
        size,
        x: fromLeft ? -size : w + size,
        y: 20 + Math.random() * Math.max(40, h - size - 40),
        vx: fromLeft ? speed : -speed,
        vy: (Math.random() - 0.5) * 0.25,
        hp: maxHp,
        maxHp,
      };
      liveRef.current.set(p.id, p);
      setPlanets((ps) => [...ps, p]);
    }

    if (reduced) {
      // a few static, still hittable
      for (let i = 0; i < 3; i++) spawn();
      liveRef.current.forEach((p) => {
        p.vx = 0;
        p.vy = 0;
      });
      return;
    }

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    spawn();
    spawn();

    function frame(t: number) {
      const a = arenaRef.current;
      const dt = Math.min(48, t - last);
      last = t;
      acc += dt;
      if (a) {
        const w = a.clientWidth;
        const h = a.clientHeight;
        for (const [id, p] of liveRef.current) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y < 8 || p.y > h - p.size - 8) p.vy *= -1;
          const node = nodeRef.current.get(id);
          if (node) node.style.transform = `translate(${p.x}px, ${p.y}px)`;
          if (p.x < -p.size - 60 || p.x > w + p.size + 60) {
            liveRef.current.delete(id);
            setPlanets((ps) => ps.filter((q) => q.id !== id));
          }
        }
        if (acc > 1500 && liveRef.current.size < MAX_PLANETS) {
          acc = 0;
          spawn();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  function hit(id: number) {
    const p = liveRef.current.get(id);
    if (!p) return;
    p.hp -= 1;
    const node = nodeRef.current.get(id);
    if (node) {
      node.classList.remove("planet-hit");
      // reflow to restart the animation
      void node.offsetWidth;
      node.classList.add("planet-hit");
    }
    if (p.hp <= 0) {
      const reward = p.maxHp * 10;
      const boomId = idRef.current++;
      setScore((s) => s + reward);
      setBooms((bs) => [
        ...bs,
        {
          id: boomId,
          x: p.x + p.size / 2,
          y: p.y + p.size / 2,
          reward,
          word: BANGS[Math.floor(Math.random() * BANGS.length)],
          color: p.type.glow.includes("#ff6a3a") ? "var(--color-danger)" : "var(--color-gold)",
        },
      ]);
      setTimeout(() => setBooms((bs) => bs.filter((b) => b.id !== boomId)), 850);
      liveRef.current.delete(id);
      setPlanets((ps) => ps.filter((q) => q.id !== id));
    } else {
      setPlanets((ps) => ps.map((q) => (q.id === id ? { ...q, hp: p.hp } : q)));
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="label">Mini-game</p>
          <h2 className="font-bang text-2xl tracking-wide md:text-3xl">Crack the tunnel</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-sm font-bold text-gold">
          <Icon name="Trophy" className="h-4 w-4" /> {score}
        </span>
      </div>

      <div ref={arenaRef} className="surface relative h-[26rem] overflow-hidden md:h-[30rem]">
        <div className="tunnel-grid absolute inset-0 opacity-40" aria-hidden />
        <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 text-center text-xs text-text-2">
          Hit the planets — blow them up for wins
        </p>

        {planets.map((p) => (
          <button
            key={p.id}
            type="button"
            data-cursor="pointer"
            aria-label={`Hit ${p.type.name}`}
            onPointerDown={() => hit(p.id)}
            ref={(el) => {
              if (el) {
                nodeRef.current.set(p.id, el);
                el.style.transform = `translate(${p.x}px, ${p.y}px)`;
              } else nodeRef.current.delete(p.id);
            }}
            className="planet-sphere absolute left-0 top-0 will-change-transform"
            style={{ width: p.size, height: p.size, background: p.type.bg, boxShadow: p.type.glow }}
          >
            {p.type.ring && (
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border"
                style={{
                  width: p.size * 1.9,
                  height: p.size * 1.9,
                  borderColor: "rgba(230,207,154,.55)",
                  transform: "translate(-50%,-50%) rotate(-22deg) scaleY(.26)",
                  boxShadow: "0 0 16px -4px rgba(230,207,154,.5)",
                }}
              />
            )}
            {/* HP pips */}
            <span className="pointer-events-none absolute -top-3 left-1/2 flex -translate-x-1/2 gap-0.5">
              {Array.from({ length: p.maxHp }).map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: i < p.hp ? "var(--color-gold)" : "transparent", border: i < p.hp ? "none" : "1px solid var(--color-line-strong)" }}
                />
              ))}
            </span>
          </button>
        ))}

        {booms.map((b) => (
          <div key={b.id} className="pointer-events-none absolute" style={{ left: b.x, top: b.y, transform: "translate(-50%,-50%)" }}>
            <div className="planet-pop relative">
              {Array.from({ length: 9 }).map((_, i) => (
                <span
                  key={i}
                  className="planet-shard absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
                  style={{ background: b.color, ["--sx" as string]: `${Math.cos((i / 9) * 6.28) * 100}px`, ["--sy" as string]: `${Math.sin((i / 9) * 6.28) * 100}px` } as React.CSSProperties}
                />
              ))}
            </div>
            <span className="font-bang absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-3xl md:text-4xl" style={{ color: b.color, textShadow: `0 0 18px ${b.color}` }}>
              {b.word}
            </span>
            <span className="absolute left-1/2 top-8 -translate-x-1/2 font-mono text-sm font-bold text-volt neon-volt">+{b.reward}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
