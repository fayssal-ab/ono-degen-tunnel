import { z } from "zod";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { withTx } from "@/lib/events/common";
import { recordJoin, JOIN_RE } from "@/lib/knockout";
import { findSlotByName } from "@/lib/slotCatalog";

// Relay for `!join` messages read from Kick's public chat socket by the admin
// tournament dashboard (same mechanism as giveaways). Identity is Kick's
// sender id from the chat event; message ids are de-duplicated so a socket
// replay or the signed webhook delivering the same message can't reroll twice.
export const dynamic = "force-dynamic";

const Body = z.object({
  messageId: z.string().trim().min(1).max(191),
  userId: z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative()]),
  username: z.string().trim().min(1).max(191),
  content: z.string().max(500),
});

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return jsonError("invalid_body", 400);
  }
  if (!JOIN_RE.test(body.content)) return json({ ok: true, outcome: "not_command" });
  try {
    // `!join <slot name>` → that slot (resolved outside the transaction); bare `!join` → random
    const slot = await findSlotByName(body.content.replace(/^\s*!join/i, ""));
    const result = await withTx((conn) => recordJoin(conn, { kickUserId: String(body.userId), username: body.username, messageId: `kick:${body.messageId}`, slot }));
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("ko join relay failed", err instanceof Error ? err.message : "unknown");
    return jsonError("processing_failed", 503);
  }
}
