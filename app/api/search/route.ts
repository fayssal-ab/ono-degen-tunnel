import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getActivePeriod } from "@/lib/periods";
import { maskUsername } from "@/lib/mask";
import { gapTo } from "@/lib/money";
import { json, jsonError } from "@/lib/http";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// Self-lookup (prompt §5.2). Accepts a FULL username, returns ONLY a masked
// row + rank + how far to the next rank. Rate-limited so nobody can brute-force
// the username list (golden-rules-adjacent, CLAUDE.md working style).
export const dynamic = "force-dynamic";

const Body = z.object({ username: z.string().trim().min(1).max(191) });

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = await rateLimit(`search:${ip}`, 20, 60); // 20/min/IP
  if (!limit.ok) return jsonError("rate_limited", 429);

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return jsonError("invalid_body", 400);
  }

  const period = await getActivePeriod();
  if (!period) return json({ found: false, reason: "no_active_period" });

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT username, wagered, `rank` FROM live_entries WHERE period_id = ? AND LOWER(username) = LOWER(?) AND `rank` IS NOT NULL LIMIT 1",
    [period.id, parsed.username]
  );
  const me = rows[0];
  if (!me) return json({ found: false });

  // the rank immediately above, to compute the gap
  let gap: string | null = null;
  let targetRank: number | null = null;
  if ((me.rank as number) > 1) {
    const [above] = await pool.query<RowDataPacket[]>(
      "SELECT wagered, `rank` FROM live_entries WHERE period_id = ? AND `rank` < ? ORDER BY `rank` DESC LIMIT 1",
      [period.id, me.rank]
    );
    if (above[0]) {
      gap = gapTo(String(above[0].wagered), String(me.wagered));
      targetRank = above[0].rank as number;
    }
  }

  return json({
    found: true,
    rank: me.rank,
    maskedName: maskUsername(String(me.username)),
    wagered: String(me.wagered),
    gap,
    targetRank,
  });
}
