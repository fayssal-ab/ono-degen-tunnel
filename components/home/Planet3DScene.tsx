"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// Lazy, visibility-gated 3D planet. three.js only downloads once the section
// scrolls near the viewport (IntersectionObserver), and never under reduced
// motion — so it stays off the critical path and off low-power/accessibility
// setups. A CSS planet shows as the fallback.
const Planet3D = dynamic(() => import("./Planet3D"), {
  ssr: false,
  loading: () => <CssPlanet />,
});

function CssPlanet() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div
        className="h-40 w-40 rounded-full"
        style={{
          background: "radial-gradient(circle at 34% 30%, #22d3ee 0%, #0b2f5c 60%, #060810 100%)",
          boxShadow: "0 0 70px -12px var(--color-cyan), inset -16px -12px 46px rgba(0,0,0,.6)",
        }}
      />
    </div>
  );
}

export function Planet3DScene() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-72 w-full md:h-80">
      {active ? <Planet3D /> : <CssPlanet />}
    </div>
  );
}
