"use client";

import { usePathname } from "next/navigation";

// Per-page sky. Same deep-space theme everywhere, but each section gets its own
// colour wash and its own celestial body (pure CSS — no drawn art): Races burn
// orange under a moon, the Leaderboard glows gold under a sun, Guess the
// Balance is a cyan ringed planet… Home keeps its planets (hero), so no
// backdrop there. Decorative only: fixed, behind content, no pointer events.

type Body = "moon" | "sun" | "ringed" | "eclipse";
interface Theme { a: string; b: string; body: Body }

const THEMES: [prefix: string, theme: Theme][] = [
  ["/races", { a: "#ff8a3d", b: "#b4441c", body: "moon" }],
  ["/leaderboard", { a: "#f5c451", b: "#c08a2a", body: "sun" }],
  ["/guess-the-balance", { a: "#22d3ee", b: "#0ea5e9", body: "ringed" }],
  ["/tournaments", { a: "#a78bfa", b: "#e879f9", body: "eclipse" }],
  ["/challenges", { a: "#ff3d9a", b: "#e879f9", body: "moon" }],
  ["/bonus-hunt", { a: "#34d399", b: "#22d3ee", body: "ringed" }],
  ["/vip", { a: "#f5c451", b: "#8b5cf6", body: "sun" }],
  ["/hall-of-fame", { a: "#f5c451", b: "#ff8a3d", body: "eclipse" }],
  ["/prizes", { a: "#34d399", b: "#f5c451", body: "sun" }],
  ["/account", { a: "#f5c451", b: "#8b5cf6", body: "eclipse" }],
  ["/stream", { a: "#53fc18", b: "#22d3ee", body: "moon" }],
];

function CelestialBody({ t }: { t: Theme }) {
  const size = "min(38vw, 560px)";
  const box: React.CSSProperties = { position: "absolute", right: "-6vw", top: "6vh", width: size, height: size, borderRadius: "50%" };
  if (t.body === "moon") {
    return (
      <div style={{ ...box, background: `radial-gradient(circle at 34% 30%, color-mix(in srgb, ${t.a} 45%, #fff3e0) 0%, ${t.a} 38%, ${t.b} 78%, color-mix(in srgb, ${t.b} 60%, #05070d) 100%)`,
        boxShadow: `0 0 120px 20px color-mix(in srgb, ${t.a} 35%, transparent), inset -40px -50px 90px rgba(0,0,0,0.45)`, opacity: 0.55 }}>
        {/* craters */}
        {[[22, 58, 14], [55, 30, 9], [62, 66, 18], [38, 78, 7], [72, 44, 6]].map(([x, y, s], i) => (
          <span key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: `${s}%`, height: `${s}%`, borderRadius: "50%",
            background: "rgba(0,0,0,0.12)", boxShadow: "inset 3px 4px 8px rgba(0,0,0,0.35), inset -2px -2px 6px rgba(255,255,255,0.12)" }} />
        ))}
      </div>
    );
  }
  if (t.body === "sun") {
    return (
      <div style={{ ...box, background: `radial-gradient(circle, color-mix(in srgb, ${t.a} 60%, #fff) 0%, ${t.a} 30%, color-mix(in srgb, ${t.b} 70%, transparent) 55%, transparent 72%)`,
        opacity: 0.5, filter: "saturate(1.2)" }} />
    );
  }
  if (t.body === "ringed") {
    return (
      <div style={{ ...box, opacity: 0.55 }}>
        <div style={{ position: "absolute", inset: "14%", borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${t.a} 55%, #fff) 0%, ${t.a} 40%, ${t.b} 75%, #05070d 100%)`,
          boxShadow: `0 0 100px 10px color-mix(in srgb, ${t.a} 30%, transparent), inset -30px -40px 70px rgba(0,0,0,0.5)` }} />
        <div style={{ position: "absolute", left: "-12%", right: "-12%", top: "42%", height: "16%", borderRadius: "50%", transform: "rotate(-18deg)",
          border: `3px solid color-mix(in srgb, ${t.a} 70%, transparent)`, boxShadow: `0 0 24px color-mix(in srgb, ${t.a} 40%, transparent)` }} />
      </div>
    );
  }
  // eclipse: a dark disc with a burning rim
  return (
    <div style={{ ...box, background: "radial-gradient(circle, #05070d 0%, #05070d 62%, transparent 63%)", opacity: 0.8,
      boxShadow: `0 0 70px 14px color-mix(in srgb, ${t.a} 55%, transparent), 0 0 160px 40px color-mix(in srgb, ${t.b} 30%, transparent), inset 0 0 40px color-mix(in srgb, ${t.a} 50%, transparent)` }} />
  );
}

export function PageBackdrop() {
  const pathname = usePathname();
  const t = THEMES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
  if (!t) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0" style={{
        background: `radial-gradient(70% 55% at 85% 0%, color-mix(in srgb, ${t.a} 22%, transparent), transparent 70%),
                     radial-gradient(60% 50% at 0% 100%, color-mix(in srgb, ${t.b} 18%, transparent), transparent 70%)`,
      }} />
      <CelestialBody t={t} />
    </div>
  );
}
