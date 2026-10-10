"use client";

import { useEffect, useState } from "react";

// "updated X min ago" from an ISO/SQL timestamp. Renders a stable placeholder
// on the server, fills in on mount (no hydration mismatch).
export function RelativeTime({ iso, prefix = "", className = "" }: { iso: string; prefix?: string; className?: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    function compute() {
      const then = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").getTime();
      if (Number.isNaN(then)) return setText(iso);
      const diff = Math.max(0, Date.now() - then);
      const m = Math.floor(diff / 60000);
      if (m < 1) return setText("just now");
      if (m < 60) return setText(`${m} min ago`);
      const h = Math.floor(m / 60);
      if (h < 24) return setText(`${h}h ago`);
      return setText(`${Math.floor(h / 24)}d ago`);
    }
    compute();
    const id = setInterval(compute, 30000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <span className={className} suppressHydrationWarning>
      {prefix}
      {text || "—"}
    </span>
  );
}
