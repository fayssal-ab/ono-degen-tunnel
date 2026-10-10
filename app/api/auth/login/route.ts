import { z } from "zod";
import { NextResponse } from "next/server";
import { checkCredentials, adminCookie } from "@/lib/admin";
import { jsonError, isSameOrigin } from "@/lib/http";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// The only login on the site. No public accounts — credentials come from env
// (ADMIN_USERNAME / ADMIN_PASSWORD). Rate-limited to blunt brute force.
export const dynamic = "force-dynamic";

const Body = z.object({ username: z.string().min(1).max(191), password: z.string().min(1).max(191) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);

  const ip = clientIp(request);
  const limit = await rateLimit(`login:${ip}`, 8, 300); // 8 tries / 5 min / IP
  if (!limit.ok) return jsonError("rate_limited", 429);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return jsonError("invalid_body", 400);
  }

  if (!checkCredentials(body.username, body.password)) {
    return jsonError("invalid_credentials", 401);
  }

  const res = NextResponse.json({ ok: true });
  const c = adminCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
