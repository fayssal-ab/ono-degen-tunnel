// Knockout + catalogue integration tests on a REAL disposable MySQL (see
// tests/events.db.test.ts). Uses `${TEST_DB_NAME}_ko`; skipped without TEST_DB_NAME.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

const BASE = process.env.TEST_DB_NAME;
const NAME = BASE ? `${BASE}_ko` : undefined;
if (NAME && !/test/i.test(NAME)) throw new Error("TEST_DB_NAME must contain \"test\"");
if (NAME) {
  Object.assign(process.env, {
    DB_HOST: process.env.TEST_DB_HOST ?? "127.0.0.1", DB_PORT: process.env.TEST_DB_PORT ?? "3306",
    DB_USER: process.env.TEST_DB_USER ?? "root", DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? "", DB_NAME: NAME,
    DB_POOL_LIMIT: "20", DB_SSL_CA_BASE64: "", DB_SSL_CA: "", DB_SSL_CA_PATH: "",
  });
}
const t = NAME ? test : test.skip;

let db: typeof import("../lib/db");
let ko: typeof import("../lib/knockout");
let cat: typeof import("../lib/slotCatalog");
let common: typeof import("../lib/events/common");
let hunt: typeof import("../lib/bonusHunt");
const q = async (sql: string, args: unknown[] = []) => (await db.getPool().query(sql, args))[0] as mysql.RowDataPacket[];
let msg = 0;
const join_ = (uid: string, name = `user${uid}`) => common.withTx((c) => ko.recordJoin(c, { kickUserId: uid, username: name, messageId: `m${++msg}` }));
const rejects = (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof common.EventError && e.code === code, `expected ${code}`);

before(async () => {
  if (!NAME) return;
  const root = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true });
  await root.query(`DROP DATABASE IF EXISTS \`${NAME}\``);
  await root.query(`CREATE DATABASE \`${NAME}\``);
  await root.changeUser({ database: NAME });
  for (const f of readdirSync("db/migrations").filter((n) => n.endsWith(".sql")).sort()) await root.query(readFileSync(join("db/migrations", f), "utf8"));
  // a small verified catalogue (real slot.report ids/images as fixtures; no network in tests)
  const slots: [string, string, string, string, string][] = [];
  for (let i = 0; i < 40; i++) slots.push([`pragmatic-play/slot-${i}`, `slot-${i}`, `Slot ${i}`, `slot ${i}`, "Pragmatic Play"]);
  await root.query(
    "INSERT INTO slot_catalog (id, slug, name, name_norm, provider, provider_slug, image_status, image_url) VALUES ?",
    [slots.map(([id, slug, name, norm, prov]) => [id, slug, name, norm, prov, "pragmatic-play", "real", `https://slot.report/images/slots/${slug}-thumb.webp`])]
  );
  await root.query("INSERT INTO slot_catalog (id, slug, name, name_norm, provider, provider_slug, image_status, image_url, ambiguous) VALUES ('wazdan/disputed','disputed','Disputed','disputed','Wazdan','wazdan','real','x',1), ('x/no-art','no-art','No Art','no art','X','x','missing',NULL,0)");
  await root.query("INSERT INTO slot_catalog (id, slug, name, name_norm, provider, provider_slug, image_status, image_url) VALUES ('pragmatic-play/gates-of-olympus','gates-of-olympus','Gates of Olympus','gates of olympus','Pragmatic Play','pragmatic-play','real','https://slot.report/images/slots/gates-of-olympus-thumb.webp')");
  await root.end();
  db = await import("../lib/db");
  ko = await import("../lib/knockout");
  cat = await import("../lib/slotCatalog");
  common = await import("../lib/events/common");
  hunt = await import("../lib/bonusHunt");
});
after(async () => { if (NAME) await db.getPool().end(); });

let tid = 0;

