"use client";

import { useEffect, useRef, useState } from "react";

// Profile picture, or the first letter of the name when there's no picture
// or it fails to load (empty / broken provider avatar). A server-rendered
// <img> can fail before hydration (onError never fires), so it is also
// checked on mount.
export function UserAvatar({ src, name, className = "", style }: { src?: string | null; name: string; className?: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setBroken(true);
  }, [src]);
  const letter = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden bg-bg-3 font-bold text-gold ${className}`} style={style}>
      {src && !broken
        // eslint-disable-next-line @next/next/no-img-element
        ? <img ref={img} src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : letter}
    </span>
  );
}
