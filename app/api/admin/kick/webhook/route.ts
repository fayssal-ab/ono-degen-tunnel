import { z } from "zod";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { chatWebhookStatus, configuredBroadcasterId, subscribeToChatMessages, unsubscribeEvents } from "@/lib/kick";

// Connects / disconnects Kick's official chat webhook for ONO's channel, so
// !join and !gb reach the server even when no admin page is open. Uses the
// app's own client credentials (server-side only).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  return json(await chatWebhookStatus());
}

const Body = z.object({ action: z.enum(["connect", "disconnect"]) });

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await request.json()); } catch { return jsonError("invalid_body", 400); }
  try {
    const status = await chatWebhookStatus();
    if (!status.configured) return json({ ok: false, error: "KICK_CLIENT_ID / KICK_CLIENT_SECRET are not set" }, 409);
    if (body.action === "connect" && !status.connected) {
      await subscribeToChatMessages(await configuredBroadcasterId());
    }
    if (body.action === "disconnect" && status.subscriptionIds.length) {
      await unsubscribeEvents(status.subscriptionIds);
    }
    await logAudit("admin", `kick.webhook_${body.action}`);
    return json({ ok: true, ...(await chatWebhookStatus()) });
  } catch (err) {
    console.error("kick webhook action failed", err instanceof Error ? err.message : "unknown");
    return json({ ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "Kick request failed" }, 502);
  }
}
