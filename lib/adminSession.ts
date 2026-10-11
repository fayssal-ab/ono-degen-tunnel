import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TTL = 7 * 24 * 60 * 60;
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(`odt-admin-v2:${payload}`).digest("hex");
export function createAdminSession(secret: string, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000) + TTL}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload, secret)}`;
}
export function verifyAdminSession(token: string, secret: string, now = Date.now()): boolean {
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const expires = Number(parts[0]);
  const seconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expires) || expires <= seconds || expires > seconds + TTL) return false;
  const expected = sign(`${parts[0]}.${parts[1]}`, secret);
  return timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected));
}
