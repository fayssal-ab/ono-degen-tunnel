import "server-only";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

// Admin auth — ported from JBALLIN and extended with a username. There is no
// public user system; this is the ONLY login, reached by visiting /login
// directly. The cookie IS sha256(ADMIN_PASSWORD): any request presenting that
// exact hash is admin. Rotating ADMIN_PASSWORD invalidates every cookie for
// free, and there is no session table to manage.
//
// Credentials come from env: ADMIN_USERNAME (default "admin") + ADMIN_PASSWORD.
export const ADMIN_COOKIE_NAME = "odt_admin";
const ONE_WEEK = 60 * 60 * 24 * 7;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function adminToken(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not set");
  return sha256(password);
}

/** Validate a /login submission against the env credentials (timing-safe). */
export function checkCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME ?? "admin";
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedPass) return false;
  // Evaluate both so timing doesn't reveal which half was wrong.
  const userOk = safeEqual(username, expectedUser);
  const passOk = safeEqual(password, expectedPass);
  return userOk && passOk;
}

export function adminCookie(): { name: string; value: string; options: Record<string, unknown> } {
  return {
    name: ADMIN_COOKIE_NAME,
    value: adminToken(),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_WEEK,
    },
  };
}

/** For Server Components / Server Actions (reads the cookie jar). */
export async function isAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    return safeEqual(token, adminToken());
  } catch {
    return false;
  }
}

/** For Route Handlers (reads the raw request cookie header). */
export function isAdminRequest(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE_NAME}=`));
  if (!match) return false;
  const token = decodeURIComponent(match.slice(ADMIN_COOKIE_NAME.length + 1));
  try {
    return safeEqual(token, adminToken());
  } catch {
    return false;
  }
}
