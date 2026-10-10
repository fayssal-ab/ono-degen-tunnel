import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { addTestEntrants, clearEntries } from "@/lib/giveaways";

// Preview tooling: POST loads sample entrants to rehearse the reel; DELETE
// clears all entries + winners for this giveaway. Admin only.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);
  await addTestEntrants(giveawayId, 8);
  return json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);
  await clearEntries(giveawayId);
  return json({ ok: true });
}
