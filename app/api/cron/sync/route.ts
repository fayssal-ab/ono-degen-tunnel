import { isCronAuthorized, json, jsonError } from "@/lib/http";
import { runSync } from "@/lib/sync";

// Every 10 min via GitHub Actions: Authorization: Bearer CRON_SECRET.
// Pulls wagers, re-ranks, snapshots, and rolls the period over when it ends.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return jsonError("unauthorized", 401);
  try {
    const summary = await runSync();
    return json(summary, summary.ok ? 200 : 502);
  } catch (err) {
    console.error("cron/sync failed", err);
    return jsonError("er_sync_exception", 500);
  }
}

export const GET = handle;
export const POST = handle;
