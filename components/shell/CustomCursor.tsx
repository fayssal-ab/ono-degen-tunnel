"use client";

import { useEffect, useRef } from "react";

// Custom Gojo cursor from the supplied Sweezy pack. The native cursor is
// REPLACED by the PNG via CSS (see globals.css .has-custom-cursor) so clicking,
// scrolling and text selection keep working — there is no cursor:none and no
// JS-driven pointer, so nothing can lag or trap input. On top of that we trail a
// soft "energy" glow that eases toward the cursor and swells over interactive
// elements. Enabled only on a fine pointer; disabled on touch. The glow easing
// is skipped under prefers-reduced-motion (the PNG cursor itself is static).
const INTERACTIVE = "a,button,[role='button'],label,summary,[data-cursor='pointer'],input[type='submit'],input[type='button']";

export function CustomCursor() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return; // touch → native cursor
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    root.classList.add("has-custom-cursor");

    const glow = glowRef.current;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let x = tx;
    let y = ty;
    let raf = 0;
    let active = false;

    function onMove(e: MouseEvent) {
      tx = e.clientX;
      ty = e.clientY;
      if (!active) {
        active = true;
        glow?.classList.add("is-active");
      }
      const overPointer = !!(e.target as Element)?.closest?.(INTERACTIVE);
      glow?.classList.toggle("is-pointer", overPointer);
      if (reduced && glow) glow.style.transform = `translate(${tx}px, ${ty}px)`;
    }
    function onLeave() {
      active = false;
      glow?.classList.remove("is-active");
    }
    function loop() {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      if (glow) glow.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    if (!reduced) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      root.classList.remove("has-custom-cursor");
    };
  }, []);

  return <div ref={glowRef} className="cursor-glow" aria-hidden />;
}
