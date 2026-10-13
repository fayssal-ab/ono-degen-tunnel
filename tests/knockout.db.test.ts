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
  await root.end();
  db = await import("../lib/db");
  ko = await import("../lib/knockout");
  cat = await import("../lib/slotCatalog");
  common = await import("../lib/events/common");
  hunt = await import("../lib/bonusHunt");
  // Stake catalogue fixture in the feed's format (no network in tests)
  const img = (i: number) => i.toString(16).padStart(64, "a");
  const slots: unknown[][] = [];
  for (let i = 0; i < 600; i++) slots.push([i, `Slot ${i}`, 0, `slot-${i}`, img(i), 96, 0, 0, null, null, 100 + i]);
  slots.push([9001, "Gates of Olympus", 0, "gates-of-olympus", img(9001), 96.5, 1, 0, 5000, null, 5]);
  slots.push([9002, "Wanted Dead or a Wild", 1, "wanted-dead-or-a-wild", img(9002), 96.4, 1, 0, 12500, null, 20]);
  slots.push([9003, "Wanted Outlaws", 2, "wanted-outlaws", img(9003), 96, 0, 0, null, null, 900]);
  slots.push([9004, "Soul Strings", 3, "glasscannon-soul-strings", img(9004), 96.7, 1, 1, null, null, 365]);
  slots.push([9005, "No Art", 0, "no-art", "", 96, 0, 0, null, null, 50]);
  slots.push([9006, "Rare Slot", 0, "rare-slot", img(9006), 96, 0, 0, null, null, 5000]);
  await cat.importStakeCatalog(cat.parseStakeFeed({ image_base: "https://mediumrare.imgix.net/", providers: ["Pragmatic Play", "Hacksaw Gaming", "All For One Studios", "Glass Cannon"], slots }));
});
after(async () => { if (NAME) await db.getPool().end(); });

let tid = 0;

