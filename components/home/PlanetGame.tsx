"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Full-screen ambient arcade: roughly one detailed planet drifts across the
// whole viewport every ~15s. Click/tap one to knock its HP down; the last hit
// blows it up with a BANG + a win (score HUD, saved per browser). The overlay
// is pointer-events:none except the planets, so the rest of the page stays
// fully usable. Positions are driven on the DOM via refs (no 60fps re-render);
// pauses when the tab is hidden and when the user prefers reduced motion.
type PType = { name: string; bg: string; glow: string; ring?: boolean };

const TYPES: PType[] = [
  { name: "Earth", bg: "radial-gradient(circle at 72% 78%, rgba(0,0,0,.45), transparent 55%),radial-gradient(circle at 30% 28%, rgba(220,245,255,.9), transparent 22%),radial-gradient(16px 11px at 42% 58%, #2f9e5e, transparent 60%),radial-gradient(20px 13px at 63% 40%, #37b06a, transparent 60%),radial-gradient(11px 9px at 30% 70%, #2f9e5e, transparent 60%),radial-gradient(circle at 50% 50%, #2b7fc4, #0c3b68 80%)", glow: "0 0 40px -6px #3aa0ff, inset -10px -8px 28px rgba(0,0,0,.55)" },
  { name: "Mars", bg: "radial-gradient(circle at 70% 76%, rgba(0,0,0,.45), transparent 55%),radial-gradient(circle at 32% 30%, rgba(255,210,180,.8), transparent 22%),radial-gradient(18px 11px at 58% 62%, #7a2f1b, transparent 60%),radial-gradient(13px 9px at 38% 45%, #8a3a22, transparent 60%),radial-gradient(circle at 50% 50%, #c14a1e, #5e220b 82%)", glow: "0 0 34px -8px #ff6a3a, inset -10px -8px 26px rgba(0,0,0,.6)" },
  { name: "Jupiter", bg: "radial-gradient(circle at 70% 76%, rgba(0,0,0,.4), transparent 55%),radial-gradient(15px 10px at 64% 58%, #c0462f, transparent 60%),repeating-linear-gradient(0deg, #e3c79a 0 10%, #c69b63 10% 18%, #ddb985 18% 26%, #b07f45 26% 34%, #e8cfa0 34% 42%)", glow: "0 0 34px -8px #e0b877, inset -10px -8px 26px rgba(0,0,0,.5)" },
  { name: "Neptune", bg: "radial-gradient(circle at 70% 76%, rgba(0,0,0,.45), transparent 55%),radial-gradient(circle at 32% 30%, rgba(200,225,255,.7), transparent 22%),radial-gradient(18px 11px at 55% 60%, #1b3a8a, transparent 60%),radial-gradient(circle at 50% 50%, #2b64d4, #0b1f5e 82%)", glow: "0 0 36px -6px #4f7dff, inset -10px -8px 26px rgba(0,0,0,.55)" },
  { name: "Saturn", bg: "radial-gradient(circle at 70% 76%, rgba(0,0,0,.4), transparent 55%),radial-gradient(circle at 32% 30%, rgba(255,240,210,.7), transparent 22%),repeating-linear-gradient(0deg, #e8d3a0 0 14%, #cbae72 14% 26%)", glow: "0 0 34px -8px #e6cf9a, inset -10px -8px 26px rgba(0,0,0,.5)", ring: true },
];

const BANGS = ["BANG!", "BOOM!", "POW!", "KA-POW!"];
const SPAWN_MS = 15000;
const MAX_ON_SCREEN = 2;

interface Live { id: number; type: PType; size: number; x: number; y: number; vx: number; vy: number; hp: number; maxHp: number }
interface Boom { id: number; x: number; y: number; reward: number; word: string; color: string }

