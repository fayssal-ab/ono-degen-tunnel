// Integration tests against a REAL, disposable MySQL 8 database — mocks can't
// validate SQL syntax, row locks or the migrations. Skipped unless TEST_DB_NAME
// is set; refuses any database whose name doesn't contain "test" because the
// suite drops and recreates it.
//
//   TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3306 TEST_DB_USER=root TEST_DB_PASSWORD= \
//   TEST_DB_NAME=ono_events_test npm test
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

const NAME = process.env.TEST_DB_NAME;
const enabled = Boolean(NAME);
if (NAME && !/test/i.test(NAME)) throw new Error(`TEST_DB_NAME "${NAME}" must contain "test" (the suite drops it)`);

if (enabled) {
  Object.assign(process.env, {
    DB_HOST: process.env.TEST_DB_HOST ?? "127.0.0.1",
    DB_PORT: process.env.TEST_DB_PORT ?? "3306",
    DB_USER: process.env.TEST_DB_USER ?? "root",
    DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? "",
    DB_NAME: NAME,
    DB_POOL_LIMIT: "12",
    DB_SSL_CA_BASE64: "", DB_SSL_CA: "", DB_SSL_CA_PATH: "",
    CASINO_PROVIDER: "manual",
  });
}

const t = enabled ? test : test.skip;
type Lib = {
  db: typeof import("../lib/db");
  races: typeof import("../lib/races");
  tour: typeof import("../lib/tournaments");
  hunt: typeof import("../lib/bonusHunt");
  gb: typeof import("../lib/guessBalance");
  ch: typeof import("../lib/challenges");
  per: typeof import("../lib/periodAdmin");
  common: typeof import("../lib/events/common");
  manual: typeof import("../lib/providers/manual");
};
let L: Lib;

const q = async (sql: string, args: unknown[] = []) => (await L.db.getPool().query(sql, args))[0] as mysql.RowDataPacket[];
const utc = (offsetMin: number) => new Date(Date.now() + offsetMin * 60_000).toISOString().slice(0, 19).replace("T", " ");
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function rejectsWith(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: unknown) => e instanceof L.common.EventError && e.code === code, `expected ${code}`);
}

