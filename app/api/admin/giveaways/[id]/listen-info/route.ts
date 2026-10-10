import { isAdminRequest } from "@/lib/admin";
import { json, jsonError } from "@/lib/http";
import { getGiveaway } from "@/lib/giveaways";
import { resolveChatroomId, KICK_PUSHER } from "@/lib/kickChat";
import { KICK_CHANNEL } from "@/lib/constants";

// Gives the dashboard what it needs to read Kick chat live from the browser:
// the chatroom id (resolved server-side) + the public socket params + the
// giveaway's keyword/filters. No secrets involved — this is Kick's public
// chat socket.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);

  const g = await getGiveaway(giveawayId);
  if (!g) return jsonError("not_found", 404);

  const requested = new URL(request.url).searchParams.get("channel");
  const channel = (requested || KICK_CHANNEL).trim().toLowerCase() || KICK_CHANNEL;

  const chatroomId = await resolveChatroomId(channel);
  if (!chatroomId) {
    return json({ ok: false, reason: "chatroom_unresolved", channel });
  }

  return json({
    ok: true,
    channel,
    chatroomId,
    wsUrl: KICK_PUSHER.wsUrl,
    socketChannel: KICK_PUSHER.channel(chatroomId),
    chatEvent: KICK_PUSHER.chatEvent,
    keyword: g.keyword,
    subscribersOnly: g.subscribers_only,
  });
}
