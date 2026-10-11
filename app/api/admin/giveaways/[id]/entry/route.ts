import { z } from "zod";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { recordLiveEntry } from "@/lib/giveaways";
import { resolveKickAvatar } from "@/lib/kickChat";

// Records one live chat entry detected by the browser Kick-socket reader.
// Admin + same-origin only (the reader runs in the admin's dashboard).
export const dynamic = "force-dynamic";

const Body = z.object({
  username: z.string().trim().min(1).max(191),
  isSubscriber: z.boolean().optional(),
  avatar: z.string().trim().max(512).nullable().optional(),
});

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

  // The Kick chat socket event carries no avatar, so resolve the user's real
  // profile picture from Kick's public channel API (cached; null on failure →
  // the UI shows initials). recordLiveEntry COALESCEs, so it's only filled once.
  let avatar = body.avatar ?? null;
  if (!avatar) {
    try {
      avatar = await resolveKickAvatar(body.username);
    } catch {
      avatar = null;
    }
  }

  const recorded = await recordLiveEntry(giveawayId, body.username, Boolean(body.isSubscriber), avatar);
  return json({ ok: true, recorded, avatar });
}
