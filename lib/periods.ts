import "server-only";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { PERIOD_RESET_TIME_UTC } from "./constants";
import { prizeForPercentage } from "./money";
import { withTx, lockApp } from "./events/common";
import { recordAward } from "./prizes";

export interface Period {
  id: number;
  title: string;
  kind: "monthly" | "weekly" | "custom";
  start_at: string;
  end_at: string;
  timezone: string;
  prize_pool: string;
  prize_distribution: PrizeDistEntry[];
  status: "upcoming" | "live" | "closed";
}

export interface PrizeDistEntry {
  rank: number;
  percentage: number;
}

export interface BoardEntry {
  casino_id: string;
  username: string;
  wagered: string;
  rank: number;
  prize?: string;
}

// prize_distribution is stored as JSON; mysql2 returns it already parsed, but
// guard for the string case so callers always get an array.
function parseDist(raw: unknown): PrizeDistEntry[] {
  if (Array.isArray(raw)) return raw as PrizeDistEntry[];
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hydratePeriod(row: RowDataPacket): Period {
  return { ...(row as Period), prize_distribution: parseDist(row.prize_distribution) };
}

export function percentageForRank(dist: PrizeDistEntry[], rank: number): number {
  return dist.find((d) => Number(d.rank) === rank)?.percentage ?? 0;
}

// ── reads ──

// Reads degrade gracefully: if the DB is unreachable or not migrated yet, they
// return empty/null so public pages show their designed empty states instead
// of crashing the whole site.
export async function getActivePeriod(): Promise<Period | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT * FROM periods WHERE status = 'live' ORDER BY start_at ASC LIMIT 1"
    );
    return rows[0] ? hydratePeriod(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function getNextUpcomingPeriod(): Promise<Period | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT * FROM periods WHERE status = 'upcoming' ORDER BY start_at ASC LIMIT 1"
    );
    return rows[0] ? hydratePeriod(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function getPeriodById(id: number): Promise<Period | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>("SELECT * FROM periods WHERE id = ? LIMIT 1", [id]);
    return rows[0] ? hydratePeriod(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function getLiveEntries(periodId: number, limit = 100): Promise<BoardEntry[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT casino_id, username, wagered, `rank` FROM live_entries WHERE period_id = ? AND `rank` IS NOT NULL ORDER BY `rank` ASC LIMIT ?",
      [periodId, limit]
    );
    return rows as BoardEntry[];
  } catch {
    return [];
  }
}

export interface ClosedPeriodSummary {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  prize_pool: string;
  winner_count: number;
}

export async function getClosedPeriods(limit = 12): Promise<ClosedPeriodSummary[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT p.id, p.title, p.start_at, p.end_at, p.prize_pool,
              (SELECT COUNT(*) FROM final_results fr WHERE fr.period_id = p.id) AS winner_count
       FROM periods p WHERE p.status = 'closed'
       ORDER BY p.end_at DESC LIMIT ?`,
      [limit]
    );
    return rows as ClosedPeriodSummary[];
  } catch {
    return [];
  }
}

export async function getFinalResults(periodId: number, limit = 100): Promise<BoardEntry[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT casino_id, username, wagered, `rank`, prize FROM final_results WHERE period_id = ? ORDER BY `rank` ASC LIMIT ?",
      [periodId, limit]
    );
    return rows as BoardEntry[];
  } catch {
    return [];
  }
}

export async function getBlacklistedIds(): Promise<Set<string>> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>("SELECT casino_id FROM blacklist");
    return new Set(rows.map((r) => r.casino_id as string));
  } catch {
    return new Set();
  }
}

export async function getLatestSuccessfulSync(
  periodId: number
): Promise<{ cache_updated_at: string | null; fetched_at: string } | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT cache_updated_at, fetched_at FROM sync_log
       WHERE period_id = ? AND status = 'success' ORDER BY fetched_at DESC LIMIT 1`,
      [periodId]
    );
    return (rows[0] as { cache_updated_at: string | null; fetched_at: string } | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Rank change since the previous snapshot, by casino_id: +n up, -n down, 0 new/same. */
export async function getRankDeltas(periodId: number): Promise<Map<string, number>> {
  try {
  const [snaps] = await getPool().query<RowDataPacket[]>(
    "SELECT DISTINCT snapshot_at FROM rank_snapshots WHERE period_id = ? ORDER BY snapshot_at DESC LIMIT 2",
    [periodId]
  );
  if (snaps.length < 2) return new Map();
  const prev = snaps[1].snapshot_at;
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT casino_id, `rank` FROM rank_snapshots WHERE period_id = ? AND snapshot_at = ?",
    [periodId, prev]
  );
  const prevRank = new Map<string, number>();
  for (const r of rows) prevRank.set(r.casino_id as string, r.rank as number);
  return prevRank;
  } catch {
    return new Map();
  }
}

// ── writes (cron path) ──

