"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Every page opens at the top. Next only scrolls when the new page's content
// is out of view, so with the sticky top bar you could land mid-page. Links to
// a section (#wallets, #prize-12…) keep their own scroll.
export function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
