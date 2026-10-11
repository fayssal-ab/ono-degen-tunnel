import test from "node:test";
import assert from "node:assert/strict";
import { createAdminSession, verifyAdminSession } from "../lib/adminSession";
import { collectionOpen, entryEligible } from "../lib/giveawayRules";
import { entriesHash, winnerIndex } from "../lib/fair";

const now = Date.parse("2026-10-11T12:00:00Z");
test("admin sessions are unique, signed, expiring, and invalidated by password rotation", () => {
  const token = createAdminSession("test-password", now);
  assert.notEqual(token, createAdminSession("test-password", now));
  assert.equal(verifyAdminSession(token, "test-password", now), true);
  assert.equal(verifyAdminSession(token, "new-password", now), false);
  assert.equal(verifyAdminSession(token, "test-password", now + 7 * 86400000), false);
  assert.equal(verifyAdminSession(token.replace(/^\d+/, "999999999999"), "test-password", now), false);
  assert.equal(verifyAdminSession("bad.token", "test-password", now), false);
  assert.equal(verifyAdminSession(createAdminSession("", now), "", now), false);
});
test("giveaway deadlines use UTC, stop collection at expiry, and reject invalid dates", () => {
  assert.equal(collectionOpen({ status: "open", ends_at: "2026-10-11 12:00:01" }, now), true);
  assert.equal(collectionOpen({ status: "open", ends_at: "2026-10-11 12:00:00" }, now), false);
  assert.equal(collectionOpen({ status: "open", ends_at: "invalid" }, now), false);
  assert.equal(collectionOpen({ status: "closed" }, now), false);
  assert.equal(collectionOpen({ status: "open", drawn_entrants: ["alice"] }, now), false);
});
test("Active and subscription rules affect eligibility without deleting entrants", () => {
  const rules = { subscribers_only: true, min_messages: 2 };
  assert.equal(entryEligible({ excluded: false, is_subscriber: true, message_count: 2 }, rules), true);
  assert.equal(entryEligible({ excluded: false, is_subscriber: true, message_count: 1 }, rules), false);
  assert.equal(entryEligible({ excluded: false, is_subscriber: false, message_count: 5 }, rules), false);
  assert.equal(entryEligible({ excluded: true, is_subscriber: true, message_count: 5 }, rules), false);
});
test("repeat picks remain deterministic and verifiable for each nonce", () => {
  const hash = entriesHash(["alice"]);
  assert.equal(winnerIndex("seed", hash, 0, 1), 0);
  assert.equal(winnerIndex("seed", hash, 1, 1), 0);
  assert.equal(entriesHash(["Alice"]), hash);
});