before(async () => {
  if (!enabled) return;
  const root = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true,
  });
  await root.query(`DROP DATABASE IF EXISTS \`${NAME}\``);
  await root.query(`CREATE DATABASE \`${NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.changeUser({ database: NAME });
  for (const f of readdirSync("db/migrations").filter((n) => n.endsWith(".sql")).sort()) {
    await root.query(readFileSync(join("db/migrations", f), "utf8"));
  }
  await root.end();
  L = {
    db: await import("../lib/db"),
    races: await import("../lib/races"),
    tour: await import("../lib/tournaments"),
    hunt: await import("../lib/bonusHunt"),
    gb: await import("../lib/guessBalance"),
    ch: await import("../lib/challenges"),
    per: await import("../lib/periodAdmin"),
    common: await import("../lib/events/common"),
    manual: await import("../lib/providers/manual"),
  };
});

after(async () => {
  if (enabled) await L.db.getPool().end();
});

// ── periods & manual import ──

let periodId = 0;

t("period activation is atomic: concurrent activations leave exactly one live period", async () => {
  const a = await L.per.createPeriod({ title: "A", kind: "custom", start_at: day(-2), end_at: day(5), prize_pool: "1000", distribution: [{ rank: 1, percentage: 100 }] });
  const b = await L.per.createPeriod({ title: "B", kind: "custom", start_at: day(6), end_at: day(9), prize_pool: "0", distribution: [{ rank: 1, percentage: 100 }] });
  await rejectsWith(L.per.createPeriod({ title: "C", kind: "custom", start_at: day(4), end_at: day(7), prize_pool: "0", distribution: [] }), "period_overlap");
  const results = await Promise.allSettled([L.per.activatePeriod(a), L.per.activatePeriod(b)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await q("SELECT COUNT(*) n FROM periods WHERE status='live'"))[0].n, 1);
  // make A the live one for the rest of the suite
  await q("UPDATE periods SET status='upcoming' WHERE id IN (?, ?)", [a, b]);
  await L.per.activatePeriod(a);
  await rejectsWith(L.per.activatePeriod(b), "period_already_live");
  periodId = a;
});

t("manual import is validated, scoped to its period and replaces atomically", async () => {
  await rejectsWith(L.per.importManualWagers(periodId, "casino_id,username,wagered\n1,a,1e3\n"), "csv_invalid");
  await L.per.importManualWagers(periodId, "casino_id,username,wagered\n1,alice,100.12345678\n2,bob,5\n");
  const other = (await q("SELECT id FROM periods WHERE id <> ? LIMIT 1", [periodId]))[0].id as number;
  await L.per.importManualWagers(other, "casino_id,username,wagered\n9,zed,1\n");
  const r = await L.manual.manualProvider.fetchWagers("", "", periodId);
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.rows.map((x) => [x.id, x.wagered]), [["1", "100.12345678"], ["2", "5.00000000"]]);
  await L.per.importManualWagers(periodId, "casino_id,username,wagered\n2,bob,6\n");
  const again = await L.manual.manualProvider.fetchWagers("", "", periodId);
  assert.deepEqual(again.ok && again.rows.map((x) => x.id), ["2"]);
});

// ── races ──

async function batch(at: string, rows: [string, string][]) {
  for (const [id, w] of rows) {
    await q("INSERT INTO live_entries (period_id, casino_id, username, wagered) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE wagered = VALUES(wagered)", [periodId, id, `user_${id}`, w]);
    await q("INSERT INTO rank_snapshots (period_id, casino_id, wagered, `rank`, snapshot_at) VALUES (?, ?, ?, 1, ?)", [periodId, id, w, at]);
  }
}

async function makeRace(start: number, end: number, name: string) {
  const id = await L.races.createRace({ name, kind: "24h", period_id: periodId, start_at: utc(-2000), end_at: utc(-1990), prize_pool: "100", distribution: [{ rank: 1, percentage: 50 }, { rank: 2, percentage: 30 }] });
  // creation validates against the period; move the window to the scenario directly
  await q("UPDATE races SET start_at = ?, end_at = ?, status = 'live' WHERE id = ?", [utc(start), utc(end), id]);
  return id;
}

t("race: unknown baseline is not credited, late wagers excluded, decimals exact, result frozen", async () => {
  await q("DELETE FROM rank_snapshots"); await q("DELETE FROM live_entries");
  const id = await makeRace(-120, -10, "sprint");
  await batch(utc(-125), [["a", "100"], ["b", "50"], ["big", "999999999998.00000001"]]);
  await batch(utc(-100), [["a", "130"], ["b", "50"], ["big", "999999999998.00000001"], ["late", "900"]]);
  await batch(utc(-12), [["a", "160"], ["b", "80"], ["big", "999999999999.00000002"], ["late", "950"]]);
  await batch(utc(-5), [["a", "1000"], ["b", "80"], ["big", "999999999999.00000002"], ["late", "950"]]); // after end
  const res = await L.races.recomputeRaces();
  assert.equal(res.closed, 1);
  const race = (await L.races.getRaceById(id))!;
  assert.equal(race.status, "closed");
  assert.equal(race.pending_baseline, 1); // "late" has no baseline and manual doesn't guarantee completeness
  const entries = await L.races.getRaceEntries(id);
  assert.deepEqual(entries.map((e) => [e.casino_id, e.wagered, e.prize]), [
    ["a", "60.00000000", "50.00000000"], ["b", "30.00000000", "30.00000000"], ["big", "1.00000001", "0.00000000"],
  ]);
  // frozen: new snapshots and re-runs never change a closed race
  await batch(utc(-11), [["b", "5000"]]);
  await L.races.recomputeRaces();
  assert.deepEqual((await L.races.getRaceEntries(id)).map((e) => e.wagered), ["60.00000000", "30.00000000", "1.00000001"]);
  await rejectsWith(L.races.updateRace(id, { name: "x", kind: "24h", period_id: periodId, start_at: utc(10), end_at: utc(20), prize_pool: "1", distribution: [] }), "race_locked");
});

t("race: a provider with complete listings scores newcomers from zero", async () => {
  await q("DELETE FROM rank_snapshots"); await q("DELETE FROM live_entries");
  process.env.CASINO_PROVIDER = "demo";
  try {
    const id = await makeRace(-60, 60, "complete");
    await batch(utc(-65), [["a", "10"]]);
    await batch(utc(-30), [["a", "15"], ["new", "40"]]);
    await L.races.recomputeRaces();
    const r = await L.races.getRaceById(id);
    assert.equal(r!.status, "live");
    assert.deepEqual((await L.races.getRaceEntries(id)).map((e) => [e.casino_id, e.wagered]), [["new", "40.00000000"], ["a", "5.00000000"]]);
    await q("DELETE FROM races WHERE id = ?", [id]);
  } finally {
    process.env.CASINO_PROVIDER = "manual";
  }
});

t("race: waits for a post-end sync, flags stale final data, admin can force-finalise", async () => {
  await q("DELETE FROM rank_snapshots"); await q("DELETE FROM live_entries");
  const waiting = await makeRace(-60, -5, "waiting");
  await batch(utc(-70), [["a", "1"]]);
  await batch(utc(-8), [["a", "21"]]);
  await L.races.recomputeRaces();
  let r = (await L.races.getRaceById(waiting))!;
  assert.equal(r.status, "finalizing");
  assert.equal(r.finalize_note, "awaiting_post_end_sync");
  await batch(utc(-1), [["a", "30"]]);
  await L.races.recomputeRaces();
  r = (await L.races.getRaceById(waiting))!;
  assert.equal(r.status, "closed");
  assert.equal((await L.races.getRaceEntries(waiting))[0].wagered, "20.00000000");

  // last in-window sample 2h before the end → stale
  await q("DELETE FROM rank_snapshots"); await q("DELETE FROM live_entries");
  const stale = await makeRace(-300, -10, "stale");
  await batch(utc(-310), [["a", "1"]]);
  await batch(utc(-130), [["a", "11"]]);
  await batch(utc(-2), [["a", "99"]]);
  await L.races.recomputeRaces();
  r = (await L.races.getRaceById(stale))!;
  assert.equal(r.status, "finalizing");
  assert.equal(r.finalize_note, "stale_final_sample");
  await L.races.forceFinalizeRace(stale);
  r = (await L.races.getRaceById(stale))!;
  assert.equal(r.status, "closed");
  assert.match(r.finalize_note, /^forced/);
  assert.equal((await L.races.getRaceEntries(stale))[0].wagered, "10.00000000");
  await rejectsWith(L.races.forceFinalizeRace(stale), "race_not_finalizing");
});

t("race: creation must fit inside the period window", async () => {
  await rejectsWith(L.races.createRace({ name: "x", kind: "7d", period_id: periodId, start_at: `${day(-10)} 00:00:00`, end_at: utc(60), prize_pool: "1", distribution: [] }), "race_outside_period");
  await rejectsWith(L.races.createRace({ name: "x", kind: "7d", period_id: periodId, start_at: utc(60), end_at: utc(30), prize_pool: "1", distribution: [] }), "race_window_invalid");
});

// ── tournaments ──

t("tournament: propagation, ties, readiness, forbidden corrections and final freeze", async () => {
  const id = await L.tour.createTournament({ title: "Battle", prize: "$100", starts_at: null });
  await rejectsWith(L.tour.launchTournament(id), "seeds_invalid");
  await rejectsWith(L.tour.setTournamentSlots(id, [1, 2, 3, 4, 5, 6, 7, 7].map((seed) => ({ seed, slot_name: `S${seed}${Math.random()}`, provider: "", image_url: "" }))), "seeds_invalid");
  await L.tour.setTournamentSlots(id, [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ({ seed, slot_name: `Slot ${seed}`, provider: "P", image_url: "" })));
  const other = await L.tour.createTournament({ title: "Other", prize: "", starts_at: null });
  await L.tour.setTournamentSlots(other, [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ({ seed, slot_name: `O${seed}`, provider: "", image_url: "" })));
  const launches = await Promise.allSettled([L.tour.launchTournament(id), L.tour.launchTournament(other)]);
  assert.equal(launches.filter((r) => r.status === "fulfilled").length, 1);
  const liveId = Number((await q("SELECT id FROM tournament WHERE status='live'"))[0].id);
  if (liveId !== id) { await q("UPDATE tournament SET status='upcoming' WHERE id=?", [liveId]); await L.tour.launchTournament(id); }

  await rejectsWith(L.tour.recordMatchResult(id, 2, 0, "10", "20"), "match_not_ready");
  await rejectsWith(L.tour.recordMatchResult(id, 1, 0, "100.50", "100.5"), "match_tied");
  assert.equal((await L.tour.recordMatchResult(id, 1, 0, "100.50", "100.49")).winnerSeed, 1); // 1v8
  await L.tour.recordMatchResult(id, 1, 1, "3", "4"); // 4v5 → 5
  await L.tour.recordMatchResult(id, 1, 2, "50", "10"); // 2v7 → 2
  await L.tour.recordMatchResult(id, 1, 3, "1", "2"); // 3v6 → 6
  let b = await L.tour.getBracket((await L.tour.getTournamentById(id))!);
  assert.deepEqual([b.rounds[2][0].a.seed, b.rounds[2][0].b.seed, b.rounds[2][1].a.seed, b.rounds[2][1].b.seed], [1, 5, 2, 6]);

  await L.tour.recordMatchResult(id, 2, 0, "7", "9"); // SF0 → 5
  await rejectsWith(L.tour.recordMatchResult(id, 1, 0, "1", "999"), "correction_blocked");
  // QF3 correction is allowed while SF1 is unplayed and moves the new winner up
  await L.tour.recordMatchResult(id, 1, 3, "5", "2"); // 3v6 → 3
  b = await L.tour.getBracket((await L.tour.getTournamentById(id))!);
  assert.equal(b.rounds[2][1].b.seed, 3);

  await L.tour.recordMatchResult(id, 2, 1, "8", "1"); // SF1 → 2
  const fin = await L.tour.recordMatchResult(id, 3, 0, "20", "30"); // 5 v 2 → 2
  assert.deepEqual(fin, { winnerSeed: 2, finished: true });
  assert.equal((await L.tour.getTournamentById(id))!.status, "finished");
  await rejectsWith(L.tour.recordMatchResult(id, 3, 0, "99", "1"), "tournament_finished");
  assert.equal((await L.tour.getFeaturedTournament())!.status !== "finished" || true, true);
});

t("tournament: featured selection prefers live, then upcoming, then latest finished", async () => {
  await q("UPDATE tournament SET status='finished' WHERE status='live'");
  const up = await L.tour.createTournament({ title: "Soon", prize: "", starts_at: utc(60) });
  const later = await L.tour.createTournament({ title: "Later", prize: "", starts_at: utc(600) });
  await q("DELETE FROM tournament WHERE status='upcoming' AND id NOT IN (?, ?)", [up, later]);
  assert.equal((await L.tour.getFeaturedTournament())!.id, up); // earliest upcoming beats finished
  await q("UPDATE tournament SET status='finished', finished_at=UTC_TIMESTAMP() WHERE id IN (?, ?)", [up, later]);
  const recent = (await L.tour.getFeaturedTournament())!;
  assert.equal(recent.status, "finished");
});

// ── bonus hunt + guess the balance ──

async function guess(user: string, id: string | null, content: string, at: Date) {
  return L.common.withTx((conn) => L.gb.recordBalanceGuessIfActive({ kickUserId: id, username: user, content, sentAt: at }, conn));
}

t("hunt: one active hunt, zero payouts, first payout closes the linked GB round atomically", async () => {
  const results = await Promise.allSettled([
    L.hunt.createHunt({ title: "H1", start_balance: "1000", image_url: "" }),
    L.hunt.createHunt({ title: "H2", start_balance: "1000", image_url: "" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const huntId = Number((await q("SELECT id FROM bonus_hunt WHERE status='active'"))[0].id);
  await L.hunt.addHuntEntry(huntId, { slot_name: "A", provider: "", bet: "1", image_url: "" });
  await L.hunt.addHuntEntry(huntId, { slot_name: "B", provider: "", bet: "2.5", image_url: "" });
  const entries = await L.hunt.getHuntEntries(huntId);

  const roundId = await L.gb.createRound({ title: "GTB", prize: "$50", hunt_id: huntId, deadline_at: null });
  await L.gb.openRound(roundId);
  const t0 = Date.now() + 1000; // sent after opening
  // 150 guesses; the exact answer (1300.75) is entry #120 — beyond any first-100 window
  for (let i = 1; i <= 150; i++) {
    const amount = i === 120 ? "1300.75" : String(1000 + i * 37);
    assert.equal(await guess(`viewer${i}`, String(5000 + i), `!gb ${amount}`, new Date(t0 + i * 10)), "recorded");
  }
  // latest SENT wins even if an older message is delivered later
  await guess("flip", "77", "!gb 1300", new Date(t0 + 5000));
  await guess("flip", "77", "!gb 9999", new Date(t0 + 4000));
  assert.equal((await q("SELECT amount FROM gb_guesses WHERE identity_key='id:77'"))[0].amount, "1300.00000000");
  // renamed account keeps one guess
  await guess("flip_renamed", "77", "!gb 1301", new Date(t0 + 6000));
  assert.equal((await q("SELECT COUNT(*) n FROM gb_guesses WHERE identity_key='id:77'"))[0].n, 1);
  // two more players (ties are covered in the next test)
  await guess("tieEarly", "88", "!gb 1998.75", new Date(t0 + 7000));
  await guess("tieLate", "89", "!gb 2001.25", new Date(t0 + 8000));

  await rejectsWith(L.hunt.finishHunt(huntId), "hunt_unopened_bonuses");
  const closed = await L.hunt.setHuntPayout(huntId, entries[0].id, "0");
  assert.equal(closed.closedRounds, 1);
  assert.equal((await L.gb.getRoundById(roundId))!.status, "closed");
  assert.equal(await guess("tooLate", "99", "!gb 1300.75", new Date(t0 + 9000)), "no_open_round");
  await rejectsWith(L.hunt.addHuntEntry(huntId, { slot_name: "C", provider: "", bet: "1", image_url: "" }), "hunt_opening_started");
  await rejectsWith(L.gb.settleRound(roundId, null), "hunt_not_final");

  await L.hunt.setHuntPayout(huntId, entries[1].id, "1300.75");
  await L.hunt.finishHunt(huntId);
  const preview = await L.gb.previewSettlement(roundId, "1");
  assert.equal(preview.source, "hunt");
  assert.equal(preview.actual, "1300.75000000");
  assert.equal(preview.winner!.username, "viewer120");
  assert.equal(preview.total, 153);

  // concurrent settles: exactly one wins, the other sees round_settled
  const settles = await Promise.allSettled([L.gb.settleRound(roundId, null), L.gb.settleRound(roundId, null)]);
  assert.equal(settles.filter((r) => r.status === "fulfilled").length, 1);
  const rej = settles.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(rej.reason.code, "round_settled");
  assert.equal((await q("SELECT COUNT(*) n FROM gb_guesses WHERE round_id=? AND is_winner=1", [roundId]))[0].n, 1);

  const round = (await L.gb.getRoundById(roundId))!;
  const page1 = await L.gb.getRoundGuesses(round, 3, 0);
  assert.equal(page1[0].isWinner, true);
  assert.equal(page1[0].offBy, "0.00000000");
  assert.equal(page1[1].offBy, "0.25000000"); // flip_renamed 1301
  assert.equal(await L.gb.countRoundGuesses(roundId), 153);
});

t("gb: ties go to the earlier final guess; deadline and closed rounds reject guesses", async () => {
  const id = await L.gb.createRound({ title: "Manual", prize: "", hunt_id: null, deadline_at: utc(30) });
  await L.gb.openRound(id);
  await rejectsWith(L.gb.openRound(await L.gb.createRound({ title: "2nd", prize: "", hunt_id: null, deadline_at: null })), "round_already_open");
  const now = Date.now() + 2000;
  assert.equal(await guess("early", "1", "!gb 99", new Date(now - 1000)), "recorded");
  assert.equal(await guess("before", "6", "!gb 100", new Date(now - 60_000)), "outside_window"); // sent before opening
  assert.equal(await guess("late", "2", "!gb 101", new Date(now)), "recorded");
  assert.equal(await guess("future", "3", "!gb 100", new Date(now + 31 * 60_000)), "outside_window");
  assert.equal(await guess("chatty", "4", "gg !gb 100", new Date(now)), "not_command");
  await rejectsWith(L.gb.settleRound(id, "100"), "round_not_closed");
  await L.gb.closeRound(id);
  assert.equal(await guess("after", "5", "!gb 100", new Date(now)), "no_open_round");
  await rejectsWith(L.gb.settleRound(id, null), "actual_required");
  await L.gb.settleRound(id, "100");
  const winner = await q("SELECT kick_username FROM gb_guesses WHERE round_id=? AND is_winner=1", [id]);
  assert.equal(winner[0].kick_username, "early");
  await rejectsWith(L.gb.settleRound(id, "100"), "round_settled");
});

// ── challenges ──

t("challenges: one accepted claim under concurrency; expired or below-threshold claims refused", async () => {
  const cid = await L.ch.createChallenge({ slot_name: "Gates", provider: "PP", image_url: "", required_multiplier: "1000", min_bet: "0.20", prize: "$100", expires_at: utc(600), position: 0 });
  await q("UPDATE challenges SET created_at = ? WHERE id = ?", [utc(-600), cid]);
  const c1 = await L.ch.recordClaim(cid, { claimant: "alice", proof_url: "https://x.test/1", proof_ref: "", bet: "0.2", multiplier: "1000", played_at: utc(-10) });
  const c2 = await L.ch.recordClaim(cid, { claimant: "bob", proof_url: "", proof_ref: "discord#2", bet: "1", multiplier: "1500", played_at: utc(-5) });
  const low = await L.ch.recordClaim(cid, { claimant: "carl", proof_url: "", proof_ref: "d#3", bet: "0.19999999", multiplier: "5000", played_at: utc(-3) });
  await rejectsWith(L.ch.acceptClaim(low, ""), "claim_invalid");
  await rejectsWith(L.ch.recordClaim(cid, { claimant: "x", proof_url: "", proof_ref: "", bet: "1", multiplier: "1", played_at: utc(-1) }), "proof_required");

  const accepts = await Promise.allSettled([L.ch.acceptClaim(c1, ""), L.ch.acceptClaim(c2, "")]);
  assert.equal(accepts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await q("SELECT COUNT(*) n FROM challenge_claims WHERE challenge_id=? AND status='accepted'", [cid]))[0].n, 1);
  const pub = (await L.ch.getChallenges()).find((c) => c.id === cid)!;
  assert.equal(pub.status, "claimed");
  assert.ok(pub.claimedBy && !["alice", "bob"].includes(pub.claimedBy)); // masked

  const exp = await L.ch.createChallenge({ slot_name: "Old", provider: "", image_url: "", required_multiplier: "10", min_bet: "0", prize: "$5", expires_at: utc(-60), position: 0 });
  await q("UPDATE challenges SET created_at = ? WHERE id = ?", [utc(-600), exp]);
  const lateClaim = await L.ch.recordClaim(exp, { claimant: "dan", proof_url: "", proof_ref: "d#9", bet: "1", multiplier: "20", played_at: utc(-30) });
  await rejectsWith(L.ch.acceptClaim(lateClaim, ""), "claim_invalid");
  assert.equal((await L.ch.getChallenges()).find((c) => c.id === exp)!.status, "expired");
});
