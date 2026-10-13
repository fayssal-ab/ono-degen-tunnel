import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSameOrigin, jsonError } from "@/lib/http";
import { USER_COOKIE, destroyUserSession } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  await destroyUserSession((await cookies()).get(USER_COOKIE)?.value).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(USER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
