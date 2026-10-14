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
  const add = async (ref: string, source: string, winner: string, kickId: string | null, discordId: string | null = null) => {
    await common.withTx((c) => prizes.recordAward(c, { source: source as "giveaway", sourceRef: ref, title: "Test", winner, winnerKickId: kickId, winnerDiscordId: discordId, amount: "50" }));
    const [r] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM prize_awards WHERE source_ref = ?", [ref]);
    return Number(r[0].id);
  };
  const winner = { kickId: "kw1", kickName: "WinnerGuy", discordId: null };
  const other = { kickId: "kw2", kickName: "OtherGuy", discordId: null };
  const acc = await auth.signInWith("kick", { id: "kw1", username: "WinnerGuy", avatar: "" }, null);
  const byName = await add("t:name", "giveaway", "winnerguy", null);   // matched by username (case-insensitive)
  const byId = await add("t:id", "tournament", "OldName", "kw1");      // matched by Kick id despite a rename
  const casino = await add("t:lb", "leaderboard", "WinnerGuy", null);  // casino username: never claimable
  const notMine = await add("t:other", "giveaway", "OtherGuy", "kw2");
  const discordNamesake = await add("t:dname", "manual", "WinnerGuy", null, "d-someone-else"); // Discord-verified: a same-named Kick user doesn't own it

  const owned = (await prizes.listOwnedAwards(winner)).map((a) => Number(a.id)).sort();
  assert.deepEqual(owned, [byName, byId].sort());
  assert.ok(!owned.includes(discordNamesake));
  assert.equal(await prizes.countOwnedActions(winner), 2);

  const stake = { method: "stake" as const, value: "stakeWinner", network: "" as const };
  await rejects(prizes.claimAward(notMine, acc, winner, stake, ""), "award_not_yours");
  await rejects(prizes.claimAward(casino, acc, winner, stake, ""), "award_not_yours");
  await prizes.claimAward(byName, acc, winner, stake, "");
  await prizes.claimAward(byName, acc, winner, { method: "usdc", value: "0x52908400098527886E0F7030069857D2E4169EE7", network: "BASE" }, "fast pls"); // edit while unpaid
  let [row] = (await pool.query<mysql.RowDataPacket[]>("SELECT * FROM prize_awards WHERE id = ?", [byName]))[0];
  assert.equal(row.payout_method, "usdc");
  assert.equal(row.payout_network, "BASE");
  assert.equal(row.claim_note, "fast pls");
  assert.ok(row.claimed_at);
  assert.equal(await prizes.countOwnedActions(winner), 1, "claimed prize no longer needs an action");

  await rejects(prizes.confirmReceived(byName, winner), "award_not_paid");
  await prizes.confirmPaid(byName, "50", "tx1");
  await rejects(prizes.claimAward(byName, acc, winner, stake, ""), "award_not_pending");
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

  // notifications: won + paid events, unread after the last open
  const feed = await prizes.listPrizeNotifications(winner, null);
  assert.ok(feed.items.some((n) => n.kind === "won" && n.award_id === byId));
  assert.equal(feed.unread, feed.items.length, "never opened: all unread");
  assert.equal((await prizes.listPrizeNotifications(winner, "2999-01-01 00:00:00")).unread, 0);
});

