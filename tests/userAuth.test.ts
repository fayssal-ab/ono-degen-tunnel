// Viewer accounts: OAuth state signing, return-path safety, authorize URLs,
// and (with TEST_DB_NAME) sign-in / link / unlink rules on a real MySQL
// (`${TEST_DB_NAME}_auth`).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

const BASE = process.env.TEST_DB_NAME;
const NAME = BASE ? `${BASE}_auth` : undefined;
if (NAME && !/test/i.test(NAME)) throw new Error("TEST_DB_NAME must contain \"test\"");
Object.assign(process.env, {
  SESSION_SECRET: "test-session-secret-0123456789abcdef",
  KICK_CLIENT_ID: "kick-id", KICK_CLIENT_SECRET: "kick-secret", KICK_REDIRECT_URI: "https://site.test/api/auth/kick/callback",
  DISCORD_CLIENT_ID: "disc-id", DISCORD_CLIENT_SECRET: "disc-secret", DISCORD_REDIRECT_URI: "",
  NEXT_PUBLIC_SITE_URL: "https://site.test",
});
if (NAME) {
  Object.assign(process.env, {
    DB_HOST: process.env.TEST_DB_HOST ?? "127.0.0.1", DB_PORT: process.env.TEST_DB_PORT ?? "3306",
    DB_USER: process.env.TEST_DB_USER ?? "root", DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? "", DB_NAME: NAME,
    DB_SSL_CA_BASE64: "", DB_SSL_CA: "", DB_SSL_CA_PATH: "",
  });
}
const dbt = NAME ? test : test.skip;

let auth: typeof import("../lib/userAuth");
let db: typeof import("../lib/db");

before(async () => {
  if (NAME) {
    const root = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true });
    await root.query(`DROP DATABASE IF EXISTS \`${NAME}\``);
    await root.query(`CREATE DATABASE \`${NAME}\``);
    await root.changeUser({ database: NAME });
    for (const f of readdirSync("db/migrations").filter((n) => n.endsWith(".sql")).sort()) await root.query(readFileSync(join("db/migrations", f), "utf8"));
    await root.end();
    db = await import("../lib/db");
  }
  auth = await import("../lib/userAuth");
});
after(async () => { if (NAME) await db.getPool().end(); });

test("state cookie round-trips and rejects tampering or expiry", () => {
  const { state } = auth.beginOAuth("kick", "login", "/account");
  const st = auth.decodeState(state);
  assert.ok(st);
  assert.equal(st.p, "kick");
  assert.equal(st.n, "/account");
  const [body, sig] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ ...st, p: "discord" })).toString("base64url");
  assert.equal(auth.decodeState(`${forged}.${sig}`), null);
  assert.equal(auth.decodeState(`${body}.${sig.slice(0, -2)}xx`), null);
  assert.equal(auth.decodeState(state, Date.now() + 11 * 60 * 1000), null, "expires after 10 minutes");
  assert.equal(auth.decodeState(undefined), null);
});

test("return path stays on this site", () => {
  assert.equal(auth.safeNext("/tournaments"), "/tournaments");
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "", null, "javascript:alert(1)"]) assert.equal(auth.safeNext(bad), "/account");
});

test("Kick authorize URL uses PKCE S256; Discord asks only for identify", () => {
  const k = auth.beginOAuth("kick", "login", "/account");
  const ku = new URL(k.url);
  const st = auth.decodeState(k.state)!;
  assert.equal(ku.origin + ku.pathname, "https://id.kick.com/oauth/authorize");
  assert.equal(ku.searchParams.get("scope"), "user:read");
  assert.equal(ku.searchParams.get("state"), st.s);
  assert.equal(ku.searchParams.get("code_challenge_method"), "S256");
  assert.equal(ku.searchParams.get("code_challenge"), createHash("sha256").update(st.v).digest("base64url"));
  assert.equal(ku.searchParams.get("redirect_uri"), "https://site.test/api/auth/kick/callback");
  const d = new URL(auth.beginOAuth("discord", "link", "/account").url);
  assert.equal(d.origin + d.pathname, "https://discord.com/oauth2/authorize");
  assert.equal(d.searchParams.get("scope"), "identify");
  assert.equal(d.searchParams.get("redirect_uri"), "https://site.test/api/auth/discord/callback", "derived from the site URL");
});

dbt("sign in, link the other provider, refuse conflicts, unlink", async () => {
  const rejects = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => e instanceof auth.AuthError && e.code === code, code);
  const a = await auth.signInWith("kick", { id: "k1", username: "Yuki", avatar: "" }, null);
  assert.equal(await auth.signInWith("kick", { id: "k1", username: "YukiRenamed", avatar: "https://files.kick.com/a.png" }, null), a, "same identity → same account");
  assert.equal(await auth.signInWith("discord", { id: "d1", username: "yuki#d", avatar: "" }, a), a, "linked while signed in");
  assert.equal(await auth.signInWith("discord", { id: "d1", username: "yuki#d", avatar: "" }, null), a, "Discord now signs into the same account");
  let acc = await auth.getAccount(a);
  assert.deepEqual(acc!.identities.map((i) => i.provider).sort(), ["discord", "kick"]);
  assert.equal(acc!.identities.find((i) => i.provider === "kick")!.username, "YukiRenamed");

  const b = await auth.signInWith("discord", { id: "d2", username: "other", avatar: "" }, null);
  await rejects(auth.signInWith("kick", { id: "k1", username: "YukiRenamed", avatar: "" }, b), "identity_taken");
  await rejects(auth.signInWith("kick", { id: "k9", username: "second", avatar: "" }, a), "provider_already_linked");

  await auth.unlinkProvider(a, "kick");
  acc = await auth.getAccount(a);
  assert.deepEqual(acc!.identities.map((i) => i.provider), ["discord"]);
  assert.equal(acc!.display_name, "yuki#d");
  await rejects(auth.unlinkProvider(a, "discord"), "last_identity");
  await rejects(auth.unlinkProvider(a, "kick"), "not_linked");
  // the freed Kick identity can now go to the other account
  assert.equal(await auth.signInWith("kick", { id: "k1", username: "YukiRenamed", avatar: "" }, b), b);
});

dbt("sessions resolve until destroyed", async () => {
  const a = await auth.signInWith("kick", { id: "k-sess", username: "sess", avatar: "" }, null);
  const token = await auth.createUserSession(a);
  assert.equal(await auth.accountForToken(token), a);
  assert.equal(await auth.accountForToken("nope"), null);
  const [rows] = await db.getPool().query<mysql.RowDataPacket[]>("SELECT token_hash FROM user_sessions WHERE account_id = ?", [a]);
  assert.notEqual(rows[0].token_hash, token, "only the hash is stored");
  await auth.destroyUserSession(token);
  assert.equal(await auth.accountForToken(token), null);
});
