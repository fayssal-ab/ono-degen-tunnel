"use client";

import { useEffect, useState } from "react";
import { BRAND_NAME } from "@/lib/constants";

// First-load screen: the real logo + a progress bar that follows the actual
// loading. It stays until the page, fonts and the images visible on screen
// are loaded and decoded, so the page appears complete instead of images
// popping in. Capped (MAX_MS) so a slow image never blocks the site.
// Shows once per browser session; near-instant under prefers-reduced-motion.
const MIN_MS = 700;
const MAX_MS = 7000;

function visibleImages(): HTMLImageElement[] {
  return Array.from(document.images).filter((img) => {
    if (img.closest(".preloader")) return false;
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight * 1.2;
  });
}

function imageReady(img: HTMLImageElement): Promise<void> {
  const decode = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve());
  if (img.complete) return decode();
  return new Promise((resolve) => {
    const done = () => decode().then(resolve);
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

export function Preloader() {
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);
  const [pct, setPct] = useState(8);

  // Images can't be dragged out of the page (Firefox ignores the CSS rule).
  useEffect(() => {
    const noDrag = (e: DragEvent) => {
      if (e.target instanceof HTMLImageElement || (e.target instanceof Element && e.target.closest("svg"))) e.preventDefault();
    };
    document.addEventListener("dragstart", noDrag);
    return () => document.removeEventListener("dragstart", noDrag);
  }, []);

  useEffect(() => {
    let seen = false;
    try {
      seen = Boolean(sessionStorage.getItem("odt.loaded"));
    } catch {
      /* private mode — show it once */
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (seen) {
      timers.push(setTimeout(() => setGone(true), 0));
      return () => timers.forEach(clearTimeout);
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = Date.now();
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      setPct(100);
      const wait = Math.max(0, (reduced ? 0 : MIN_MS) - (Date.now() - start));
      timers.push(setTimeout(() => {
        setOut(true);
        try { sessionStorage.setItem("odt.loaded", "1"); } catch { /* ignore */ }
        timers.push(setTimeout(() => setGone(true), reduced ? 150 : 550));
      }, wait));
    };

    const pageLoaded = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    });
    const fonts = document.fonts?.ready.then(() => undefined).catch(() => undefined) ?? Promise.resolve();

    pageLoaded.then(() => {
      const imgs = visibleImages();
      let done = 0;
      const total = imgs.length + 1;
      const tick = () => { done++; setPct(Math.min(96, 8 + Math.round((done / total) * 88))); };
      return Promise.all([fonts.then(tick), ...imgs.map((img) => imageReady(img).then(tick))]);
    }).then(finish);
    timers.push(setTimeout(finish, MAX_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  if (gone) return null;

  return (
    <div className={`preloader ${out ? "preloader-out" : ""}`} aria-hidden>
      <div className="flex flex-col items-center px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/LOGO/logo-320.webp"
          alt=""
          width={160}
          height={146}
          fetchPriority="high"
          className="w-36 drop-shadow-[0_0_36px_rgba(245,196,81,0.35)] md:w-40"
        />
        <p className="sr-only">{BRAND_NAME}</p>
        <p className="label mt-5">Loading your degen experience</p>

        <div className="mt-5 h-1 w-56 overflow-hidden rounded-full bg-bg-3">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--color-cyan), var(--color-plasma), var(--color-gold))" }}
          />
        </div>
      </div>
    </div>
  );
}