export function PlanetGame() {
  const liveRef = useRef<Map<number, Live>>(new Map());
  const nodeRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const idRef = useRef(1);
  const [planets, setPlanets] = useState<Live[]>([]);
  const [booms, setBooms] = useState<Boom[]>([]);
  const [score, setScore] = useState(0);

  useEffect(() => {
    try {
      const s = Number(localStorage.getItem("odt.wins") || "0");
      if (s > 0) setScore(s);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function spawn() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const type = TYPES[Math.floor(Math.random() * TYPES.length)];
      const size = 56 + Math.round(Math.random() * 46);
      const maxHp = 3 + Math.floor(Math.random() * 3);
      const fromLeft = Math.random() < 0.5;
      const speed = 0.018 + Math.random() * 0.02; // px per ms
      const p: Live = {
        id: idRef.current++,
        type,
        size,
        x: fromLeft ? -size : w + size,
        y: 90 + Math.random() * Math.max(60, h - size - 210),
        vx: (fromLeft ? speed : -speed) * (reduced ? 0 : 1),
        vy: reduced ? 0 : (Math.random() - 0.5) * 0.01,
        hp: maxHp,
        maxHp,
      };
      liveRef.current.set(p.id, p);
      setPlanets((ps) => [...ps, p]);
    }

    // first one shortly after load, then one roughly every SPAWN_MS
    const kickoff = setTimeout(() => {
      if (liveRef.current.size < MAX_ON_SCREEN) spawn();
    }, 2500);
    const spawnTimer = reduced
      ? null
      : setInterval(() => {
          if (!document.hidden && liveRef.current.size < MAX_ON_SCREEN) spawn();
        }, SPAWN_MS);

    let raf = 0;
    let last = performance.now();
    function frame(t: number) {
      const dt = Math.min(48, t - last);
      last = t;
      if (!document.hidden) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (const [id, p] of liveRef.current) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y < 80 || p.y > h - p.size - 120) p.vy *= -1;
          const node = nodeRef.current.get(id);
          if (node) node.style.transform = `translate(${p.x}px, ${p.y}px)`;
          if (p.x < -p.size - 80 || p.x > w + p.size + 80) {
            liveRef.current.delete(id);
            setPlanets((ps) => ps.filter((q) => q.id !== id));
          }
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      clearTimeout(kickoff);
      if (spawnTimer) clearInterval(spawnTimer);
      cancelAnimationFrame(raf);
    };
  }, []);

  function hit(id: number) {
    const p = liveRef.current.get(id);
    if (!p) return;
    p.hp -= 1;
    const node = nodeRef.current.get(id);
    if (node) {
      node.classList.remove("planet-hit");
      void node.offsetWidth;
      node.classList.add("planet-hit");
    }
    if (p.hp <= 0) {
      const reward = p.maxHp * 10;
      const boomId = idRef.current++;
      setScore((s) => {
        const next = s + reward;
        try { localStorage.setItem("odt.wins", String(next)); } catch { /* ignore */ }
        return next;
      });
      setBooms((bs) => [...bs, { id: boomId, x: p.x + p.size / 2, y: p.y + p.size / 2, reward, word: BANGS[Math.floor(Math.random() * BANGS.length)], color: p.type.glow.includes("#ff6a3a") ? "var(--color-danger)" : "var(--color-gold)" }]);
      setTimeout(() => setBooms((bs) => bs.filter((b) => b.id !== boomId)), 850);
      liveRef.current.delete(id);
      setPlanets((ps) => ps.filter((q) => q.id !== id));
    } else {
      setPlanets((ps) => ps.map((q) => (q.id === id ? { ...q, hp: p.hp } : q)));
    }
  }

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
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
            className="planet-sphere pointer-events-auto absolute left-0 top-0 will-change-transform"
            style={{ width: p.size, height: p.size, background: p.type.bg, boxShadow: p.type.glow }}
          >
            {p.type.ring && (
              <span className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border" style={{ width: p.size * 1.9, height: p.size * 1.9, borderColor: "rgba(230,207,154,.55)", transform: "translate(-50%,-50%) rotate(-22deg) scaleY(.26)", boxShadow: "0 0 16px -4px rgba(230,207,154,.5)" }} />
            )}
            <span className="pointer-events-none absolute -top-3 left-1/2 flex -translate-x-1/2 gap-0.5">
              {Array.from({ length: p.maxHp }).map((_, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i < p.hp ? "var(--color-gold)" : "transparent", border: i < p.hp ? "none" : "1px solid var(--color-line-strong)" }} />
              ))}
            </span>
          </button>
        ))}

        {booms.map((b) => (
          <div key={b.id} className="absolute" style={{ left: b.x, top: b.y, transform: "translate(-50%,-50%)" }}>
            <div className="planet-pop relative">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="planet-shard absolute left-1/2 top-1/2 h-2 w-2 rounded-full" style={{ background: b.color, ["--sx" as string]: `${Math.cos((i / 9) * 6.28) * 100}px`, ["--sy" as string]: `${Math.sin((i / 9) * 6.28) * 100}px` } as React.CSSProperties} />
              ))}
            </div>
            <span className="font-bang absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-3xl md:text-4xl" style={{ color: b.color, textShadow: `0 0 18px ${b.color}` }}>{b.word}</span>
            <span className="absolute left-1/2 top-8 -translate-x-1/2 font-mono text-sm font-bold text-volt neon-volt">+{b.reward}</span>
          </div>
        ))}
      </div>

      {/* score HUD */}
      <div className="pointer-events-none fixed bottom-24 left-4 z-40 lg:bottom-6 lg:left-[calc(var(--sidebar-w)+1rem)]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-bg-1/90 px-3 py-1.5 font-mono text-sm font-bold text-gold backdrop-blur">
          <Icon name="Trophy" className="h-4 w-4" /> {score}
        </span>
      </div>
    </>
  );
}