t("registration: 16 unique players max under concurrent !join, repeats only reroll, duplicates ignored", async () => {
  tid = await ko.createKo({ title: "Friday KO", prize: "$500" });
  await rejects(ko.createKo({ title: "second", prize: "" }), "ko_already_running");
  assert.equal((await join_("1")).outcome, "registration_closed"); // not open yet
  await ko.openRegistration(tid);

  // 20 different viewers spam !join at the same time (plus repeats) → exactly 16 registered
  const results = await Promise.all([...Array.from({ length: 20 }, (_, i) => join_(String(100 + i))), join_("100"), join_("101")]);
  const regs = results.filter((r) => r.outcome === "registered").length;
  assert.equal(regs, 16);
  assert.equal((await q("SELECT COUNT(*) n FROM ko_participants WHERE tournament_id=?", [tid]))[0].n, 16);
  assert.equal((await q("SELECT status FROM ko_tournaments WHERE id=?", [tid]))[0].status, "closed"); // auto-closed at 16
  assert.ok(results.some((r) => r.outcome === "full" || r.outcome === "registration_closed"));

  // pool excludes no-art and disputed slots; slots are unique while the pool allows
  const slots = await q("SELECT slot_id FROM ko_participants WHERE tournament_id=?", [tid]);
  assert.equal(new Set(slots.map((s) => s.slot_id)).size, 16);
  assert.ok(slots.every((s) => !["wazdan/disputed", "x/no-art"].includes(String(s.slot_id))));

  // a registered player's repeated !join → same row, same position, new slot, counter unchanged
  const [p] = await q("SELECT id, slot_id, rerolls FROM ko_participants WHERE tournament_id=? ORDER BY id LIMIT 1", [tid]);
  const uid = (await q("SELECT kick_user_id FROM ko_participants WHERE id=?", [p.id]))[0].kick_user_id;
  assert.equal((await join_(String(uid))).outcome, "rerolled");
  const [after1] = await q("SELECT id, slot_id, rerolls FROM ko_participants WHERE tournament_id=? ORDER BY id LIMIT 1", [tid]);
  assert.equal(after1.id, p.id);
  assert.notEqual(after1.slot_id, p.slot_id);
  assert.equal(Number(after1.rerolls), Number(p.rerolls) + 1);
  assert.equal((await q("SELECT COUNT(*) n FROM ko_participants WHERE tournament_id=?", [tid]))[0].n, 16);
  // the same chat message delivered twice (socket + webhook) rerolls once
  const dup = await common.withTx((c) => ko.recordJoin(c, { kickUserId: String(uid), username: "x", messageId: "same" }));
  const dup2 = await common.withTx((c) => ko.recordJoin(c, { kickUserId: String(uid), username: "x", messageId: "same" }));
  assert.equal(dup.outcome, "rerolled");
  assert.equal(dup2.outcome, "duplicate_message");
});

t("roller: distinct eligible players, confirm locks, cancel releases, rolled players can't reroll", async () => {
  const r1 = await ko.rollPlayers(tid);
  assert.notEqual(r1.p1, r1.p2);
  await rejects(ko.rollPlayers(tid), "roll_pending");
  // a rolled-but-unconfirmed player can't change slot
  const uid = (await q("SELECT kick_user_id FROM ko_participants WHERE id=?", [r1.p1]))[0].kick_user_id;
  assert.equal((await join_(String(uid))).outcome, "pending_roll");
  await ko.cancelRoll(tid);
  assert.equal((await q("SELECT COUNT(*) n FROM ko_matches WHERE tournament_id=? AND round=1 AND p1_id IS NOT NULL", [tid]))[0].n, 0);

  // fill all 8 round-of-16 battles
  const seen = new Set<number>();
  for (let i = 0; i < 8; i++) {
    const r = await ko.rollPlayers(tid);
    for (const id of [r.p1, r.p2!]) { assert.ok(!seen.has(id), "player rolled twice"); seen.add(id); }
    await ko.confirmRoll(tid);
  }
  assert.equal(seen.size, 16);
  await rejects(ko.rollPlayers(tid), "first_round_full");
  const states = await q("SELECT state, COUNT(*) n FROM ko_participants WHERE tournament_id=? GROUP BY state", [tid]);
  assert.deepEqual(states.map((s) => [s.state, Number(s.n)]), [["in_knockout", 16]]);
  const pos = await q("SELECT bracket_pos FROM ko_participants WHERE tournament_id=? ORDER BY bracket_pos", [tid]);
  assert.deepEqual(pos.map((p) => Number(p.bracket_pos)), Array.from({ length: 16 }, (_, i) => i + 1));
  // slot locked once in the knockout
  const lockedUid = (await q("SELECT kick_user_id FROM ko_participants WHERE tournament_id=? LIMIT 1", [tid]))[0].kick_user_id;
  assert.equal((await join_(String(lockedUid))).outcome, "locked_in_bracket");
});

