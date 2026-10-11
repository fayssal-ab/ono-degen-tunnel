import { z } from "zod";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { setEntryExcluded } from "@/lib/giveaways";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({ username: z.string().min(1).max(191), excluded: z.boolean() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return jsonError("invalid_body", 400);
  }

  try { await setEntryExcluded(giveawayId, body.username, body.excluded); }
  catch (err) {
    if (err instanceof Error && ["round_already_drawn", "giveaway_expired", "use_draw_action", "draw_pool_locked"].includes(err.message)) return jsonError(err.message, 409);
    throw err;
  }
  await logAudit("admin", "giveaway.exclude", String(giveawayId), body);
  return json({ ok: true });
}
