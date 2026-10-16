import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "./http";
import { rateLimit, clientIp } from "./ratelimit";
import { EventError } from "./events/common";
import { explainError } from "./events/messages";
import { currentAccountId, getAccount, type AccountSummary } from "./userAuth";
import { checkDestination, type Destination } from "./payout";

// Shared plumbing for the signed-in viewer's POST endpoints: same-origin,
// rate limit, session, JSON body; EventError codes become readable messages.
export async function accountPost<S extends z.ZodTypeAny>(
  request: Request, schema: S, fn: (acc: AccountSummary, body: z.infer<S>) => Promise<void>,
): Promise<NextResponse> {
  const fail = (code: string, status: number, detail?: string) => NextResponse.json({ ok: false, error: code, message: detail ?? explainError(code) }, { status });
  if (!isSameOrigin(request)) return fail("bad_origin", 403);
  const limit = await rateLimit(`account:${clientIp(request)}`, 30, 60);
  if (!limit.ok) return fail("rate_limited", 429);
  const id = await currentAccountId().catch(() => null);
  const acc = id != null ? await getAccount(id).catch(() => null) : null;
  if (!acc) return fail("signed_out", 401);
  let body: z.infer<S>;
  try { body = schema.parse(await request.json()); } catch { return fail("payout_invalid", 400); }
  try {
    await fn(acc, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof EventError) return fail(e.code, 409, e.detail);
    console.error("account action failed", e instanceof Error ? e.message : e);
    return fail("unexpected", 500);
  }
}

/** A payout destination; checkDestination (lib/payout) decides if it's valid. */
export const zDestination = z.object({
  method: z.enum(["stake", "usdc"]),
  value: z.string().max(128),
  network: z.string().max(16).default(""),
});

/** Validated destination or an EventError carrying the readable reason. */
export function destinationOrThrow(b: { method: string; value: string }): Destination {
  const r = checkDestination(b.method, b.value);
  if (!r.ok) throw new EventError("payout_invalid", r.error);
  return r.dest;
}
