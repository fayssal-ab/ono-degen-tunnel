import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { diffDecimals, prizeForPercentage } from "./money";
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

// Recompute every live race from snapshots. Called by /api/cron/races.
export async function recomputeRaces(): Promise<{ races: number; entries: number }> {
  const pool = getPool();
  const [raceRows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM races WHERE status = 'live'"
  );
  let totalEntries = 0;

  for (const raceRaw of raceRows) {
    const race = { ...(raceRaw as Race), prize_distribution: parseDist(raceRaw.prize_distribution) };
    if (!race.period_id) continue;

    // baseline: wagered per casino_id at the first snapshot at/after start_at
    const [baseRows] = await pool.query<RowDataPacket[]>(
      `SELECT rs.casino_id, rs.wagered
       FROM rank_snapshots rs
       JOIN (
         SELECT casino_id, MIN(snapshot_at) AS first_at
         FROM rank_snapshots
         WHERE period_id = ? AND snapshot_at >= ?
         GROUP BY casino_id
       ) f ON f.casino_id = rs.casino_id AND f.first_at = rs.snapshot_at
       WHERE rs.period_id = ?`,
      [race.period_id, race.start_at, race.period_id]
    );
    const baseline = new Map<string, string>();
    for (const b of baseRows) baseline.set(b.casino_id as string, String(b.wagered));

    // current: latest live_entries for the period
    const [curRows] = await pool.query<RowDataPacket[]>(
      "SELECT casino_id, username, wagered FROM live_entries WHERE period_id = ?",
      [race.period_id]
    );

    const diffs = curRows
      .map((c) => ({
        casino_id: c.casino_id as string,
        username: c.username as string,
        wagered: diffDecimals(String(c.wagered), baseline.get(c.casino_id as string) ?? "0"),
      }))
      .filter((d) => Number(d.wagered) > 0)
      .sort((a, b) => Number(b.wagered) - Number(a.wagered));

    if (diffs.length === 0) continue;

    const values = diffs.map((d, i) => {
      const rank = i + 1;
      const pct = percentageForRank(race.prize_distribution, rank);
      const prize = pct > 0 ? prizeForPercentage(race.prize_pool, pct) : "0";
      return [race.id, d.casino_id, d.username, d.wagered, rank, prize];
    });

    await pool.query(
      `INSERT INTO race_entries (race_id, casino_id, username, wagered, \`rank\`, prize)
       VALUES ?
       ON DUPLICATE KEY UPDATE username = VALUES(username), wagered = VALUES(wagered),
         \`rank\` = VALUES(\`rank\`), prize = VALUES(prize)`,
      [values]
    );
    totalEntries += values.length;
  }

  // close races whose window has passed
  await pool.query("UPDATE races SET status = 'closed' WHERE status = 'live' AND end_at < NOW()");

  return { races: raceRows.length, entries: totalEntries };
}
