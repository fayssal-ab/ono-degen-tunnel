import test, { mock } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { recomputeRaces } from "../lib/races";

let written: unknown[][] = [];
let deleted = false, committed = false, closed = false;
const race = { id: 7, status: "live", period_id: 1, start_at: "2026-10-11 10:00:00", end_at: "2026-10-11 11:00:00", prize_pool: "100", prize_distribution: [{ rank: 1, percentage: 50 }, { rank: 2, percentage: 30 }] };
const snapshots = [
  { casino_id: "alice", username: "alice", time: "2026-10-11 09:59:00", wagered: "100" },
  { casino_id: "alice", username: "alice", time: "2026-10-11 10:10:00", wagered: "130" },
  { casino_id: "alice", username: "alice", time: "2026-10-11 10:50:00", wagered: "160" },
  { casino_id: "alice", username: "alice", time: "2026-10-11 11:10:00", wagered: "1000" },
  { casino_id: "big-a", username: "big-a", time: "2026-10-11 10:50:00", wagered: "999999999999.00000001" },
  { casino_id: "big-b", username: "big-b", time: "2026-10-11 10:50:00", wagered: "999999999999.00000002" },
];
const connection = {
  beginTransaction: async () => {},
  query: async (sql: string, args: unknown[]) => {
    if (sql.includes("FROM races") && sql.includes("FOR UPDATE")) return [[race], []];
    if (sql.includes("FROM rank_snapshots")) {
      assert.ok(sql.includes("ROW_NUMBER()"));
      const baseline = !sql.includes("JOIN live_entries");
      assert.equal(args[0], 1);
      if (baseline) { assert.ok(sql.includes("snapshot_at <= ?")); assert.equal(args[1], race.start_at); }
      else { assert.ok(sql.includes("snapshot_at <= LEAST(?, UTC_TIMESTAMP())")); assert.equal(args[1], race.start_at); assert.equal(args[2], race.end_at); }
      const filtered = snapshots.filter((r) => baseline ? r.time <= String(args[1]) : r.time >= String(args[1]) && r.time <= String(args[2]));
      const latest = new Map<string, typeof snapshots[number]>();
      for (const row of filtered) if (!latest.has(row.casino_id) || latest.get(row.casino_id)!.time < row.time) latest.set(row.casino_id, row);
      return [[...latest.values()], []];
    }
    if (sql.startsWith("DELETE FROM race_entries")) { deleted = true; written = []; }
    else if (sql.startsWith("INSERT INTO race_entries")) { assert.equal(deleted, true); written = args[0] as unknown[][]; }
    else if (sql.startsWith("UPDATE races")) closed = true;
    else throw new Error(`Unexpected query: ${sql}`);
    return [{ affectedRows: 1 }, []];
  },
  commit: async () => { committed = true; }, rollback: async () => {}, release: () => {},
};
process.env.DB_HOST = "test"; process.env.DB_USER = "test"; process.env.DB_NAME = "test";
mock.method(mysql, "createPool", () => ({
  query: async (sql: string) => sql.startsWith("SELECT") ? [[{ id: 7 }], []] : [{ affectedRows: 1 }, []],
  getConnection: async () => connection,
}));
test("race windows include early wagers, exclude late wagers, and preserve decimal ranking", async () => {
  assert.deepEqual(await recomputeRaces(), { races: 1, entries: 3 });
  assert.equal(written[0][1], "big-b"); assert.equal(written[1][1], "big-a");
  assert.equal(written.find((r) => r[1] === "alice")?.[3], "60.00000000");
  assert.equal(written[0][5], "50.00");
  assert.equal(committed, true); assert.equal(closed, true);
});
