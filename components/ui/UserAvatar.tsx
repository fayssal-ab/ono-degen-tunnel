"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

// Profile picture, or — when there's none or it fails to load — a generated
// tag: a neon gradient + a big icon watermark (both picked from the name, so
// a user always gets the same one) and the first letter in a graffiti font.
// A server-rendered <img> can fail before hydration (onError never fires),
// so it is also checked on mount.

const THEMES = [
  "linear-gradient(135deg,#f5c451 0%,#ff3d9a 100%)",
  "linear-gradient(135deg,#22d3ee 0%,#8b5cf6 100%)",
  "linear-gradient(135deg,#34d399 0%,#22d3ee 100%)",
  "linear-gradient(135deg,#ff3d9a 0%,#ff8a3d 100%)",
  "linear-gradient(135deg,#8b5cf6 0%,#f5c451 100%)",
  "linear-gradient(135deg,#ff4d5e 0%,#f5c451 100%)",
  "linear-gradient(135deg,#0ea5e9 0%,#34d399 100%)",
  "linear-gradient(135deg,#a855f7 0%,#ff3d9a 100%)",
];
const MARKS = ["Crown", "Flame", "Zap", "Dices", "Spade", "Gem", "Skull", "Rocket", "Star", "Diamond", "Ghost", "Swords", "Club", "Heart", "Trophy", "Coins"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function UserAvatar({ src, name, className = "", style }: { src?: string | null; name: string; className?: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setBroken(true);
  }, [src]);

  const showImg = Boolean(src) && !broken;
  const h = hash(name.trim().toLowerCase() || "?");
  const letter = (name.trim().match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden ${className}`} style={{ ...style, containerType: "size" }}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={img} src={src!} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <>
          <span className="absolute inset-0" style={{ background: THEMES[h % THEMES.length] }} />
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.35),transparent_55%)]" />
          <Icon name={MARKS[(h >>> 3) % MARKS.length]} strokeWidth={1.6}
            className="absolute -bottom-[12%] -right-[14%] h-[78%] w-[78%] rotate-[-18deg] text-black/25" />
          <span aria-hidden className="relative -rotate-[8deg] leading-none text-white"
            style={{ fontFamily: "var(--font-tag), var(--font-display), sans-serif", fontSize: "62cqh", textShadow: "0 0.04em 0 #000, 0.05em 0.06em 0 rgba(0,0,0,.55), 0 0 0.25em rgba(0,0,0,.35)" }}>
            {letter}
          </span>
        </>
      )}
    </span>
  );
}
