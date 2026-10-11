"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Floating back-to-top, appears after scrolling. Sits above the mobile nav bar.
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`press fixed bottom-24 right-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-bg-2/90 text-text-0 backdrop-blur transition-all duration-300 hover:border-cyan hover:text-cyan hover:shadow-[0_0_22px_-6px_var(--color-cyan)] lg:bottom-6 ${
        show ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <Icon name="ArrowUp" className="h-5 w-5" />
    </button>
  );
}
