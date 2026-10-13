"use client";

import { useEffect, useState } from "react";

// Status + connect button for Kick's official chat webhook. Connected = the
// server receives ONO's chat (!join, !gb) straight from Kick, even with no
// admin page open. Reports the state up so the page can turn its in-browser
// chat reader off (no message is processed twice).

interface Status { configured: boolean; connected: boolean; error?: string }

export function KickWebhookPanel({ onStatus }: { onStatus?: (connected: boolean | null) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const apply = (s: Status | null) => { setStatus(s); onStatus?.(s ? s.connected : null); };

  useEffect(() => {
    fetch("/api/admin/kick/webhook", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Status) => apply(s))
      .catch(() => apply(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(action: "connect" | "disconnect") {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/kick/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = (await res.json()) as Status & { ok: boolean; error?: string };
      if (!d.ok) setMsg(d.error ?? "Kick refused the request");
      else apply(d);
    } catch { setMsg("Network error"); } finally { setBusy(false); }
  }

  if (!status) return <div className="surface p-4 text-xs text-text-2">Checking Kick chat connection…</div>;
  return (
    <div className={`surface flex flex-wrap items-center gap-3 p-4 text-sm ${status.connected ? "border-volt/40" : "border-gold/40"}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${status.connected ? "bg-volt" : "bg-gold"}`} />
      <div className="min-w-0 flex-1">
        {status.connected ? (
          <p className="text-text-0">Kick chat connected — <span className="text-text-1">!join and !gb reach the site even when this page is closed.</span></p>
        ) : !status.configured ? (
          <p className="text-text-0">Kick app keys missing (KICK_CLIENT_ID / KICK_CLIENT_SECRET). Chat is read only while this page is open.</p>
        ) : (
          <p className="text-text-0">Kick chat not connected — <span className="text-text-1">chat is only read while this page stays open and active. Connect it so the site receives chat by itself.</span></p>
        )}
        {status.error && <p className="text-xs text-danger">{status.error}</p>}
        {msg && <p className="text-xs text-danger">{msg}</p>}
      </div>
      {status.configured && (status.connected ? (
        <button disabled={busy} onClick={() => act("disconnect")} className="press rounded-lg border border-line px-3 py-1.5 text-xs text-text-2 hover:text-danger">Disconnect</button>
      ) : (
        <button disabled={busy} onClick={() => act("connect")} className="press rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-bg-0">{busy ? "Connecting…" : "Connect Kick chat"}</button>
      ))}
    </div>
  );
}
