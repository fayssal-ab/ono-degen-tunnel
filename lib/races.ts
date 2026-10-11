import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { diffDecimals, prizeForPercentage, d } from "./money";
import { percentageForRank, type PrizeDistEntry } from "./periods";

// Races (prompt §5.3): a race's standings are the wager GROWTH over its window,
// read from rank_snapshots (the same snapshots that power the ▲▼ arrows). For
// each casino_id we diff the latest snapshot against the one at/just-after the
// race start. Ranking is done in SQL on the resulting diffs.

export interface Race {
  id: number;
  name: string;
  kind: "24h" | "7d";
  period_id: number | null;
  start_at: string;
  end_at: string;
  prize_pool: string;
  prize_distribution: PrizeDistEntry[];
  status: "upcoming" | "live" | "closed";
}

function parseDist(raw: unknown): PrizeDistEntry[] {
  if (Array.isArray(raw)) return raw as PrizeDistEntry[];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function getLiveRaces(): Promise<Race[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT * FROM races WHERE status IN ('live','upcoming') ORDER BY end_at ASC"
  );
  return rows.map((r) => ({ ...(r as Race), prize_distribution: parseDist(r.prize_distribution) }));
}

export interface RaceEntryRow {
  casino_id: string;
  username: string;
  wagered: string;
  rank: number;
  prize: string;
}

export async function getRaceEntries(raceId: number, limit = 100): Promise<RaceEntryRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT casino_id, username, wagered, `rank`, prize FROM race_entries WHERE race_id = ? AND `rank` IS NOT NULL ORDER BY `rank` ASC LIMIT ?",
    [raceId, limit]
  );
  return rows as RaceEntryRow[];
}

// Standings use snapshots bounded by the race window. Sampling follows the
// wager sync cadence; exact wagers between snapshots are not available.
export async function recomputeRaces(): Promise<{ races: number; entries: number }> {
  const pool = getPool();
  await pool.query("UPDATE races SET status = 'live' WHERE status = 'upcoming' AND start_at <= UTC_TIMESTAMP()");
  const [raceRows] = await pool.query<RowDataPacket[]>("SELECT id FROM races WHERE status = 'live'");
  let totalEntries = 0;
  for (const row of raceRows) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [locked] = await conn.query<RowDataPacket[]>("SELECT * FROM races WHERE id = ? FOR UPDATE", [row.id]);
      const raw = locked[0];
      if (!raw || raw.status !== "live" || !raw.period_id) { await conn.commit(); continue; }
      const race = { ...(raw as Race), prize_distribution: parseDist(raw.prize_distribution) };
      const [baseRows] = await conn.query<RowDataPacket[]>(
        `SELECT casino_id, wagered FROM (
           SELECT casino_id, wagered, ROW_NUMBER() OVER (PARTITION BY casino_id ORDER BY snapshot_at DESC, id DESC) AS rn
           FROM rank_snapshots WHERE period_id = ? AND snapshot_at <= ?
         ) s WHERE rn = 1`, [race.period_id, race.start_at]
      );
      const baseline = new Map(baseRows.map((b) => [String(b.casino_id), String(b.wagered)]));
      const [current] = await conn.query<RowDataPacket[]>(
        `SELECT s.casino_id, le.username, s.wagered FROM (
           SELECT casino_id, wagered, ROW_NUMBER() OVER (PARTITION BY casino_id ORDER BY snapshot_at DESC, id DESC) AS rn
           FROM rank_snapshots WHERE period_id = ? AND snapshot_at >= ? AND snapshot_at <= LEAST(?, UTC_TIMESTAMP())
         ) s JOIN live_entries le ON le.period_id = ? AND le.casino_id = s.casino_id
         WHERE s.rn = 1 AND NOT EXISTS (SELECT 1 FROM blacklist b WHERE b.casino_id = s.casino_id)`,
        [race.period_id, race.start_at, race.end_at, race.period_id]
      );
      const diffs = current.map((c) => ({ casino_id: String(c.casino_id), username: String(c.username),
        wagered: diffDecimals(String(c.wagered), baseline.get(String(c.casino_id)) ?? "0") }))
        .filter((e) => d(e.wagered).gt(0))
        .sort((a, b) => d(b.wagered).cmp(d(a.wagered)) || a.casino_id.localeCompare(b.casino_id));
      // Replace inside the transaction so removed users cannot retain stale ranks.
      await conn.query("DELETE FROM race_entries WHERE race_id = ?", [race.id]);
      if (diffs.length) {
        const values = diffs.map((e, i) => [race.id, e.casino_id, e.username, e.wagered, i + 1,
          prizeForPercentage(race.prize_pool, percentageForRank(race.prize_distribution, i + 1))]);
        await conn.query("INSERT INTO race_entries (race_id, casino_id, username, wagered, `rank`, prize) VALUES ?", [values]);
      }
      await conn.query("UPDATE races SET status = 'closed' WHERE id = ? AND end_at <= UTC_TIMESTAMP()", [race.id]);
      await conn.commit();
      totalEntries += diffs.length;
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  }
  return { races: raceRows.length, entries: totalEntries };
}