t("battles: one live at a time, winner advances on the fixed path, loser eliminated for good, champion crowned", async () => {
  await rejects(ko.declareWinner(tid, 1, 1), "battle_not_live");
  const winners = new Map<string, number>();
  let played = 0;
  while ((await ko.getKoById(tid))!.status !== "finished") {
    const matchId = await ko.startBattle(tid);
    await rejects(ko.startBattle(tid), "battle_already_live");
    const [m] = await q("SELECT * FROM ko_matches WHERE id=?", [matchId]);
    const round = Number(m.round);
    const i = Number(m.match_index);
    if (round > 1) {
      // participants come from the correct feeder matches, never another path
      assert.equal(Number(m.p1_id), winners.get(`${round - 1}-${i * 2}`));
      assert.equal(Number(m.p2_id), winners.get(`${round - 1}-${i * 2 + 1}`));
    }
    // a later round never starts before its feeders are decided
    for (let r = 1; r < round; r++) assert.ok(winners.has(`${r}-${Math.floor(i * 2 ** (round - r))}`));
    const side = (i % 2 === 0 ? 1 : 2) as 1 | 2;
    const res = await ko.declareWinner(tid, matchId, side);
    played++;
    winners.set(`${round}-${i}`, res.winnerId);
    const loser = Number(side === 1 ? m.p2_id : m.p1_id);
    assert.equal((await q("SELECT state FROM ko_participants WHERE id=?", [loser]))[0].state, "eliminated");
    assert.equal(res.champion, round === 4);
    const luid = (await q("SELECT kick_user_id FROM ko_participants WHERE id=?", [loser]))[0].kick_user_id;
    assert.equal((await join_(String(luid))).outcome, round === 4 ? "no_tournament" : "eliminated"); // can't rejoin or reroll
    await rejects(ko.declareWinner(tid, matchId, 1), round === 4 ? "ko_finished" : "battle_not_live"); // no double result
  }
  assert.equal(played, 15);
  const [tt] = await q("SELECT status, champion_id FROM ko_tournaments WHERE id=?", [tid]);
  assert.equal(tt.status, "finished");
  assert.equal(Number(tt.champion_id), winners.get("4-0"));
  assert.equal((await q("SELECT COUNT(*) n FROM ko_participants WHERE tournament_id=? AND state='eliminated'", [tid]))[0].n, 15);
  await rejects(ko.rollPlayers(tid), "ko_finished");
  const st = await ko.getKoState((await ko.getKoById(tid))!);
  assert.equal(st.champion?.id, winners.get("4-0"));
  assert.ok(!("kick_user_id" in (st.participants[0] as object)), "public state must not expose Kick ids");
});

t("fewer than 16: last player gets a bye, empty slots void, byes propagate to a champion", async () => {
  const id = await ko.createKo({ title: "Small", prize: "" });
  await ko.openRegistration(id);
  for (const u of ["a", "b", "c", "d", "e"]) await join_(`s-${u}`);
  for (let i = 0; i < 2; i++) { await ko.rollPlayers(id); await ko.confirmRoll(id); }
  await rejects(ko.rollPlayers(id), "not_enough_players"); // 1 left while open
  await ko.closeRegistration(id);
  const bye = await ko.rollPlayers(id);
  assert.equal(bye.bye, true);
  const r1 = await q("SELECT match_index, status FROM ko_matches WHERE tournament_id=? AND round=1 ORDER BY match_index", [id]);
  assert.deepEqual(r1.map((m) => m.status), ["ready", "ready", "bye", "void", "void", "void", "void", "void"]);
  // play it out
  for (let k = 0; k < 10; k++) {
    const t2 = (await ko.getKoById(id))!;
    if (t2.status === "finished") break;
    const mid = await ko.startBattle(id);
    await ko.declareWinner(id, mid, 1);
  }
  const fin = (await ko.getKoById(id))!;
  assert.equal(fin.status, "finished");
  assert.equal((await q("SELECT COUNT(*) n FROM ko_participants WHERE tournament_id=? AND state='champion'", [id]))[0].n, 1);
  await rejects(ko.openRegistration(id), "ko_finished");
});

