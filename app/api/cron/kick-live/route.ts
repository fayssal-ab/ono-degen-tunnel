import { isCronAuthorized, json, jsonError } from "@/lib/http";
import { fetchLiveStatus } from "@/lib/kick";
import { setSetting } from "@/lib/settings";

// Caches Kick live status (prompt §7). Pages read the cached value server-side
// (60s cadence) rather than hitting Kick on every request.
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return jsonError("unauthorized", 401);
  try {
    const status = await fetchLiveStatus();
    if (!status) return jsonError("kick_status_unavailable", 502);
    const payload = {
      live: status.live,
      viewers: status.viewers,
      checkedAt: new Date().toISOString(),
    };
    await setSetting("kick_live", payload);
    return json({ ok: true, ...payload });
  } catch (err) {
    console.error("cron/kick-live failed", err);
    return jsonError("er_kick_live_exception", 500);
  }
}

export const GET = handle;
export const POST = handle;
