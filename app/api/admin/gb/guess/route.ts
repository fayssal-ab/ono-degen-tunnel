import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { withTx } from "@/lib/events/common";
import { recordBalanceGuessIfActive, parseGbCommand } from "@/lib/guessBalance";
import { messageSentAt } from "@/lib/kickEvents";

// Relay for `!gb <amount>` read from Kick's public chat socket by the admin GB
// page (the signed webhook path stays active too). Kick user id identifies the
// guesser; the chat message's own timestamp decides "latest guess"; message
// ids are de-duplicated so a socket replay can't be counted twice.
export const dynamic = "force-dynamic";

const Body = z.object({
  messageId: z.string().trim().min(1).max(160),
  userId: z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative()]),
  username: z.string().trim().min(1).max(191),
  content: z.string().max(500),
  sentAt: z.string().max(64).nullable().optional(),
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
  if (parseGbCommand(body.content) === null) return json({ ok: true, outcome: "not_command" });
  const sentAt = messageSentAt(body.sentAt ?? undefined, "") ?? new Date();
  try {
    const outcome = await withTx(async (conn) => {
      const [seen] = await conn.query<ResultSetHeader>("INSERT IGNORE INTO kick_webhook_seen (message_id) VALUES (?)", [`chat:${body.messageId}`]);
      if (!seen.affectedRows) return "duplicate_message";
      return recordBalanceGuessIfActive({ kickUserId: String(body.userId), username: body.username, content: body.content, sentAt }, conn);
    });
    return json({ ok: true, outcome });
  } catch (err) {
    console.error("gb relay failed", err instanceof Error ? err.message : "unknown");
    return jsonError("processing_failed", 503);
  }
}
