import { isAdminRequest } from "@/lib/admin";
import { json, jsonError } from "@/lib/http";
import { resolveChatroomId, KICK_PUSHER } from "@/lib/kickChat";
import { KICK_CHANNEL } from "@/lib/constants";

// Public Kick chat socket parameters for the tournament dashboard's !join
// reader (no secrets: this is Kick's public chat socket, as for giveaways).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  const chatroomId = await resolveChatroomId(KICK_CHANNEL);
  if (!chatroomId) return json({ ok: false, reason: "chatroom_unresolved", channel: KICK_CHANNEL });
  return json({ ok: true, channel: KICK_CHANNEL, wsUrl: KICK_PUSHER.wsUrl, socketChannel: KICK_PUSHER.channel(chatroomId), chatEvent: KICK_PUSHER.chatEvent });
}
