"use client";

import { useEffect } from "react";
import { motion, useScroll, useTransform, useMotionValue, useSpring, useReducedMotion, type MotionValue } from "motion/react";

// JBALLIN-style background: the supplied icons framed as glowing "game tiles"
// scattered at the edges, each on its own depth layer. Motion comes from three
// non-conflicting transforms — scroll parallax (useScroll, cinematic), a gentle
// mouse parallax, and a slow CSS float — so it reads alive, not sticky. Purely
// decorative: pointer-events none, aria-hidden, off under reduced motion.
type Tile = {
  src: string;
  size: number;
  pos: React.CSSProperties;
  glow: string;
  float: "float-a" | "float-b" | "float-c";
  rot: number;
  depth: number;
  hideSm?: boolean;
};

const C = {
  gold: "var(--color-gold)",
  cyan: "var(--color-cyan)",
  plasma: "var(--color-plasma)",
  volt: "var(--color-volt)",
  magenta: "var(--color-magenta)",
  electric: "var(--color-electric)",
};

const TILES: Tile[] = [
  { src: "/assets/particles/p1.webp", size: 118, pos: { top: "9%", left: "3%" }, glow: C.gold, float: "float-a", rot: -8, depth: 90 },
  { src: "/assets/particles/p2.webp", size: 92, pos: { top: "15%", right: "4%" }, glow: C.plasma, float: "float-b", rot: 9, depth: 62 },
  { src: "/assets/particles/p3.avif", size: 104, pos: { top: "54%", left: "2%" }, glow: C.volt, float: "float-c", rot: 6, depth: 128, hideSm: true },
  { src: "/assets/particles/p4.webp", size: 82, pos: { bottom: "16%", right: "3%" }, glow: C.cyan, float: "float-a", rot: -10, depth: 54 },
  { src: "/assets/particles/p5.png", size: 118, pos: { top: "46%", right: "5%" }, glow: C.magenta, float: "float-b", rot: 8, depth: 150, hideSm: true },
  { src: "/assets/particles/p6.webp", size: 94, pos: { bottom: "10%", left: "6%" }, glow: C.electric, float: "float-c", rot: -6, depth: 76, hideSm: true },
];

function TileEl({ t, scrollYProgress, mx }: { t: Tile; scrollYProgress: MotionValue<number>; mx: MotionValue<number> }) {
  const y = useTransform(scrollYProgress, [0, 1], [0, -t.depth * 1.8]);
  const x = useTransform(mx, (v) => v * (t.depth / 8));
  return (
    <motion.div className={`absolute ${t.hideSm ? "hidden md:block" : ""}`} style={{ ...t.pos, y, x }}>
      <div className={t.float}>
        <div
          className="game-tile"
          style={{
            width: t.size,
            transform: `rotate(${t.rot}deg)`,
            borderColor: `color-mix(in srgb, ${t.glow} 36%, var(--color-line-strong))`,
            boxShadow: `0 0 30px -6px color-mix(in srgb, ${t.glow} 55%, transparent), inset 0 0 22px -14px ${t.glow}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} alt="" loading="lazy" style={{ filter: `drop-shadow(0 0 10px color-mix(in srgb, ${t.glow} 45%, transparent))` }} />
        </div>
      </div>
    </motion.div>
  );
}

export function ParticleField() {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const mxRaw = useMotionValue(0);
  const mx = useSpring(mxRaw, { stiffness: 40, damping: 20, mass: 0.5 });

  useEffect(() => {
    if (reduced) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    function onMove(e: MouseEvent) {
      mxRaw.set(e.clientX / window.innerWidth - 0.5);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduced, mxRaw]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {TILES.map((t, i) => (
        <TileEl key={i} t={t} scrollYProgress={scrollYProgress} mx={mx} />
      ))}
    </div>
  );
}
