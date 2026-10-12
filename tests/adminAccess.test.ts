import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createAdminSession, verifyAdminSession } from "../lib/adminSession";
import { isAdminRequest } from "../lib/admin";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

test("every admin Server Action checks the session itself (not only the layout)", () => {
  let actions = 0;
  for (const file of files("app/admin")) {
    const src = readFileSync(file, "utf8");
    // each `"use server"` body up to the next top-level function
    const bodies = src.split(/\n(?=async function |export default |function |const )/).filter((chunk) => chunk.includes('"use server"'));
    for (const body of bodies) {
      actions++;
      assert.match(body, /adminAction\(|requireAdmin\(|isAdminSession\(|guard\(/, `${file}: server action without an admin check:\n${body.slice(0, 200)}`);
    }
  }
  assert.ok(actions >= 30, `expected the event admin actions to be found, got ${actions}`);
});

test("every admin API route checks the admin cookie and the origin on mutations", () => {
  for (const file of files("app/api/admin")) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /isAdminRequest\(request\)/, file);
    if (/export async function (POST|PUT|PATCH|DELETE)/.test(src)) assert.match(src, /isSameOrigin\(request\)/, file);
  }
});

test("forged, expired or missing admin sessions are refused", () => {
  process.env.ADMIN_PASSWORD = "secret-pass";
  const good = createAdminSession("secret-pass");
  assert.equal(verifyAdminSession(good, "secret-pass"), true);
  assert.equal(verifyAdminSession(good, "rotated-pass"), false);
  assert.equal(verifyAdminSession(createAdminSession("secret-pass", Date.now() - 8 * 86400_000), "secret-pass"), false);
  const req = (cookie?: string) => new Request("http://localhost/api/admin/x", { headers: cookie ? { cookie } : {} });
  assert.equal(isAdminRequest(req()), false);
  const forged = good.slice(0, -1) + (good.endsWith("0") ? "1" : "0"); // always differs from the real signature
  assert.equal(isAdminRequest(req(`odt_admin=${forged}`)), false);
  assert.equal(isAdminRequest(req("odt_admin=admin")), false);
  assert.equal(isAdminRequest(req(`odt_admin=${encodeURIComponent(good)}`)), true);
});
