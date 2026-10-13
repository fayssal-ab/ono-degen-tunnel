"use client";

import { useEffect, useState, type ReactNode } from "react";

// Scales a fixed-size overlay design to the OBS browser-source window, so the
// streamer sizes it in OBS instead of with URL options.
// With `height`: the whole design fits the window (contain, centred).
// Without: it fits the window width and takes the full window height, so a
// taller window shows more content (e.g. more bonus rows).
export function FitScreen({ width, height, children }: { width: number; height?: number; children: ReactNode }) {
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  if (!vp) return null;
  const s = height ? Math.min(vp.w / width, vp.h / height) : vp.w / width;
  const h = height ?? vp.h / s;
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div
        style={{
          position: "absolute", width, height: h, transform: `scale(${s})`, transformOrigin: "top left",
          left: (vp.w - width * s) / 2, top: height ? (vp.h - height * s) / 2 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
