import { isAdminRequest } from "@/lib/admin";
import { searchCatalog } from "@/lib/slotCatalog";
import { json, jsonError } from "@/lib/http";

// Admin-only fuzzy slot search over the synced Stake catalogue (official
// Stake art from the sharkz.gg feed).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80);
  try {
    const results = await searchCatalog(q);
    return json({ results });
  } catch {
    return json({ results: [], error: "catalog_unavailable" });
  }
}
