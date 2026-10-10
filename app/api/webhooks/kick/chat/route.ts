import { NextResponse } from "next/server";
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

interface ChatPayload {
  content: string;
  sender: {
    username: string;
    profile_picture?: string | null;
    identity?: { badges?: { type: string }[] };
  };
}

async function seenBefore(messageId: string): Promise<boolean> {
  try {
    const [res] = await getPool().query<ResultSetHeader>(
      "INSERT IGNORE INTO kick_webhook_seen (message_id) VALUES (?)",
      [messageId]
    );
    return res.affectedRows === 0; // 0 = row already existed
  } catch {
    return false; // on error, process rather than silently drop
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const messageId = request.headers.get("kick-event-message-id");
  const timestamp = request.headers.get("kick-event-message-timestamp");
  const signature = request.headers.get("kick-event-signature");
  const eventType = request.headers.get("kick-event-type");

  if (!messageId || !timestamp || !signature) {
    return NextResponse.json({ error: "missing_signature_headers" }, { status: 400 });
  }

  const valid = await verifyKickWebhookSignature({ messageId, timestamp, rawBody, signatureBase64: signature });
  if (!valid) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  if (eventType !== "chat.message.sent") return NextResponse.json({ ok: true });
  if (await seenBefore(messageId)) return NextResponse.json({ ok: true, deduped: true });

  let payload: ChatPayload;
  try {
    payload = JSON.parse(rawBody) as ChatPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const username = payload.sender?.username;
  if (!username) return NextResponse.json({ ok: true });
  const avatar = payload.sender.profile_picture ?? null;
  const isSub = payload.sender.identity?.badges?.some((b) => b.type === "subscriber") ?? false;

  await Promise.all([
    recordChatEntry(username, payload.content ?? "", avatar, isSub),
    recordBalanceGuessIfActive(username, payload.content ?? ""),
  ]);

  return NextResponse.json({ ok: true });
}
