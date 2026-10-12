import test from "node:test";
import assert from "node:assert/strict";
import { parseGbCommand, identityKey } from "../lib/guessBalance";
import { computeStandings } from "../lib/races";
import { claimProblems } from "../lib/challenges";
import { parseWagerCsv, checkPeriodInput, validDate } from "../lib/periodAdmin";
import { parseDistribution, parseForm, zUtcDateTime, zMoney, EventError } from "../lib/events/common";
import { isConfiguredBroadcaster, messageSentAt } from "../lib/kickEvents";
import { computeHuntStats } from "../lib/bonusHunt";
import { z } from "zod";

test("!gb parser accepts only a complete, bounded, plain decimal command", () => {
  assert.equal(parseGbCommand("!gb 25000"), "25000");
  assert.equal(parseGbCommand("  !GB $1,234,567.12345678  "), "1234567.12345678");
  assert.equal(parseGbCommand("!gb 007.5"), "7.5");
  assert.equal(parseGbCommand("!gb 0"), "0");
  assert.equal(parseGbCommand("!gb 999999999999.99999999"), "999999999999.99999999");
  for (const bad of ["!gb 1e5", "!gb 100k", "!gb 100 lol", "!gb -5", "!gb Infinity", "!gb NaN", "!gb 1000000000000",
    "!gb 1.123456789", "!gb 1,23", "!gb 12,3456", "!gb", "hey !gb 5", "!gb5", "!gb 0x10", "!gb 1.5.2"]) {
    assert.equal(parseGbCommand(bad), null, bad);
  }
  assert.equal(identityKey("123", "Bob"), "id:123");
  assert.equal(identityKey(null, "Bob"), "name:bob");
});

test("race standings: unknown baseline is held back unless the provider guarantees complete listings", () => {
  const baseline = new Map([["a", "100"], ["b", "50"]]);
  const current = [
    { casino_id: "a", username: "a", wagered: "160" },
    { casino_id: "b", username: "b", wagered: "50" },
    { casino_id: "late", username: "late", wagered: "5000" }, // absent from baseline
  ];
  const strict = computeStandings({ baseline, current, baselineComplete: false });
  assert.deepEqual(strict.standings.map((s) => [s.casino_id, s.wagered]), [["a", "60.00000000"]]);
  assert.equal(strict.pending, 1);
  const full = computeStandings({ baseline, current, baselineComplete: true });
  assert.deepEqual(full.standings.map((s) => s.casino_id), ["late", "a"]);
  assert.equal(full.pending, 0);
});

test("race standings keep DECIMAL(20,8) precision and break ties deterministically", () => {
  const r = computeStandings({
    baseline: new Map([["x", "0"], ["y", "0"], ["z", "0"], ["w", "0"]]),
    current: [
      { casino_id: "x", username: "x", wagered: "999999999999.00000001" },
      { casino_id: "y", username: "y", wagered: "999999999999.00000002" },
      { casino_id: "w", username: "w", wagered: "10" },
      { casino_id: "z", username: "z", wagered: "10" },
    ],
    baselineComplete: false,
  });
  assert.deepEqual(r.standings.map((s) => s.casino_id), ["y", "x", "w", "z"]);
  // a decreasing cumulative (provider correction) never yields a negative score
  const neg = computeStandings({ baseline: new Map([["a", "100"]]), current: [{ casino_id: "a", username: "a", wagered: "90" }], baselineComplete: false });
  assert.equal(neg.standings.length, 0);
});

test("challenge claim checks thresholds in decimal and the play time window", () => {
  const c = { required_multiplier: "1000.00", min_bet: "0.20000000", created_at: "2026-10-01 00:00:00", expires_at: "2026-10-10 00:00:00" };
  assert.deepEqual(claimProblems(c, { bet: "0.2", multiplier: "1000", played_at: "2026-10-05 12:00:00" }), []);
  assert.equal(claimProblems(c, { bet: "0.19999999", multiplier: "1000", played_at: "2026-10-05 12:00:00" }).length, 1);
  assert.equal(claimProblems(c, { bet: "1", multiplier: "999.99", played_at: "2026-10-05 12:00:00" }).length, 1);
  assert.match(claimProblems(c, { bet: "1", multiplier: "2000", played_at: "2026-10-10 00:00:01" })[0], /expired/);
  assert.match(claimProblems(c, { bet: "1", multiplier: "2000", played_at: "2026-09-30 23:59:59" })[0], /before/);
});

