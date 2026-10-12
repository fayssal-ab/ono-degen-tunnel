import test from "node:test";
import assert from "node:assert/strict";
import { nextMatch, pickTwo, JOIN_RE } from "../lib/knockout";
import { normalizeName, scoreName, classifyThumb, cleanSlotRequest } from "../lib/slotCatalog";

test("bracket progression R16 → QF → SF → Final", () => {
  assert.deepEqual(nextMatch(1, 0), { round: 2, index: 0, side: 1 });
  assert.deepEqual(nextMatch(1, 1), { round: 2, index: 0, side: 2 });
  assert.deepEqual(nextMatch(1, 7), { round: 2, index: 3, side: 2 });
  assert.deepEqual(nextMatch(2, 2), { round: 3, index: 1, side: 1 });
  assert.deepEqual(nextMatch(3, 1), { round: 4, index: 0, side: 2 });
  assert.equal(nextMatch(4, 0), null);
});

test("roller picks two distinct players, uniformly", () => {
  assert.throws(() => pickTwo(1));
  const counts = new Map<string, number>();
  for (let i = 0; i < 30_000; i++) {
    const [a, b] = pickTwo(4);
    assert.notEqual(a, b);
    assert.ok(a >= 0 && a < 4 && b >= 0 && b < 4);
    const k = [a, b].sort().join("-");
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  assert.equal(counts.size, 6); // every pair possible
  for (const n of counts.values()) assert.ok(Math.abs(n - 5000) < 400, `pair frequency ${n}`); // ≈ uniform
  // deterministic check of the "skip a" mapping
  assert.deepEqual(pickTwo(5, (max) => (max === 5 ? 2 : 2)), [2, 3]);
  assert.deepEqual(pickTwo(5, (max) => (max === 5 ? 2 : 1)), [2, 1]);
});

test("!join starts the message; trailing text is ignored", () => {
  for (const ok of ["!join", "  !JOIN ", "!Join", "!join CLASH OF TITANS", "!join wanted"]) assert.ok(JOIN_RE.test(ok), ok);
  for (const bad of ["join", "!joinn", "!joined", "hey !join", "!jo in"]) assert.ok(!JOIN_RE.test(bad), bad);
});

test("slot search: normalisation and fuzzy ranking", () => {
  assert.equal(normalizeName("Sweet Bonanza® Xmas"), "sweet bonanza xmas");
  assert.equal(normalizeName("Rise of Olympus 100 – Mega"), "rise of olympus 100 mega");
  const names = ["gates of olympus", "gates of olympus 1000", "gates of olympus super scatter", "olympus rising", "sweet bonanza"];
  const rank = (q: string) => names.map((n) => ({ n, s: scoreName(normalizeName(q), n) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.n);
  assert.equal(rank("Gates of Olympus")[0], "gates of olympus");
  assert.equal(rank("gates olymp")[0], "gates of olympus");
  assert.equal(rank("gatez of olympos")[0], "gates of olympus"); // typo tolerant
  assert.deepEqual(rank("zzzz"), []);
});

test("thumbnail check rejects slot.report's placeholder", () => {
  assert.equal(classifyThumb({ status: 200, type: "image/webp", hash: "abc" }, "ph"), "real");
  assert.equal(classifyThumb({ status: 200, type: "image/webp", hash: "ph" }, "ph"), "missing");
  assert.equal(classifyThumb({ status: 404, type: "text/html", hash: "x" }, "ph"), "missing");
  assert.equal(classifyThumb({ status: 500, type: "text/html", hash: "x" }, "ph"), null);
  assert.equal(classifyThumb({ status: 200, type: "text/html", hash: "x" }, "ph"), null);
  assert.equal(classifyThumb(null, "ph"), null);
});

test("typed slot request: emotes stripped, length bounded, empty → null", () => {
  assert.equal(cleanSlotRequest("  Fist of Demolition  "), "Fist of Demolition");
  assert.equal(cleanSlotRequest("Wanted [emote:37226:KEKW] Dead"), "Wanted Dead");
  assert.equal(cleanSlotRequest(""), null);
  assert.equal(cleanSlotRequest("!"), null);
  assert.equal(cleanSlotRequest("x".repeat(200))?.length, 80);
});
