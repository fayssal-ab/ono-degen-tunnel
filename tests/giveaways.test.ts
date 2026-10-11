import test, { mock } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { drawWinners, clearEntries, setGiveawayStatus, recordLiveEntry, getVerification } from "../lib/giveaways";
import { sha256, entriesHash, winnerIndex } from "../lib/fair";

// A transaction fixture with row-lock contention and rollback. No real DB,
// credentials, or casino/Kick calls are needed for these regressions.
const initial = () => ({
  g: { id: 1, title: "Test", prize: "$10", status: "open", server_seed: "v2test-seed", server_seed_hash: sha256("v2test-seed"), drawn_entrants: null as string[] | null, subscribers_only: 0, min_messages: 1, ends_at: null, drawn_at: null },
  entries: [{ kick_username: "alice", avatar: null, is_subscriber: 0, message_count: 1, excluded: 0, created_at: "2026-10-11" }],
  winners: [] as Record<string, unknown>[],
});
let state = initial();
let tail = Promise.resolve();
let failInsert = false;
function execute(sql: string, args: unknown[], current: ReturnType<typeof initial>): unknown[] {
  if (sql.startsWith("SELECT * FROM giveaways") || sql.startsWith("SELECT id, title")) return [[{ ...current.g }], []];
  if (sql.startsWith("SELECT MAX(nonce)")) return [[{ last_nonce: current.winners.at(-1)?.nonce ?? null }], []];
  if (sql.startsWith("SELECT kick_username") && sql.includes("FROM giveaway_entries")) return [structuredClone(current.entries), []];
  if (sql.startsWith("SELECT kick_username") && sql.includes("FROM giveaway_winners")) return [structuredClone(current.winners), []];
  if (sql.startsWith("INSERT INTO giveaway_winners")) {
    if (failInsert) throw new Error("simulated DB failure");
    current.winners.push({ kick_username: args[1], nonce: args[4], winner_index: args[5], entries_hash: args[7] });
  } else if (sql.startsWith("UPDATE giveaways SET drawn_entrants = CAST")) current.g.drawn_entrants = JSON.parse(String(args[0]));
  else if (sql.startsWith("UPDATE giveaways SET status = 'drawn'")) current.g.status = "drawn";
  else if (sql.startsWith("UPDATE giveaways SET status = ?")) current.g.status = String(args[0]);
  else if (sql.startsWith("DELETE FROM giveaway_entries")) current.entries = [];
  else if (sql.startsWith("DELETE FROM giveaway_winners")) current.winners = [];
  else if (sql.startsWith("UPDATE giveaways SET drawn_entrants = NULL")) {
    current.g.drawn_entrants = null; current.g.status = "open";
    current.g.server_seed = String(args[0]); current.g.server_seed_hash = String(args[1]);
  } else if (sql.startsWith("INSERT INTO giveaway_entries")) current.entries[0].message_count++;
  else throw new Error(`Unexpected query: ${sql}`);
  return [{ affectedRows: 1 }, []];
}
const pool = {
  query: async (sql: string, args: unknown[]) => execute(sql, args, state),
  getConnection: async () => {
    let local: ReturnType<typeof initial> | null = null;
    let unlock: (() => void) | undefined;
    return {
      beginTransaction: async () => {},
      query: async (sql: string, args: unknown[]) => {
        if (sql.includes("FOR UPDATE")) {
          const previous = tail;
          tail = new Promise<void>((resolve) => { unlock = resolve; });
          await previous;
          local = structuredClone(state);
        }
        return execute(sql, args, local!);
      },
      commit: async () => { if (local) state = local; unlock?.(); },
      rollback: async () => { unlock?.(); },
      release: () => {},
    };
  },
};
process.env.DB_HOST = "test"; process.env.DB_USER = "test"; process.env.DB_NAME = "test";
mock.method(mysql, "createPool", () => pool);

test("concurrent draws get distinct nonces while permitting consecutive wins", async () => {
  state = initial();
  const results = await Promise.all([drawWinners(1, 1), drawWinners(1, 1)]);
  assert.deepEqual(results.map((r) => r[0].nonce), [0, 1]);
  assert.deepEqual(results.map((r) => r[0].username), ["alice", "alice"]);
  assert.equal(state.winners.length, 2);
  assert.equal((await getVerification(1))?.serverSeed, null);
  await setGiveawayStatus(1, "closed");
  const verification = await getVerification(1);
  assert.equal(verification?.serverSeed, "v2test-seed");
  for (const winner of verification!.winners) assert.equal(winner.index, winnerIndex(verification!.serverSeed!, entriesHash(verification!.entrants), winner.nonce, 1));
  await assert.rejects(drawWinners(1, 1), /round_finished/);
  await assert.rejects(setGiveawayStatus(1, "open"), /round_already_drawn/);
});
test("failed winner insert rolls back both the snapshot and draw state", async () => {
  state = initial(); failInsert = true;
  await assert.rejects(drawWinners(1, 1), /simulated DB failure/);
  failInsert = false;
  assert.equal(state.g.drawn_entrants, null);
  assert.equal(state.g.status, "open");
  assert.equal(state.winners.length, 0);
});
test("reset starts a fresh commitment, clears results, and reopens collection", async () => {
  state = initial(); await drawWinners(1, 1); await setGiveawayStatus(1, "closed");
  await clearEntries(1);
  assert.notEqual(state.g.server_seed, "v2test-seed");
  assert.equal(state.g.server_seed_hash, sha256(state.g.server_seed));
  assert.equal(state.g.status, "open"); assert.equal(state.g.drawn_entrants, null);
  assert.equal(state.entries.length, 0); assert.equal(state.winners.length, 0);
});
test("ineligible entrants cannot win and expired collection rejects messages", async () => {
  state = initial(); state.g.min_messages = 2;
  assert.deepEqual(await drawWinners(1, 1), []);
  state.g.ends_at = "2000-01-01 00:00:00" as never;
  assert.equal(await recordLiveEntry(1, "alice", false), false);
  assert.equal(state.entries[0].message_count, 1);
});

test("legacy seeds cannot be reused, even if the old round was reopened", async () => {
  state = initial(); state.g.server_seed = "legacy-hex-seed";
  await assert.rejects(drawWinners(1, 1), /round_finished/);
  assert.equal(await recordLiveEntry(1, "alice", false), false);
  await clearEntries(1);
  assert.equal(state.g.server_seed.startsWith("v2"), true);
});
