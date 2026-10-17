import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { clearEntries } from "@/lib/giveaways";

// "New round": DELETE clears all entries + winners for this giveaway. Admin only.
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);
  await clearEntries(giveawayId);
  return json({ ok: true });
}