dbt("prize claim from Discord: verified Discord winner owns it, only the ticket member claims / confirms", async () => {
  const prizes = await import("../lib/prizes");
  const common = await import("../lib/events/common");
  const rejects = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => e instanceof common.EventError && e.code === code, code);
  const pool = db.getPool();
  await common.withTx((c) => prizes.recordAward(c, { source: "manual", sourceRef: "t:discord", title: "Stream", winner: "discordwinner", winnerDiscordId: "d-win", amount: "20" }));
  const [r] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM prize_awards WHERE source_ref = 't:discord'");
  const id = Number(r[0].id);
  await pool.query("UPDATE prize_awards SET discord_user_id = 'd-win' WHERE id = ?", [id]);

  // site side: owned through the linked Discord
  const acc = await auth.signInWith("discord", { id: "d-win", username: "discordwinner", avatar: "" }, null);
  const owner = { kickId: null, kickName: null, discordId: "d-win" };
  assert.deepEqual((await prizes.listOwnedAwards(owner)).map((a) => Number(a.id)), [id]);

  // Discord side
  const rainbet = { method: "rainbet" as const, value: "rain_guy", network: "" as const };
  await rejects(prizes.claimFromDiscord(id, "d-intruder", false, rainbet), "award_not_yours");
  await prizes.claimFromDiscord(id, "d-win", false, rainbet);
  let [row] = (await pool.query<mysql.RowDataPacket[]>("SELECT * FROM prize_awards WHERE id = ?", [id]))[0];
  assert.equal(row.payout_method, "rainbet");
  assert.equal(Number(row.claim_account_id), acc, "claim is tied to the linked site account");
  await prizes.claimFromDiscord(id, "d-staff", true, { method: "stake", value: "fixedByStaff", network: "" }); // staff may fix it
  [row] = (await pool.query<mysql.RowDataPacket[]>("SELECT payout_username FROM prize_awards WHERE id = ?", [id]))[0];
  assert.equal(row.payout_username, "fixedByStaff");
  await rejects(prizes.confirmReceivedFromDiscord(id, "d-win"), "award_not_paid");
  await prizes.confirmPaid(id, "20", "");
  await rejects(prizes.confirmReceivedFromDiscord(id, "d-staff"), "award_not_yours");
  await prizes.confirmReceivedFromDiscord(id, "d-win");
  await rejects(prizes.confirmReceivedFromDiscord(id, "d-win"), "award_already_received");
});

