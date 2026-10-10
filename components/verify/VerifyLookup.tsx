"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function VerifyLookup() {
  const router = useRouter();
  const [id, setId] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(id.trim());
    if (Number.isInteger(n) && n > 0) router.push(`/verify/${n}`);
  }

  return (
    <form onSubmit={go} className="flex gap-2">
      <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-3">
        <Icon name="Hash" className="h-4 w-4 text-text-2" />
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          inputMode="numeric"
          placeholder="Giveaway ID"
          className="h-full flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-2 focus:outline-none"
          aria-label="Giveaway ID"
        />
      </div>
      <button type="submit" className="press inline-flex h-11 items-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi">
        Verify
      </button>
    </form>
  );
}
