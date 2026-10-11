"use client";

import { useEffect, useRef } from "react";

// A bounded galaxy in the hero: no page-wide positioning or external images.
export function Universe() {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const container = host.current;
    const element = canvas.current;
    if (!container || !element) return;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, frame = 0, phase = 0, previous = 0;
    let visible = true;
    // Deterministic positions prevent the scene jumping on resize.
    let seed = 42;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const stars = Array.from({ length: 640 }, (_, i) => ({
      orbit: Math.pow(random(), 0.65), angle: random() * Math.PI * 2,
      size: 0.5 + random() * 1.5, brightness: 0.25 + random() * 0.65,
      arm: i % 3, scatter: (random() - 0.5) * 0.65,
      color: i % 7 === 0 ? "246,205,82" : i % 3 === 0 ? "97,220,234" : "176,127,255",
    }));
    const backdrop = Array.from({ length: 90 }, () => ({ x: random(), y: random(), alpha: random() * 0.45 + 0.12 }));
    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const x = width * 0.53, y = height * 0.5;
      const radius = Math.min(width * 0.45, height * 0.37);
      for (const star of backdrop) {
        ctx.fillStyle = `rgba(207,218,255,${star.alpha})`;
        ctx.fillRect(star.x * width, star.y * height, 1, 1);
      }
      const halo = ctx.createRadialGradient(x, y, radius * 0.06, x, y, radius * 1.35);
      halo.addColorStop(0, "rgba(133,59,222,0.24)");
      halo.addColorStop(0.48, "rgba(88,54,179,0.10)");
      halo.addColorStop(1, "rgba(8,11,25,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.32);
      ctx.scale(1, 0.68);
      ctx.globalCompositeOperation = "lighter";
      for (const star of stars) {
        const r = radius * (0.15 + star.orbit * 0.88);
        const angle = star.arm * Math.PI * 2 / 3 + star.orbit * 5.8 + star.scatter + phase * (0.15 + (1 - star.orbit) * 0.22);
        const sx = Math.cos(angle) * r, sy = Math.sin(angle) * r;
        const alpha = star.brightness * (0.8 + Math.sin(phase + star.angle) * 0.2);
        ctx.fillStyle = `rgba(${star.color},${alpha})`;
        ctx.beginPath(); ctx.arc(sx, sy, star.size, 0, Math.PI * 2); ctx.fill();
        if (star.size > 1.7) {
          ctx.fillStyle = `rgba(${star.color},${alpha * 0.08})`;
          ctx.beginPath(); ctx.arc(sx, sy, star.size * 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
      const core = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.2);
      core.addColorStop(0, "rgba(255,246,211,0.92)");
      core.addColorStop(0.1, "rgba(247,206,92,0.78)");
      core.addColorStop(0.4, "rgba(167,90,249,0.25)");
      core.addColorStop(1, "transparent");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(x, y, radius * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    function animate(time: number) {
      frame = 0;
      if (!visible || document.hidden || motion.matches) return;
      if (time - previous >= 33) { phase += Math.min(time - previous, 100) * 0.00018; previous = time; draw(); }
      frame = requestAnimationFrame(animate);
    }
    function resume() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; previous = performance.now();
      draw();
      if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(animate);
    }
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      resume();
    });
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    resize.observe(container); intersection.observe(container);
    motion.addEventListener("change", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
      motion.removeEventListener("change", resume); document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return (
    <div ref={host} aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-full opacity-35 [mask-image:linear-gradient(to_right,transparent,black_45%)] lg:w-[54%] lg:opacity-100 lg:[mask-image:linear-gradient(to_right,transparent,black_15%)]">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div className="absolute bottom-[14%] right-[15%] hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-text-2 lg:flex">
        <span className="h-1 w-1 rounded-full bg-gold" /> Enter the ONO universe
      </div>
    </div>
  );
}