test("prize distribution: positive shares, ≤ 100% total", () => {
  assert.deepEqual(parseDistribution("50, 30,20"), [{ rank: 1, percentage: 50 }, { rank: 2, percentage: 30 }, { rank: 3, percentage: 20 }]);
  assert.equal(parseDistribution("60.5").length, 1);
  for (const bad of ["", "50,60", "0,10", "-5", "abc", "10.123"]) assert.throws(() => parseDistribution(bad), EventError, bad);
});

test("manual CSV import reports every bad line and refuses duplicates", () => {
  const csv = "username,casino_id,wagered\nalice,1,100.5\nbob,2,1e5\n,3,1\ncarl,1,5\n\"d, jr\",4,0\neve,5,1000000000000\n";
  const r = parseWagerCsv(csv);
  assert.deepEqual(r.rows.map((x) => x.casino_id), ["1", "4"]);
  assert.equal(r.rows[1].username, "d, jr");
  assert.deepEqual(r.errors.map((e) => e.line), [3, 4, 5, 7]);
  assert.equal(r.total, "100.50");
  assert.equal(parseWagerCsv("id,name\n1,a").errors[0].line, 1);
});

test("period input validation", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  const ok = { title: "x", kind: "monthly" as const, start_at: "2026-10-01", end_at: "2026-10-31", prize_pool: "5000", distribution: [] };
  assert.doesNotThrow(() => checkPeriodInput(ok));
  assert.throws(() => checkPeriodInput({ ...ok, end_at: "2026-09-30" }), EventError);
  assert.throws(() => checkPeriodInput({ ...ok, end_at: "2027-03-01" }), EventError);
  assert.throws(() => checkPeriodInput({ ...ok, prize_pool: "1e3" }), EventError);
});

test("form parsing: UTC datetimes and bounded money", () => {
  assert.equal(zUtcDateTime.parse("2026-10-11T10:30"), "2026-10-11 10:30:00");
  assert.equal(zUtcDateTime.safeParse("2026-02-30T10:00").success, false);
  assert.equal(zMoney.safeParse("12345678901234").success, false);
  assert.throws(() => parseForm(z.object({ amount: zMoney }), { amount: "-1" }), (e: unknown) => e instanceof EventError && e.code === "invalid_input");
});

test("Kick events: broadcaster filter and signed message time", () => {
  assert.equal(isConfiguredBroadcaster({ user_id: 42, username: "x" }, { id: "42" }), true);
  assert.equal(isConfiguredBroadcaster({ user_id: 43, username: "onoefg" }, { id: "42" }), false);
  assert.equal(isConfiguredBroadcaster({ username: "OnoEFG" }, { channel: "onoefg" }), true);
  assert.equal(isConfiguredBroadcaster({ channel_slug: "other", username: "other" }, { channel: "onoefg" }), false);
  assert.equal(isConfiguredBroadcaster(null, { channel: "onoefg" }), false);
  assert.equal(messageSentAt("2025-01-14T16:08:06Z", "x")?.toISOString(), "2025-01-14T16:08:06.000Z");
  assert.equal(messageSentAt(undefined, "2025-01-14T16:08:06.5+01:00")?.toISOString(), "2025-01-14T15:08:06.500Z");
  assert.equal(messageSentAt("yesterday", "garbage"), null);
});

test("hunt stats: zero payout counts as opened; final balance and profit conventions", () => {
  const e = (id: number, bet: string, payout: string | null) => ({ id, position: id, slot_name: `s${id}`, provider: null, image_url: null, bet, payout });
  const partial = computeHuntStats("1000", [e(1, "10", "0"), e(2, "10", null)]);
  assert.equal(partial.opened, 1);
  assert.equal(partial.remaining, 1);
  assert.equal(partial.finalBalance, null);
  assert.equal(partial.breakEvenX, 100);
  const done = computeHuntStats("1000", [e(1, "10", "0"), e(2, "10", "1200.10")]);
  assert.equal(done.complete, true);
  assert.equal(done.finalBalance, "1200.10");
  assert.equal(done.profit, "200.10");
  assert.equal(done.sumBets, "20.00");
});
