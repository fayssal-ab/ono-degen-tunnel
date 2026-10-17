import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { currentAccountId, getAccount } from "@/lib/userAuth";
import { channelExists, discordConfig, openChallengeClaimTicket } from "@/lib/discordTickets";

// "Claim" on a challenge card: opens (or reopens) the player's private Discord
// ticket for that challenge, where they post the replay. Needs a site account
// with Discord linked — that's who gets added to the channel.
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return fail("bad_origin", 403);
  const limit = await rateLimit(`challenge-claim:${clientIp(request)}`, 10, 300);
  if (!limit.ok) return fail("rate_limited", 429);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail("bad_id", 400);

  const accountId = await currentAccountId().catch(() => null);
  const acc = accountId != null ? await getAccount(accountId).catch(() => null) : null;
  if (!acc) return fail("signed_out", 401);
  const discordId = acc.identities.find((i) => i.provider === "discord");
  if (!discordId) return fail("discord_required", 409);
  const cfg = discordConfig();
  if (!cfg) return fail("discord_not_configured", 503);

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, slot_name, provider, image_url, required_multiplier, min_bet, prize, status, expires_at FROM challenges WHERE id = ?", [id]);
  const c = rows[0];
  if (!c) return fail("not_found", 404);
  if (c.status !== "open" || (c.expires_at && new Date(`${String(c.expires_at).replace(" ", "T")}Z`) < new Date())) return fail("challenge_closed", 409);

  const url = (channel: string) => `https://discord.com/channels/${cfg.guildId}/${channel}`;
  try {
    const [have] = await pool.query<RowDataPacket[]>(
      "SELECT channel_id FROM challenge_claim_tickets WHERE challenge_id = ? AND discord_user_id = ?", [id, discordId.provider_user_id]);
    if (have[0]) {
      if (await channelExists(String(have[0].channel_id))) return NextResponse.json({ ok: true, url: url(String(have[0].channel_id)), existing: true });
      await pool.query("DELETE FROM challenge_claim_tickets WHERE challenge_id = ? AND discord_user_id = ?", [id, discordId.provider_user_id]);
    }
    const channel = await openChallengeClaimTicket({
      challenge: {
        id: Number(c.id), slot_name: String(c.slot_name), provider: c.provider ?? null, image_url: c.image_url ?? null,
        required_multiplier: String(c.required_multiplier), min_bet: String(c.min_bet ?? 0), prize: String(c.prize ?? ""), expires_at: c.expires_at ?? null,
      },
      discordUserId: discordId.provider_user_id,
      player: acc.display_name,
    });
    await pool.query(
      "INSERT INTO challenge_claim_tickets (challenge_id, discord_user_id, account_id, channel_id) VALUES (?, ?, ?, ?)",
      [id, discordId.provider_user_id, acc.id, channel]);
    return NextResponse.json({ ok: true, url: url(channel), existing: false });
  } catch (err) {
    console.error(`challenge #${id} claim ticket failed`, err);
    return fail("discord_failed", 502);
  }
}
