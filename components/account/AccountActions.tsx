"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Provider } from "@/lib/userAuth";

const ghost = "press inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40";

export function UnlinkButton({ provider, label }: { provider: Provider; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button disabled={busy} className={`${ghost} border-line-strong text-text-1 hover:border-danger hover:text-danger`}
        onClick={async () => {
          if (!window.confirm(`Unlink ${label}? You can link it again any time.`)) return;
          setBusy(true); setErr(null);
          try {
            const r = await fetch("/api/auth/user/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
            const d = (await r.json()) as { ok?: boolean; message?: string };
            if (!d.ok) setErr(d.message ?? "Couldn't unlink. Try again.");
            router.refresh();
          } catch { setErr("Network error. Try again."); } finally { setBusy(false); }
        }}>Unlink</button>
      {err && <span role="alert" className="max-w-56 text-right text-xs text-danger">{err}</span>}
    </span>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} className={`${ghost} border-line-strong text-text-1 hover:border-gold hover:text-gold`}
      onClick={async () => {
        setBusy(true);
        try { await fetch("/api/auth/user/logout", { method: "POST" }); } finally { router.push("/"); router.refresh(); }
      }}>Log out</button>
  );
}
