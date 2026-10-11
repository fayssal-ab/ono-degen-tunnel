import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { drawWinners } from "@/lib/giveaways";
import { logAudit } from "@/lib/audit";

// Picks the winner server-side (provably fair) BEFORE the reel animates. The
// response is what the animation lands on — timing never decides the outcome.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);

  let count = 1;
  try {
    const body = await request.json();
    count = Number(body?.count ?? 1);
  } catch {
    /* default 1 */
  }

  if (!Number.isInteger(count) || count < 1 || count > 10) return jsonError("invalid_count", 400);
  let winners;
  try { winners = await drawWinners(giveawayId, count); }
  catch (err) {
    if (err instanceof Error && err.message === "round_finished") return jsonError("round_finished", 409);
    throw err;
  }
  if (winners.length === 0) return jsonError("no_eligible_entrants", 409);
  await logAudit("admin", "giveaway.draw", String(giveawayId), { winners: winners.map((w) => w.username) });

  return json({
    winners: winners.map((w) => ({ username: w.username, avatar: w.avatar, platform: "kick", nonce: w.nonce })),
    winner: { username: winners[0].username, avatar: winners[0].avatar, platform: "kick" },
  });
}
