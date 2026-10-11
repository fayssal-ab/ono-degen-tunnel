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
  { src: "/assets/particles/p1.webp", size: 150, top: "10%", left: "5%", depth: 34, float: "float-a", opacity: 0.5 },
  { src: "/assets/particles/p2.webp", size: 90, top: "22%", left: "82%", depth: 22, float: "float-b", opacity: 0.45 },
  { src: "/assets/particles/p3.avif", size: 120, top: "62%", left: "8%", depth: 46, float: "float-c", opacity: 0.4, hideSm: true },
  { src: "/assets/particles/p4.webp", size: 72, top: "74%", left: "88%", depth: 18, float: "float-a", opacity: 0.4 },
  { src: "/assets/particles/p5.png", size: 180, top: "44%", left: "70%", depth: 54, float: "float-b", opacity: 0.32, hideSm: true },
  { src: "/assets/particles/p6.webp", size: 100, top: "86%", left: "40%", depth: 28, float: "float-c", opacity: 0.38, hideSm: true },
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
