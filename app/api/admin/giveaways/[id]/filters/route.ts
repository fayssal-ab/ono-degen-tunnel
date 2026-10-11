import { z } from "zod";
import { isAdminRequest } from "@/lib/admin";
import { isSameOrigin, json, jsonError } from "@/lib/http";
import { setGiveawayFilters } from "@/lib/giveaways";
import { logAudit } from "@/lib/audit";

const Body = z.object({ subscribersOnly: z.boolean(), minMessages: z.number().int().min(1).max(100) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return jsonError("bad_id", 400);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("invalid_body", 400);
  try { await setGiveawayFilters(id, body.data.subscribersOnly, body.data.minMessages); }
  catch (err) { if (err instanceof Error && err.message === "draw_pool_locked") return jsonError("draw_pool_locked", 409); throw err; }
  await logAudit("admin", "giveaway.filters", String(id), body.data);
  return json({ ok: true });
}
