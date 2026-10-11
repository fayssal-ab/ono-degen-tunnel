"use client";

import { useEffect, useRef } from "react";

// Ambient deep-space layer: a slow parallax starfield on a single canvas,
// fixed behind all content. No dependency, no WebGL. It is purely decorative
// (aria-hidden, pointer-events:none), caps the device pixel ratio, pauses when
// the tab is hidden, and renders a single static frame when the user prefers
// reduced motion. Colours come straight from the design tokens.
type Star = { x: number; y: number; z: number; r: number; tw: number; hue: number };

const STAR_DENSITY = 1 / 9000; // stars per CSS pixel² (kept light)
const MAX_STARS = 220;
// cyan / electric / white-ish, matching the void palette; sampled per star
const COLORS = ["226, 236, 245", "34, 211, 238", "59, 130, 246", "139, 92, 246"];

export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let t = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(MAX_STARS, Math.floor(w * h * STAR_DENSITY));
      stars = Array.from({ length: count }, () => {
        const z = Math.random(); // depth 0..1 → size + drift speed
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: 0.4 + z * 1.4,
          tw: Math.random() * Math.PI * 2, // twinkle phase
          hue: Math.random() < 0.82 ? 0 : 1 + Math.floor(Math.random() * 3),
        };
      });
    }

    function draw(time: number) {
      const dt = time - t;
      t = time;
      ctx!.clearRect(0, 0, w, h);
      for (const s of stars) {
        // slow upward drift, deeper stars move less (parallax)
        s.y -= (0.004 + s.z * 0.012) * dt;
        if (s.y < -2) {
          s.y = h + 2;
          s.x = Math.random() * w;
        }
        s.tw += 0.0012 * dt;
        const twinkle = 0.55 + 0.45 * Math.sin(s.tw);
        const alpha = (0.25 + s.z * 0.6) * twinkle;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${COLORS[s.hue]}, ${alpha.toFixed(3)})`;
        ctx!.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    function staticFrame() {
      ctx!.clearRect(0, 0, w, h);
      for (const s of stars) {
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${COLORS[s.hue]}, ${(0.2 + s.z * 0.4).toFixed(3)})`;
        ctx!.fill();
      }
    }

    function start() {
      cancelAnimationFrame(raf);
      if (reduced) {
        staticFrame();
      } else {
        t = performance.now();
        raf = requestAnimationFrame(draw);
      }
    }

    function onVisibility() {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    }

    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ opacity: 0.9 }}
    />
  );
}
