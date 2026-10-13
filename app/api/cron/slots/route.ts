import { isCronAuthorized, json, jsonError } from "@/lib/http";
import { catalogIsStale, syncCatalog } from "@/lib/slotCatalog";
import { recordJob } from "@/lib/events/common";

// Keeps the Stake slot catalogue (sharkz.gg feed) fresh: re-synced once a day.
export const dynamic = "force-dynamic";
export const maxDuration = 26;

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return jsonError("unauthorized", 401);
  try {
    const synced = (await catalogIsStale()) ? await syncCatalog() : null;
    await recordJob("slots", { ok: true, detail: { synced } });
    return json({ ok: true, synced });
  } catch (err) {
    console.error("cron/slots failed", err instanceof Error ? err.message : "unknown");
    await recordJob("slots", { ok: false, error: "er_slots_exception" });
    return jsonError("er_slots_exception", 500);
  }
}

export const GET = handle;
export const POST = handle;
