import { isAdminRequest } from "@/lib/admin";
import { json, jsonError } from "@/lib/http";
import { drawWinners } from "@/lib/giveaways";
import { logAudit } from "@/lib/audit";

// Picks the winner server-side (provably fair) BEFORE the reel animates. The
// response is what the animation lands on — timing never decides the outcome.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) return jsonError("bad_id", 400);

  let count = 1;
  try {
    const body = await request.json();
    count = Math.max(1, Math.min(10, Number(body?.count) || 1));
  } catch {
    /* default 1 */
  }

  const winners = await drawWinners(giveawayId, count);
  if (winners.length === 0) return jsonError("no_eligible_entrants", 409);
  await logAudit("admin", "giveaway.draw", String(giveawayId), { winners: winners.map((w) => w.username) });

  return json({
    winners: winners.map((w) => ({ username: w.username, avatar: w.avatar, platform: "kick", nonce: w.nonce })),
    winner: { username: winners[0].username, avatar: winners[0].avatar, platform: "kick" },
  });
}
