import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

// Shared route-handler helpers.

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(code: string, status = 400): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Bearer CRON_SECRET check for cron routes (prompt §7). */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && safeEqual(token, secret);
}

/** Origin check for state-changing POSTs (CSRF-safe alongside SameSite=Lax). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    const o = new URL(origin);
    const allowed = new Set<string>();
    if (site) allowed.add(new URL(site).origin);
    allowed.add(new URL(request.url).origin);
    return allowed.has(o.origin);
  } catch {
    return false;
  }
}
