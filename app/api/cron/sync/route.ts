import { isCronAuthorized, json, jsonError } from "@/lib/http";
import { runSync } from "@/lib/sync";
import { recordJob } from "@/lib/events/common";

// Every 10 min via GitHub Actions: Authorization: Bearer CRON_SECRET.
// Pulls wagers, re-ranks, snapshots, and rolls the period over when it ends.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return jsonError("unauthorized", 401);
  try {
    const summary = await runSync();
    await recordJob("sync", summary.ok ? { ok: true, detail: summary } : { ok: false, error: summary.errorCode ?? "er_sync_failed" });
    return json(summary, summary.ok ? 200 : 502);
  } catch (err) {
    console.error("cron/sync failed", err);
    await recordJob("sync", { ok: false, error: "er_sync_exception" });
    return jsonError("er_sync_exception", 500);
  }
}

export const GET = handle;
export const POST = handle;
