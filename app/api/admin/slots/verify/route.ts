import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { getCatalogStats, verifyBatch } from "@/lib/slotCatalog";

// One time-boxed batch of thumbnail checks (fits Netlify's ~10 s function
// limit). The admin "Verify all" button calls it in a loop.
export const dynamic = "force-dynamic";
export const maxDuration = 26;

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  try {
    const batch = await verifyBatch(300, 4000);
    return json({ ok: true, batch, stats: await getCatalogStats() });
  } catch (err) {
    console.error("slot verify failed", err instanceof Error ? err.message : "unknown");
    return json({ ok: false, error: "verify_failed" }, 502);
  }
}