dbt("payout wallets: Stake, Rainbet and USDC are saved / removed independently", async () => {
  const a = await auth.signInWith("kick", { id: "k-wallet", username: "walletguy", avatar: "" }, null);
  await auth.saveDestination(a, { method: "stake", value: "stk", network: "" });
  await auth.saveDestination(a, { method: "rainbet", value: "rb", network: "" });
  await auth.saveDestination(a, { method: "usdc", value: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV", network: "SOL" });
  let acc = (await auth.getAccount(a))!;
  assert.equal(acc.payout_method, "stake", "first saved becomes the default");
  assert.deepEqual([acc.stake_username, acc.rainbet_username, acc.usdc_address, acc.usdc_network], ["stk", "rb", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV", "SOL"]);
  await auth.setPreferredDestination(a, "usdc");
  await auth.clearDestination(a, "rainbet");
  acc = (await auth.getAccount(a))!;
  assert.equal(acc.rainbet_username, "");
  assert.equal(acc.stake_username, "stk", "removing one keeps the others");
  assert.equal(acc.payout_method, "usdc");
  await auth.clearDestination(a, "usdc");
  acc = (await auth.getAccount(a))!;
  assert.equal(acc.payout_method, null, "removing the default clears it");
  assert.equal(acc.usdc_network, "");
});

dbt("giveaway winner: 15 s chat window decides the prize", async () => {
  const gw = await import("../lib/giveaways");
  const pool = db.getPool();
  const awards = async (gid: number) => (await pool.query<mysql.RowDataPacket[]>(
    "SELECT pa.winner FROM prize_awards pa JOIN giveaway_winners w ON pa.source_ref = CONCAT('gw:', w.id) WHERE pa.source = 'giveaway' AND w.giveaway_id = ? ORDER BY w.nonce", [gid]))[0].map((r) => r.winner);
  const gid = await gw.createGiveaway({ title: "Chat test", type: "manual", keyword: null, entry_condition: "", prize: "$25", subscribers_only: false, min_messages: 1, ends_at: null });
  for (const n of ["alpha", "bravo", "charlie"]) await gw.addManualEntry(gid, n);

  const [first] = await gw.drawWinners(gid, 1);
  assert.equal((await gw.getWinners(gid))[0].response, "waiting");
  assert.deepEqual(await awards(gid), [], "no prize until the winner answers");
  await gw.markNoShow(gid, first.nonce);
  await assert.rejects(gw.markNoShow(gid, first.nonce), /winner_already_decided/);
  assert.deepEqual(await awards(gid), [], "a no-show gets nothing");

  const [second] = await gw.drawWinners(gid, 1);
  await gw.confirmWinner(gid, second.nonce, "here!!");
  await assert.rejects(gw.confirmWinner(gid, second.nonce, "again"), /winner_already_decided/);
  assert.deepEqual(await awards(gid), [second.username], "answering in chat records the prize");
  const info = await gw.getWinnerInfo(gid, second.nonce);
  assert.equal(info?.response, "confirmed");
  assert.equal(info?.responseText, "here!!");
  assert.ok(info?.award);

  const [third] = await gw.drawWinners(gid, 1);   // left waiting: finishing the round confirms it
  await gw.setGiveawayStatus(gid, "closed");
  assert.deepEqual(await awards(gid), [second.username, third.username]);

  await gw.confirmWinner(gid, first.nonce, "(accepted by the admin)"); // admin override of a no-show
  assert.equal((await awards(gid)).length, 3);
  const pub = await gw.getPastWinners(50);
  assert.equal(pub.filter((w) => w.giveaway_id === gid).length, 3, "public list only shows confirmed winners");
});

dbt("rejected prizes can be deleted for good, others can't", async () => {
  const prizes = await import("../lib/prizes");
  const common = await import("../lib/events/common");
  const pool = db.getPool();
  const add = async (ref: string) => {
    await common.withTx((c) => prizes.recordAward(c, { source: "manual", sourceRef: ref, title: "Del", winner: "someone", amount: "5" }));
    return Number((await pool.query<mysql.RowDataPacket[]>("SELECT id FROM prize_awards WHERE source_ref = ?", [ref]))[0][0].id);
  };
  const keep = await add("t:del:keep");
  const [r1, r2, r3] = [await add("t:del:1"), await add("t:del:2"), await add("t:del:3")];
  for (const id of [r1, r2, r3]) await prizes.voidAward(id, "rejected");
  await assert.rejects(prizes.deleteVoidedAwards(keep), (e: unknown) => e instanceof common.EventError && e.code === "award_not_void");
  assert.equal(await prizes.deleteVoidedAwards(r1), 1);
  const voidedLeft = Number((await pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) n FROM prize_awards WHERE status = 'void'"))[0][0].n);
  assert.equal(await prizes.deleteVoidedAwards(null), voidedLeft, "delete all rejected");
  const left = (await pool.query<mysql.RowDataPacket[]>("SELECT id FROM prize_awards WHERE id IN (?)", [[keep, r1, r2, r3]]))[0].map((r) => Number(r.id));
  assert.deepEqual(left, [keep], "only the pending prize remains");
});

dbt("admin: list/search users, ban blocks sign-in and sessions, sign out, delete", async () => {
  const ua = await import("../lib/userAdmin");
  const a = await auth.signInWith("kick", { id: "k-ban", username: "BadActor", avatar: "" }, null);
  await auth.signInWith("discord", { id: "d-ban", username: "bad#d", avatar: "" }, a);
  const token = await auth.createUserSession(a);
  const found = await ua.listUsers({ q: "badact", limit: 10, offset: 0 });
  assert.equal(found.total, 1);
  assert.equal(found.rows[0].kick_name, "BadActor");
  assert.equal(found.rows[0].discord_name, "bad#d");
  assert.equal(Number(found.rows[0].sessions), 1);
  assert.equal((await ua.listUsers({ q: "100%_", limit: 10, offset: 0 })).total, 0, "LIKE wildcards are escaped");

  await ua.setBanned(a, true, "spam");
  assert.equal(await auth.accountForToken(token), null, "ban ends sessions");
  await assert.rejects(auth.signInWith("kick", { id: "k-ban", username: "BadActor", avatar: "" }, null), (e: unknown) => e instanceof auth.AuthError && e.code === "banned");
  const t2 = await auth.createUserSession(a);
  assert.equal(await auth.accountForToken(t2), null, "a banned account's session never resolves");
  assert.equal((await ua.listUsers({ filter: "banned", limit: 10, offset: 0 })).rows.some((r) => r.id === a), true);
  assert.ok((await ua.getUserStats()).banned >= 1);

  await ua.setBanned(a, false, "");
  assert.equal(await auth.accountForToken(t2), a, "unban restores sign-in");
  assert.equal(await ua.signOutEverywhere(a), 1);
  assert.equal(await auth.accountForToken(t2), null);

  await ua.deleteUser(a);
  assert.equal(await auth.getAccount(a), null);
  const again = await auth.signInWith("kick", { id: "k-ban", username: "BadActor", avatar: "" }, null);
  assert.notEqual(again, a, "deleted users can sign up again as a new account");
});
