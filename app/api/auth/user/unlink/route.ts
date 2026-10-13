import { NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/http";
import { AuthError, AUTH_MESSAGES, currentAccountId, isProvider, unlinkProvider } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const id = await currentAccountId().catch(() => null);
  if (id == null) return jsonError("signed_out", 401);
  let provider: unknown;
  try { ({ provider } = (await request.json()) as { provider?: unknown }); } catch { return jsonError("invalid_body", 400); }
  if (typeof provider !== "string" || !isProvider(provider)) return jsonError("invalid_body", 400);
  try {
    await unlinkProvider(id, provider);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = e instanceof AuthError ? e.code : "failed";
    return NextResponse.json({ ok: false, error: code, message: AUTH_MESSAGES[code] ?? AUTH_MESSAGES.failed }, { status: 409 });
  }
}
