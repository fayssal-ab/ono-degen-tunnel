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

dbt("prize claim: only the Kick winner claims, admin pays, winner confirms receipt", async () => {
  const prizes = await import("../lib/prizes");
  const common = await import("../lib/events/common");
  const rejects = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => e instanceof common.EventError && e.code === code, code);
  const pool = db.getPool();
  const add = async (ref: string, source: string, winner: string, kickId: string | null) => {
    await common.withTx((c) => prizes.recordAward(c, { source: source as "giveaway", sourceRef: ref, title: "Test", winner, winnerKickId: kickId, amount: "50" }));
    const [r] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM prize_awards WHERE source_ref = ?", [ref]);
    return Number(r[0].id);
  };
  const winner = { id: "kw1", username: "WinnerGuy" };
  const other = { id: "kw2", username: "OtherGuy" };
  const acc = await auth.signInWith("kick", { id: winner.id, username: winner.username, avatar: "" }, null);
  const byName = await add("t:name", "giveaway", "winnerguy", null);   // matched by username (case-insensitive)
  const byId = await add("t:id", "tournament", "OldName", "kw1");      // matched by Kick id despite a rename
  const casino = await add("t:lb", "leaderboard", "WinnerGuy", null);  // casino username: never claimable
  const notMine = await add("t:other", "giveaway", "OtherGuy", "kw2");

  const owned = (await prizes.listOwnedAwards(winner)).map((a) => Number(a.id)).sort();
  assert.deepEqual(owned, [byName, byId].sort());
  assert.equal(await prizes.countOwnedActions(winner), 2);

  const payout = { method: "stake" as const, username: "stakeWinner", note: "" };
  await rejects(prizes.claimAward(notMine, acc, winner, payout), "award_not_yours");
  await rejects(prizes.claimAward(casino, acc, winner, payout), "award_not_yours");
  await prizes.claimAward(byName, acc, winner, payout);
  await prizes.claimAward(byName, acc, winner, { ...payout, username: "stakeWinner2" }); // edit while unpaid
  let [row] = (await pool.query<mysql.RowDataPacket[]>("SELECT * FROM prize_awards WHERE id = ?", [byName]))[0];
  assert.equal(row.payout_username, "stakeWinner2");
  assert.equal(row.winner_kick_id, "kw1", "claim pins the Kick id");
  assert.ok(row.claimed_at);
  assert.equal(await prizes.countOwnedActions(winner), 1, "claimed prize no longer needs an action");

  await rejects(prizes.confirmReceived(byName, winner), "award_not_paid");
  await prizes.confirmPaid(byName, "50", "tx1");
  await rejects(prizes.claimAward(byName, acc, winner, payout), "award_not_pending");
  assert.equal(await prizes.countOwnedActions(winner), 2, "paid prize waits for receipt");
  await rejects(prizes.confirmReceived(byName, other), "award_not_yours");
  await prizes.confirmReceived(byName, winner);
  await rejects(prizes.confirmReceived(byName, winner), "award_already_received");
  const pub = await prizes.getPublicAwards();
  assert.equal(pub.awards.find((a) => a.id === byName)?.received, true);
  await prizes.reopenAward(byName);
  [row] = (await pool.query<mysql.RowDataPacket[]>("SELECT status, received_at FROM prize_awards WHERE id = ?", [byName]))[0];
  assert.equal(row.status, "pending");
  assert.equal(row.received_at, null, "undo clears the receipt");
});
