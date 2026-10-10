import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { deleteGiveaway } from "@/lib/giveaways";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Delete a giveaway entirely (cascades entries + winners).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);
  await deleteGiveaway(giveawayId);
  await logAudit("admin", "giveaway.delete", String(giveawayId));
  return json({ ok: true });
}
