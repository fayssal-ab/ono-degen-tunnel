"use client";

import { useEffect, useRef } from "react";

// Immersive homepage background built from the SUPPLIED particle icons
// (particles/*.webp|avif|png). Each icon sits on its own depth layer: an outer
// wrapper takes a cursor-parallax translate (JS, eased), the inner <img> runs a
// gentle CSS float — so the two transforms never fight. Decorative only
// (pointer-events:none, aria-hidden). Parallax runs on a fine pointer; floats
// stop under prefers-reduced-motion (handled globally in globals.css).
type P = { src: string; size: number; top: string; left: string; depth: number; float: string; opacity: number; hideSm?: boolean };

const PARTICLES: P[] = [
  { src: "/assets/particles/p1.webp", size: 140, top: "11%", left: "4%", depth: 34, float: "float-a", opacity: 0.95 },
  { src: "/assets/particles/p2.webp", size: 96, top: "20%", left: "85%", depth: 22, float: "float-b", opacity: 0.9 },
  { src: "/assets/particles/p3.avif", size: 118, top: "60%", left: "6%", depth: 46, float: "float-c", opacity: 0.9, hideSm: true },
  { src: "/assets/particles/p4.webp", size: 84, top: "76%", left: "89%", depth: 18, float: "float-a", opacity: 0.9 },
  { src: "/assets/particles/p5.png", size: 150, top: "46%", left: "90%", depth: 54, float: "float-b", opacity: 0.85, hideSm: true },
  { src: "/assets/particles/p6.webp", size: 104, top: "85%", left: "38%", depth: 28, float: "float-c", opacity: 0.88, hideSm: true },
];

export function ParticleField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layers = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]"));
    let mx = 0;
    let my = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;

    function onMove(e: MouseEvent) {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    }
    function loop() {
      cx += (mx - cx) * 0.05;
      cy += (my - cy) * 0.05;
      for (const n of layers) {
        const d = Number(n.dataset.depth) || 0;
        n.style.transform = `translate3d(${(-cx * d).toFixed(2)}px, ${(-cy * d).toFixed(2)}px, 0)`;
      }
      raf = requestAnimationFrame(loop);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* distant planet — a CSS sphere + tilted ring on its own parallax layer */}
      <div data-depth={68} className="absolute hidden lg:block" style={{ top: "-12%", right: "-6%" }}>
        <div className="relative" style={{ width: 380, height: 380 }}>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle at 34% 30%, #4a3c86 0%, #1a1f3e 48%, #080b16 78%)",
              boxShadow:
                "0 0 90px -10px color-mix(in srgb, var(--color-plasma) 40%, transparent), inset -20px -14px 60px rgba(0,0,0,0.7)",
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 rounded-full border"
            style={{
              width: 560,
              height: 560,
              borderColor: "color-mix(in srgb, var(--color-cyan) 32%, transparent)",
              transform: "translate(-50%, -50%) rotate(-20deg) scaleY(0.3)",
              boxShadow: "0 0 24px -6px color-mix(in srgb, var(--color-cyan) 40%, transparent)",
            }}
          />
        </div>
      </div>

      {PARTICLES.map((p, i) => (
        <div
          key={i}
          data-depth={p.depth}
          className={`absolute ${p.hideSm ? "hidden md:block" : ""}`}
          style={{ top: p.top, left: p.left }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.src}
            alt=""
            loading="lazy"
            className={`particle ${p.float}`}
            style={{ width: p.size, height: "auto", opacity: p.opacity, animationDelay: `${i * -1.7}s` }}
          />
        </div>
      ))}
    </div>
  );
}