export interface WagerUpsert {
  period_id: number;
  casino_id: string;
  username: string;
  wagered: string;
}

export async function upsertLiveEntries(entries: WagerUpsert[]): Promise<void> {
  if (entries.length === 0) return;
  const values = entries.map((e) => [e.period_id, e.casino_id, e.username, e.wagered]);
  await getPool().query(
    `INSERT INTO live_entries (period_id, casino_id, username, wagered)
     VALUES ?
     ON DUPLICATE KEY UPDATE username = VALUES(username), wagered = VALUES(wagered)`,
    [values]
  );
}

export async function removeBlacklistedFromPeriod(periodId: number): Promise<void> {
  await getPool().query(
    "DELETE le FROM live_entries le JOIN blacklist b ON b.casino_id = le.casino_id WHERE le.period_id = ?",
    [periodId]
  );
}

// Rank in SQL via window function (golden rule 6). Ties share a rank.
export async function recomputeLiveRanks(periodId: number): Promise<void> {
  await getPool().query(
    `UPDATE live_entries le
     JOIN (
       SELECT id, RANK() OVER (ORDER BY wagered DESC) AS rnk
       FROM live_entries WHERE period_id = ?
     ) r ON r.id = le.id
     SET le.\`rank\` = r.rnk
     WHERE le.period_id = ?`,
    [periodId, periodId]
  );
}

export async function writeRankSnapshot(periodId: number): Promise<void> {
  await getPool().query(
    `INSERT INTO rank_snapshots (period_id, casino_id, wagered, \`rank\`)
     SELECT period_id, casino_id, wagered, \`rank\` FROM live_entries
     WHERE period_id = ? AND \`rank\` IS NOT NULL`,
    [periodId]
  );
}

export interface SyncLogEntry {
  period_id: number | null;
  provider: string;
  cache_updated_at: string | null;
  status: "success" | "failure";
  error_code: string | null;
  row_count?: number;
}

export async function writeSyncLog(entry: SyncLogEntry): Promise<void> {
  await getPool().query(
    `INSERT INTO sync_log (period_id, provider, cache_updated_at, status, error_code, row_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entry.period_id, entry.provider, entry.cache_updated_at, entry.status, entry.error_code, entry.row_count ?? 0]
  );
}

/** Periods reset at PERIOD_RESET_TIME_UTC on end_at's date, not midnight. */
export function hasPeriodEnded(period: Period, now: Date = new Date()): boolean {
  const resetInstant = new Date(`${period.end_at}T${PERIOD_RESET_TIME_UTC}Z`);
  return now.getTime() > resetInstant.getTime();
}

// Freeze live_entries -> final_results with prizes, mark closed. final_results
// is immutable (golden rule 5), so this must run once per period; it no-ops if
// results already exist. Prize math is decimal-safe (never a float).
export async function closePeriod(period: Period): Promise<void> {
  const pool = getPool();
  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM final_results WHERE period_id = ?",
      [period.id]
    );
    if ((existing[0].n as number) > 0) {
      await conn.query("UPDATE periods SET status = 'closed' WHERE id = ?", [period.id]);
      await conn.commit();
      return;
    }

    const [entries] = await conn.query<RowDataPacket[]>(
      "SELECT casino_id, username, wagered, `rank` FROM live_entries WHERE period_id = ? AND `rank` IS NOT NULL ORDER BY `rank` ASC",
      [period.id]
    );

    if (entries.length > 0) {
      const values = entries.map((e) => {
        const pct = percentageForRank(period.prize_distribution, e.rank as number);
        const prize = pct > 0 ? prizeForPercentage(period.prize_pool, pct) : "0";
        return [period.id, e.casino_id, e.username, e.wagered, e.rank, prize];
      });
      await conn.query(
        "INSERT INTO final_results (period_id, casino_id, username, wagered, `rank`, prize) VALUES ?",
        [values]
      );
      for (const v of values) {
        if (Number(v[5]) > 0) {
          await recordAward(conn, { source: "leaderboard", sourceRef: `period:${period.id}:${v[1]}`, title: period.title || "Leaderboard", place: Number(v[4]), winner: String(v[2]), amount: String(v[5]) });
        }
      }
    }

    await conn.query("UPDATE periods SET status = 'closed' WHERE id = ?", [period.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Promote the earliest upcoming period to live if nothing is live — but only
 * once its start date has arrived. Serialised with admin activation.
 */
export async function activateNextPeriod(): Promise<void> {
  await withTx(async (conn) => {
    await lockApp(conn, "period");
    const [live] = await conn.query<RowDataPacket[]>("SELECT id FROM periods WHERE status = 'live' LIMIT 1");
    if (live.length) return;
    await conn.query(
      `UPDATE periods SET status = 'live'
       WHERE id = (SELECT id FROM (SELECT id FROM periods WHERE status = 'upcoming' AND start_at <= UTC_DATE() ORDER BY start_at ASC, id ASC LIMIT 1) n)`
    );
  });
}
