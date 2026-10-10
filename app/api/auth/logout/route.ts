import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Clears the admin cookie. POST from the admin logout button; GET redirects
// home (handy to paste in the address bar).
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET() {
  const res = NextResponse.redirect(new URL("/", SITE_URL));
  res.cookies.set(ADMIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
