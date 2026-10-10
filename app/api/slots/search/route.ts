import { isAdminRequest } from "@/lib/admin";
import { searchSlots } from "@/lib/slotSearch";
import { json, jsonError } from "@/lib/http";

// Admin-only slot autocomplete for the bonus-hunt / tournament / challenge
// forms. Guarded so the key-bound slot.report list isn't exposed publicly.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchSlots(q);
  return json({ results });
}