t("registration: 16 unique players max under concurrent !join, repeats only reroll, duplicates ignored", async () => {
  tid = await ko.createKo({ title: "Friday KO", prize: "$500", prizes: ["300", "150", "50"] });
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

  // slots are unique while the pool allows
  const slots = await q("SELECT slot_id FROM ko_participants WHERE tournament_id=?", [tid]);
  assert.equal(new Set(slots.map((s) => s.slot_id)).size, 16);
  // random slots: Stake's top played with art only (no art / unpopular never drawn)
  assert.ok(slots.every((s) => !["stake/no-art", "stake/rare-slot"].includes(String(s.slot_id))));

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
  const losers = new Map<string, number>();
  let played = 0;
  while ((await ko.getKoById(tid))!.status !== "finished") {
    const matchId = await ko.startBattle(tid);
    await rejects(ko.startBattle(tid), "battle_already_live");
    const [m] = await q("SELECT * FROM ko_matches WHERE id=?", [matchId]);
    const round = Number(m.round);
    const i = Number(m.match_index);
    const bronze = round === 4 && i === 1;
    if (bronze) {
      // 3rd-place match = the two semi-final losers, played before the Grand Final
      assert.equal(Number(m.p1_id), losers.get("3-0"));
      assert.equal(Number(m.p2_id), losers.get("3-1"));
      assert.ok(!winners.has("4-0"), "3rd-place match comes before the final");
    } else if (round > 1) {
      // participants come from the correct feeder matches, never another path
      assert.equal(Number(m.p1_id), winners.get(`${round - 1}-${i * 2}`));
      assert.equal(Number(m.p2_id), winners.get(`${round - 1}-${i * 2 + 1}`));
    }
    const side = (i % 2 === 0 ? 1 : 2) as 1 | 2;
    const res = await ko.declareWinner(tid, matchId, side);
    played++;
    winners.set(`${round}-${i}`, res.winnerId);
    const loser = Number(side === 1 ? m.p2_id : m.p1_id);
    losers.set(`${round}-${i}`, loser);
    // semi-final losers stay in for the 3rd-place match; everyone else is out
    assert.equal((await q("SELECT state FROM ko_participants WHERE id=?", [loser]))[0].state, round === 3 ? "in_knockout" : "eliminated");
    assert.equal(res.champion, round === 4 && i === 0);
    const luid = (await q("SELECT kick_user_id FROM ko_participants WHERE id=?", [loser]))[0].kick_user_id;
    const finished = (await ko.getKoById(tid))!.status === "finished";
    assert.equal((await join_(String(luid))).outcome, finished ? "no_tournament" : round === 3 ? "locked_in_bracket" : "eliminated"); // can't rejoin or reroll
    await rejects(ko.declareWinner(tid, matchId, 1), finished ? "ko_finished" : "battle_not_live"); // no double result
  }
  assert.equal(played, 16); // 8 + 4 + 2 + 3rd-place + final
  const [tt] = await q("SELECT status, champion_id, runner_up_id, third_id FROM ko_tournaments WHERE id=?", [tid]);
  assert.equal(tt.status, "finished");
  assert.equal(Number(tt.champion_id), winners.get("4-0"));
  assert.equal(Number(tt.runner_up_id), losers.get("4-0"));
  assert.equal(Number(tt.third_id), winners.get("4-1"));
  // podium prizes recorded as pending awards with their amounts
  const awards = await q("SELECT place, amount, status FROM prize_awards WHERE source='tournament' AND source_ref LIKE ? ORDER BY place", [`ko:${tid}:%`]);
  assert.deepEqual(awards.map((a) => [Number(a.place), String(a.amount), a.status]), [[1, "300.00", "pending"], [2, "150.00", "pending"], [3, "50.00", "pending"]]);
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

t("Stake catalogue: feed parsed, popular first, only-on-Stake flag, art from Stake, hunt uses server data", async () => {
  const res = await cat.searchCatalog("gates olympus");
  assert.equal(res[0].name, "Gates of Olympus");
  assert.equal(res[0].provider, "Pragmatic Play");
  assert.ok(res[0].imageUrl?.startsWith("https://mediumrare.imgix.net/"));
  assert.equal((await cat.searchCatalog("wanted"))[0].name, "Wanted Dead or a Wild"); // most played first
  const soul = (await cat.searchCatalog("soul strings"))[0];
  assert.deepEqual([soul.name, soul.provider, soul.onlyOnStake], ["Soul Strings", "Glass Cannon", true]);
  assert.equal((await cat.searchCatalog("no art"))[0].imageUrl, null);
  const stats = await cat.getCatalogStats();
  assert.equal(stats.total, 606);
  assert.equal(stats.onlyOnStake, 1);
  assert.equal(stats.pool, 604); // top-1000 with art (no-art and rank 5000 excluded)
  const hid = await hunt.createHunt({ title: "H", start_balance: "100", image_url: "" });
  await hunt.addHuntEntryFromCatalog(hid, "stake/gates-of-olympus", "2");
  const [e] = await q("SELECT slot_id, slot_name, provider, image_url FROM bonus_hunt_entries WHERE hunt_id=?", [hid]);
  assert.deepEqual([e.slot_id, e.slot_name, e.provider], ["stake/gates-of-olympus", "Gates of Olympus", "Pragmatic Play"]);
  assert.ok(String(e.image_url).startsWith("https://mediumrare.imgix.net/"));
  await rejects(hunt.addHuntEntryFromCatalog(hid, "nope/nope", "1"), "slot_not_found");
  // a feed that's suspiciously small is refused (catalogue kept)
  await rejects(cat.importStakeCatalog(cat.parseStakeFeed({ slots: [[1, "x", 0, "x", "", 0, 0, 0, null, null, 1]] })), "slot_api_failed");
  assert.equal((await cat.getCatalogStats()).total, 606);
});

t("!join <slot name>: viewer picks the slot; unknown names kept as typed without art; repeat changes it", async () => {
  // typed names resolve against the catalogue (typo-tolerant) or stay as typed
  const hit = await cat.findSlotByName(" gates olympus ");
  assert.deepEqual([hit?.matched, hit?.name, hit?.provider], [true, "Gates of Olympus", "Pragmatic Play"]);
  assert.ok(hit?.imageUrl.startsWith("https://mediumrare.imgix.net/"));
  assert.equal((await cat.findSlotByName("wanted"))?.name, "Wanted Dead or a Wild"); // near-equal matches → most played
  assert.equal((await cat.findSlotByName("Soul Strings"))?.provider, "Glass Cannon"); // Stake exclusive with art
  // too far to be sure → kept as typed, never swapped for a different game
  const typo = await cat.findSlotByName("gatez of olympos");
  assert.deepEqual([typo?.matched, typo?.name], [false, "gatez of olympos"]);
  // close typo of the whole name still matches
  assert.equal((await cat.findSlotByName("gates of olympuss"))?.name, "Gates of Olympus");
  const unknown = await cat.findSlotByName("Fist of Demolition [emote:37226:KEKW]");
  assert.deepEqual([unknown?.matched, unknown?.name, unknown?.provider, unknown?.imageUrl], [false, "Fist of Demolition", "", ""]);
  assert.equal(await cat.findSlotByName("   "), null);
  assert.equal(await cat.findSlotByName("[emote:1:x]"), null);

  await q("UPDATE ko_tournaments SET status='cancelled' WHERE status IN ('open','closed')"); // isolate from earlier tests
  const id = await ko.createKo({ title: "Pick", prize: "" });
  await ko.openRegistration(id);
  const j = (uid: string, slot: Awaited<ReturnType<typeof cat.findSlotByName>>) =>
    common.withTx((c) => ko.recordJoin(c, { kickUserId: uid, username: `u${uid}`, messageId: `p${++msg}`, slot }));
  const r1 = await j("pick1", hit);
  assert.deepEqual([r1.outcome, r1.slot], ["registered", "Gates of Olympus"]);
  const r2 = await j("pick1", unknown); // repeat with another name → changes to that slot
  assert.deepEqual([r2.outcome, r2.slot], ["rerolled", "Fist of Demolition"]);
  const [row] = await q("SELECT slot_name, slot_provider, slot_image FROM ko_participants WHERE tournament_id=? AND kick_user_id='pick1'", [id]);
  assert.deepEqual([row.slot_name, row.slot_provider, row.slot_image], ["Fist of Demolition", "", ""]);
  const r3 = await j("pick2", null); // bare !join → random verified slot
  assert.equal(r3.outcome, "registered");
  const [row2] = await q("SELECT slot_image FROM ko_participants WHERE tournament_id=? AND kick_user_id='pick2'", [id]);
  assert.ok(String(row2.slot_image).startsWith("https://"));
  assert.equal((await q("SELECT COUNT(*) n FROM ko_participants WHERE tournament_id=?", [id]))[0].n, 2);
  await ko.resetKo(id);
});

t("prize ledger: pending until confirmed; only paid awards count; idempotent; void/undo", async () => {
  const prizes = await import("../lib/prizes");
  const before = await prizes.getPaidTotal();
  await common.withTx((c) => prizes.recordAward(c, { source: "giveaway", sourceRef: "gw:test-1", title: "Stream GW", winner: "lucky", prizeLabel: "$20 tip" }));
  await common.withTx((c) => prizes.recordAward(c, { source: "giveaway", sourceRef: "gw:test-1", title: "dup", winner: "x" })); // same ref → ignored
  const [a] = await q("SELECT id, amount, status FROM prize_awards WHERE source_ref='gw:test-1'");
  assert.deepEqual([String(a.amount), a.status], ["20.00", "pending"]);
  assert.equal((await q("SELECT COUNT(*) n FROM prize_awards WHERE source_ref='gw:test-1'"))[0].n, 1);
  assert.equal(await prizes.getPaidTotal(), before); // pending doesn't count
  await prizes.confirmPaid(Number(a.id), "20", "tx 123");
  assert.equal(await prizes.getPaidTotal(), before + 20);
  await rejects(prizes.confirmPaid(Number(a.id), "20", ""), "award_not_pending");
  assert.ok((await prizes.getPublicAwards()).awards.some((x) => x.winner === "lucky"));
  await prizes.reopenAward(Number(a.id));
  await prizes.voidAward(Number(a.id), "rerolled");
  assert.equal(await prizes.getPaidTotal(), before);
});
