import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";

// Fixed-window rate limiter. Uses Upstash if UPSTASH_* is set (prompt §7.8),
// otherwise a DB-backed window in `rate_limits`. Login fails closed on backend
// errors; public searches remain available.
export interface RateResult {
  ok: boolean;
  remaining: number;
}

async function upstashLimit(bucket: string, max: number, windowSec: number): Promise<RateResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const key = `rl:${bucket}`;
    const incr = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!incr.ok) throw new Error("rate_limit_backend_failed");
    const { result } = (await incr.json()) as { result: number };
    if (!Number.isInteger(result) || result < 1) throw new Error("rate_limit_invalid_count");
    if (result === 1) {
      const expire = await fetch(`${url}/expire/${encodeURIComponent(key)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!expire.ok) throw new Error("rate_limit_expiry_failed");
    }
    return { ok: result <= max, remaining: Math.max(0, max - result) };
  } catch {
    return bucket.startsWith("login:") ? { ok: false, remaining: 0 } : { ok: true, remaining: max };
  }
}

async function dbLimit(bucket: string, max: number, windowSec: number): Promise<RateResult> {
  try {
    const pool = getPool();
    // Reset the window if expired, then count this hit atomically-ish.
    await pool.query(
      `INSERT INTO rate_limits (bucket, tokens, reset_at)
       VALUES (?, 1, DATE_ADD(NOW(), INTERVAL ? SECOND))
       ON DUPLICATE KEY UPDATE
         tokens = IF(reset_at < NOW(), 1, tokens + 1),
         reset_at = IF(reset_at < NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND), reset_at)`,
      [bucket, windowSec, windowSec]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT tokens FROM rate_limits WHERE bucket = ?",
      [bucket]
    );
    const tokens = (rows[0]?.tokens as number) ?? 1;
    return { ok: tokens <= max, remaining: Math.max(0, max - tokens) };
  } catch {
    return bucket.startsWith("login:") ? { ok: false, remaining: 0 } : { ok: true, remaining: max };
  }
}

export async function rateLimit(
  bucket: string,
  max: number,
  windowSec: number
): Promise<RateResult> {
  return (await upstashLimit(bucket, max, windowSec)) ?? dbLimit(bucket, max, windowSec);
}

/** Best-effort client IP from proxy headers. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