t("reset cancels the running tournament and allows a new one; refresh-safe state", async () => {
  const id = await ko.createKo({ title: "To reset", prize: "" });
  await ko.openRegistration(id);
  await join_("r1"); await join_("r2");
  const before = await ko.getKoState((await ko.getKoById(id))!);
  const again = await ko.getKoState((await ko.getKoById(id))!); // "refresh"
  assert.deepEqual(again.participants.map((p) => p.id), before.participants.map((p) => p.id));
  await ko.resetKo(id);
  assert.equal((await join_("r3")).outcome, "no_tournament");
  assert.ok(await ko.createKo({ title: "Fresh", prize: "" }));
});

t("catalogue: fuzzy search, hunt bonus from catalogue uses server data", async () => {
  const res = await cat.searchCatalog("gates olympus");
  assert.equal(res[0].name, "Gates of Olympus");
  assert.equal(res[0].provider, "Pragmatic Play");
  assert.ok(res[0].imageUrl?.endsWith("gates-of-olympus-thumb.webp"));
  const noArt = await cat.searchCatalog("no art");
  assert.equal(noArt[0].imageUrl, null); // never a placeholder URL
  const hid = await hunt.createHunt({ title: "H", start_balance: "100", image_url: "" });
  await hunt.addHuntEntryFromCatalog(hid, "pragmatic-play/gates-of-olympus", "2");
  const [e] = await q("SELECT slot_id, slot_name, provider, image_url FROM bonus_hunt_entries WHERE hunt_id=?", [hid]);
  assert.deepEqual([e.slot_id, e.slot_name, e.provider], ["pragmatic-play/gates-of-olympus", "Gates of Olympus", "Pragmatic Play"]);
  await rejects(hunt.addHuntEntryFromCatalog(hid, "nope/nope", "1"), "slot_not_found");
});

t("Stake list: name matching, pool restricted to Stake slots, Stake-only image host checked", async () => {
  const m = await cat.matchStakeNames("Gates of Olympus\nslot 3\nDrac's Stacks\n\nGates of Olympus");
  assert.equal(m.length, 3); // de-duplicated, blanks dropped
  assert.equal(m[0].slot?.id, "pragmatic-play/gates-of-olympus");
  assert.equal(m[1].slot?.id, "pragmatic-play/slot-3");
  assert.equal(m[2].slot, null); // not in the catalogue → add as Stake-only
  await cat.markOnStake(["pragmatic-play/gates-of-olympus", "pragmatic-play/slot-3", "wazdan/disputed", "x/no-art"]);
  // only marked slots with verified art are drawn (disputed one allowed: the admin chose it)
  const drawn = new Set<string>();
  for (let i = 0; i < 60; i++) drawn.add((await common.withTx((c) => cat.randomPoolSlot(c))).id);
  assert.deepEqual([...drawn].sort(), ["pragmatic-play/gates-of-olympus", "pragmatic-play/slot-3", "wazdan/disputed"]);
  assert.equal((await cat.getCatalogStats()).pool, 3);
  assert.equal((await cat.searchCatalog("gates"))[0].onStake, true);
  await rejects(cat.addStakeOnlySlot({ name: "Bank Basher", provider: "Twist Gaming", imageUrl: "https://evil.example/x.png" }), "invalid_input");
  await rejects(cat.addStakeOnlySlot({ name: "Bank Basher", provider: "Twist Gaming", imageUrl: "http://mediumrare.imgix.net/x" }), "invalid_input");
  await cat.markOnStake(["pragmatic-play/gates-of-olympus", "pragmatic-play/slot-3", "wazdan/disputed", "x/no-art"], false);
  assert.equal((await cat.getCatalogStats()).onStake, 0);
});
