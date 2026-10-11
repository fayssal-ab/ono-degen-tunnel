import "server-only";
import { cache } from "react";
import { fetchLiveStatus } from "./kick";
import { getSetting, setSetting } from "./settings";

let pending: Promise<Awaited<ReturnType<typeof fetchLiveStatus>>> | null = null;
let lastAttempt = 0;
// Refresh stale status on page visits as well as cron. Coalesce requests and
// back off during outages; keep the last confirmed value on provider failure.
export const getKickLive = cache(async () => {
  const stored = await getSetting("kick_live");
  const checked = stored.checkedAt ? Date.parse(stored.checkedAt) : 0;
  if (Date.now() - checked < 60_000) return stored;
  if (!pending && Date.now() - lastAttempt < 60_000) return stored;
  if (!pending) {
    lastAttempt = Date.now();
    pending = fetchLiveStatus().finally(() => { pending = null; });
  }
  const status = await pending;
  if (!status) return stored;
  const next = { ...status, checkedAt: new Date().toISOString() };
  try { await setSetting("kick_live", next); } catch { /* render the confirmed state even if caching failed */ }
  return next;
});
