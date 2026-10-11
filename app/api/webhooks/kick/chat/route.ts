import { NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import { verifyKickWebhookSignature } from "@/lib/kick";
import { getPool } from "@/lib/db";
import { recordChatEntry } from "@/lib/giveaways";
import { recordBalanceGuessIfActive } from "@/lib/guessBalance";

// Public endpoint — Kick POSTs here for every chat.message.sent once
// subscribed. Auth is the RSA signature (verified over the RAW body), not a
// shared secret. Deliveries are de-duped by message id so a Kick retry can't
// double-count an entry (prompt §7.9). Ported from JBALLIN.
export const dynamic = "force-dynamic";

const ChatPayload = z.object({
  content: z.string().max(10000),
  sender: z.object({ username: z.string().min(1).max(191), profile_picture: z.string().nullable().optional(),
    identity: z.object({ badges: z.array(z.object({ type: z.string() })).optional() }).nullable().optional() }),
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  const messageId = request.headers.get("kick-event-message-id");
  const timestamp = request.headers.get("kick-event-message-timestamp");
  const signature = request.headers.get("kick-event-signature");
  const eventType = request.headers.get("kick-event-type");
  if (!messageId || !timestamp || !signature) return NextResponse.json({ error: "missing_signature_headers" }, { status: 400 });
  try {
    const valid = await verifyKickWebhookSignature({ messageId, timestamp, rawBody, signatureBase64: signature });
    if (!valid) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    if (eventType !== "chat.message.sent") return NextResponse.json({ ok: true });
    const parsed = ChatPayload.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    const payload = parsed.data;
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.query<ResultSetHeader>("INSERT IGNORE INTO kick_webhook_seen (message_id) VALUES (?)", [messageId]);
      if (!res.affectedRows) { await conn.commit(); return NextResponse.json({ ok: true, deduped: true }); }
      const subscriber = payload.sender.identity?.badges?.some((b) => b.type === "subscriber") ?? false;
      await recordChatEntry(payload.sender.username, payload.content, payload.sender.profile_picture ?? null, subscriber, conn);
      await recordBalanceGuessIfActive(payload.sender.username, payload.content, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    console.error("Kick webhook processing failed");
    return NextResponse.json({ error: "processing_failed" }, { status: 503 });
  }
}
