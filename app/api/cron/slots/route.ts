import { isCronAuthorized, json, jsonError } from "@/lib/http";
import { catalogIsStale, syncCatalog, verifyBatch } from "@/lib/slotCatalog";
import { recordJob } from "@/lib/events/common";

// Keeps the slot catalogue fresh: full sync once a day, then verifies the next
// batch of unchecked thumbnails each run (slot.report serves a placeholder for
// slots without art, so images must be checked before use).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return jsonError("unauthorized", 401);
  try {
    const synced = (await catalogIsStale()) ? await syncCatalog() : null;
    const verified = await verifyBatch(synced ? 150 : 350);
    await recordJob("slots", { ok: true, detail: { synced, verified } });
    return json({ ok: true, synced, verified });
  } catch (err) {
    console.error("cron/slots failed", err instanceof Error ? err.message : "unknown");
    await recordJob("slots", { ok: false, error: "er_slots_exception" });
    return jsonError("er_slots_exception", 500);
  }
}

export const GET = handle;
export const POST = handle;
