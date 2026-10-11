import { isCronAuthorized, json, jsonError } from "@/lib/http";
import { recomputeRaces } from "@/lib/races";
import { recordJob } from "@/lib/events/common";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return jsonError("unauthorized", 401);
  try {
    const result = await recomputeRaces();
    await recordJob("races", { ok: true, detail: result });
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("cron/races failed", err);
    await recordJob("races", { ok: false, error: "er_races_exception" });
    return jsonError("er_races_exception", 500);
  }
}

export const GET = handle;
export const POST = handle;
