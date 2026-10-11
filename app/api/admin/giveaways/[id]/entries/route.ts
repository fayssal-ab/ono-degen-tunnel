import { entryEligible, collectionOpen } from "@/lib/giveawayRules";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError } from "@/lib/http";
import { kickConfigured } from "@/lib/kick";
import { getGiveaway, getEntries, getWinners } from "@/lib/giveaways";

// Polled by the dashboard for live, real entries (the Kick webhook writes them
// server-side; the browser can't listen to Kick directly).
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);

  const g = await getGiveaway(giveawayId);
  if (!g) return jsonError("not_found", 404);

  const [entries, winners] = await Promise.all([getEntries(giveawayId), getWinners(giveawayId)]);
  const eligible = entries.filter((e) => entryEligible(e, g));

  return json({
    giveaway: {
      id: g.id,
      title: g.title,
      prize: g.prize,
      status: g.status,
      keyword: g.keyword,
      subscribersOnly: g.subscribers_only,
      minMessages: g.min_messages,
      acceptingEntries: collectionOpen(g),
      poolLocked: winners.length > 0 || g.needs_reset,
    },
    kickConfigured: kickConfigured(),
    entries: entries.map((e) => ({
      username: e.username,
      avatar: e.avatar,
      platform: "kick" as const,
      isSubscriber: e.is_subscriber,
      excluded: e.excluded,
      eligible: entryEligible(e, g),
      createdAt: e.created_at,
    })),
    eligibleCount: eligible.length,
    winners: winners.map((w) => ({ username: w.username, avatar: w.avatar, nonce: w.nonce })),
  });
}
