import test from "node:test";
import assert from "node:assert/strict";
import { nextMatch, pickTwo, JOIN_RE } from "../lib/knockout";
import { normalizeName, scoreName, cleanSlotRequest, parseStakeFeed } from "../lib/slotCatalog";

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

test("Stake feed parsing: providers, art URL, only-on-Stake, popularity, bad rows skipped", () => {
  const rows = parseStakeFeed({
    image_base: "https://mediumrare.imgix.net/",
    providers: ["Pragmatic Play", "Glass Cannon"],
    slots: [
      [1, "Gates of Olympus", 0, "gates-of-olympus", "a".repeat(64), 96.5, 1, 0, 5000, null, 3],
      [2, "Soul Strings", 1, "glasscannon-soul-strings", "b".repeat(64), 96.7, 1, 1, null, null, 365],
      [3, "Gates of Olympus", 0, "gates-of-olympus", "c".repeat(64), 0, 0, 0, null, null, 9], // duplicate slug
      [4, "", 0, "empty", "d".repeat(64), 0, 0, 0, null, null, 1], // no name
      [5, "Bad Image", 0, "bad-image", "javascript:alert(1)", 0, 0, 0, null, null, 2],
    ],
  });
  assert.deepEqual(rows.map((r) => r.id), ["stake/gates-of-olympus", "stake/glasscannon-soul-strings", "stake/bad-image"]);
  assert.equal(rows[0].imageUrl, `https://mediumrare.imgix.net/${"a".repeat(64)}?w=280&h=367&fit=min&auto=format`);
  assert.deepEqual([rows[1].provider, rows[1].onlyOnStake, rows[1].popularity], ["Glass Cannon", true, 365]);
  assert.equal(rows[2].imageUrl, null); // never an injected URL
  // an untrusted image_base falls back to Stake's CDN
  assert.ok(parseStakeFeed({ image_base: "http://evil/", slots: [[1, "X", 0, "x", "e".repeat(64)]] })[0].imageUrl?.startsWith("https://mediumrare.imgix.net/"));
});

test("typed slot request: emotes stripped, length bounded, empty → null", () => {
  assert.equal(cleanSlotRequest("  Fist of Demolition  "), "Fist of Demolition");
  assert.equal(cleanSlotRequest("Wanted [emote:37226:KEKW] Dead"), "Wanted Dead");
  assert.equal(cleanSlotRequest(""), null);
  assert.equal(cleanSlotRequest("!"), null);
  assert.equal(cleanSlotRequest("x".repeat(200))?.length, 80);
});

test("prize amounts are read from prize text", async () => {
  const { parsePrizeAmount } = await import("../lib/prizes");
  assert.equal(parsePrizeAmount("$50"), "50.00");
  assert.equal(parsePrizeAmount("50$ cash"), "50.00");
  assert.equal(parsePrizeAmount("$1,250.5 tip"), "1250.50");
  assert.equal(parsePrizeAmount("20 USD"), "20.00");
  assert.equal(parsePrizeAmount("VIP role"), null);
  assert.equal(parsePrizeAmount(""), null);
});
