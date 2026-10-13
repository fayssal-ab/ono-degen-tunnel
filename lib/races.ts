import "server-only";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { diffDecimals, prizeForPercentage, d } from "./money";
import { percentageForRank, type PrizeDistEntry } from "./periods";
import { PERIOD_RESET_TIME_UTC } from "./constants";
import { getWagerProvider } from "./providers";
import { EventError, withTx, lockApp, type DistEntry } from "./events/common";
import { recordAward } from "./prizes";

async function awardRace(conn: PoolConnection, race: Race): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT casino_id, username, `rank`, prize FROM race_entries WHERE race_id = ? AND prize > 0", [race.id]);
  for (const r of rows) {
    await recordAward(conn, { source: "race", sourceRef: `race:${race.id}:${r.casino_id}`, title: race.name, place: Number(r.rank), winner: String(r.username), amount: String(r.prize) });
  }
}

// Races (prompt §5.3). A race's score is the growth of a player's cumulative
// period wager between two sync samples ("batches" in rank_snapshots — every
// sync writes one batch, all rows sharing the same snapshot_at):
//
//   score = wagered@sample − wagered@baseline
//
//   baseline = the latest batch at/before start_at, if it is at most
//              BASELINE_TOLERANCE old; otherwise the first batch after
//              start_at (the race is then measured from that later instant —
//              wagers before it are not counted, never invented).
//   sample   = the latest batch at/before min(end_at, now).
//
// Sampling follows the sync cadence, so up to one sync interval of wagers
// around each boundary can fall either side. We never interpolate between
// samples. A player missing from the baseline batch only scores from zero
// when the provider guarantees complete listings (listsAllWagerers);
// otherwise they are counted as "baseline unknown" and left unranked rather
// than credited with their whole prior period total.
//
// Equal scores are ordered by casino_id so ranks (and prizes) are
// deterministic. Shares for ranks nobody reaches, and any percentage below
// 100%, are not paid out.
//
// Finalisation: after end_at the race is 'finalizing' until a batch newer
// than end_at exists (or the source period is closed) — only then can no
// fresher in-window sample arrive. If the last in-window sample is more than
// FINAL_TOLERANCE before end_at the race stays 'finalizing' and an admin must
// explicitly finalise on the stale data. Closed races are never recomputed.

export const BASELINE_TOLERANCE_MIN = 20;
export const FINAL_TOLERANCE_MIN = 20;

export type RaceStatus = "upcoming" | "live" | "finalizing" | "closed";

export interface Race {
  id: number;
  name: string;
  kind: "24h" | "7d";
  period_id: number | null;
  start_at: string;
  end_at: string;
  prize_pool: string;
  prize_distribution: PrizeDistEntry[];
  status: RaceStatus;
  baseline_at: string | null;
  last_sample_at: string | null;
  last_computed_at: string | null;
  pending_baseline: number;
  finalized_at: string | null;
  finalize_note: string;
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

function hydrate(r: RowDataPacket): Race {
  return {
    ...(r as Race),
    prize_pool: String(r.prize_pool),
    pending_baseline: Number(r.pending_baseline ?? 0),
    finalize_note: String(r.finalize_note ?? ""),
    prize_distribution: parseDist(r.prize_distribution),
  };
}

// ── reads (throw on DB failure so pages can show an error, not "no race") ──

export async function getActiveRaces(): Promise<Race[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT * FROM races WHERE status IN ('live','finalizing','upcoming') ORDER BY FIELD(status,'live','finalizing','upcoming'), start_at ASC"
  );
  return rows.map(hydrate);
}

export async function getClosedRaces(limit = 12, offset = 0): Promise<{ races: Race[]; total: number }> {
  const pool = getPool();
  const [[rows], [count]] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT * FROM races WHERE status = 'closed' ORDER BY end_at DESC, id DESC LIMIT ? OFFSET ?", [limit, offset]),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM races WHERE status = 'closed'"),
  ]);
  return { races: rows.map(hydrate), total: Number(count[0].n) };
}

export async function getRaceById(id: number): Promise<Race | null> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT * FROM races WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function getAllRaces(limit = 60): Promise<Race[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT * FROM races ORDER BY FIELD(status,'live','finalizing','upcoming','closed'), start_at DESC LIMIT ?",
    [limit]
  );
  return rows.map(hydrate);
}

export interface RaceEntryRow {
  casino_id: string;
  username: string;
  wagered: string;
  rank: number;
  prize: string;
}

export async function getRaceEntries(raceId: number, limit = 100, offset = 0): Promise<RaceEntryRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT casino_id, username, wagered, `rank`, prize FROM race_entries WHERE race_id = ? AND `rank` IS NOT NULL ORDER BY `rank` ASC LIMIT ? OFFSET ?",
    [raceId, limit, offset]
  );
  return rows as RaceEntryRow[];
}

export async function countRaceEntries(raceId: number): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM race_entries WHERE race_id = ? AND `rank` IS NOT NULL", [raceId]);
  return Number(rows[0].n);
}

// ── pure standings computation (unit-tested) ──

export interface StandingInput {
  baseline: Map<string, string>;
  current: { casino_id: string; username: string; wagered: string }[];
  baselineComplete: boolean;
}

export interface Standing {
  casino_id: string;
  username: string;
  wagered: string;
}

export function computeStandings({ baseline, current, baselineComplete }: StandingInput): { standings: Standing[]; pending: number } {
  let pending = 0;
  const standings: Standing[] = [];
  for (const c of current) {
    const base = baseline.get(c.casino_id);
    if (base === undefined && !baselineComplete) {
      pending++;
      continue;
    }
    const wagered = diffDecimals(c.wagered, base ?? "0");
    if (d(wagered).gt(0)) standings.push({ casino_id: c.casino_id, username: c.username, wagered });
  }
  standings.sort((a, b) => d(b.wagered).cmp(d(a.wagered)) || (a.casino_id < b.casino_id ? -1 : a.casino_id > b.casino_id ? 1 : 0));
  return { standings, pending };
}

// ── admin lifecycle ──

/** A period covers [start_at 00:00 UTC, end_at PERIOD_RESET_TIME_UTC]. */
export function periodWindow(p: { start_at: string; end_at: string }): { start: string; end: string } {
  return { start: `${String(p.start_at).slice(0, 10)} 00:00:00`, end: `${String(p.end_at).slice(0, 10)} ${PERIOD_RESET_TIME_UTC}` };
}

export interface RaceInput {
  name: string;
  kind: "24h" | "7d";
  period_id: number;
  start_at: string; // "YYYY-MM-DD HH:MM:SS" UTC
  end_at: string;
  prize_pool: string;
  distribution: DistEntry[];
}

async function validateRaceInput(conn: PoolConnection, input: RaceInput): Promise<void> {
  if (input.end_at <= input.start_at) throw new EventError("race_window_invalid", "end must be after start");
  const [periods] = await conn.query<RowDataPacket[]>("SELECT id, start_at, end_at, status FROM periods WHERE id = ? LOCK IN SHARE MODE", [input.period_id]);
  const period = periods[0];
  if (!period) throw new EventError("period_not_found");
  if (period.status === "closed") throw new EventError("period_closed");
  const w = periodWindow({ start_at: String(period.start_at), end_at: String(period.end_at) });
  if (input.start_at < w.start || input.end_at > w.end) {
    throw new EventError("race_outside_period", `period window is ${w.start} → ${w.end} UTC`);
  }
}

export async function createRace(input: RaceInput): Promise<number> {
  return withTx(async (conn) => {
    await validateRaceInput(conn, input);
    const [res] = await conn.query<import("mysql2").ResultSetHeader>(
      `INSERT INTO races (name, kind, period_id, start_at, end_at, prize_pool, prize_distribution, status)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), 'upcoming')`,
      [input.name, input.kind, input.period_id, input.start_at, input.end_at, input.prize_pool, JSON.stringify(input.distribution)]
    );
    return res.insertId;
  });
}

async function lockRace(conn: PoolConnection, id: number): Promise<Race> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM races WHERE id = ? FOR UPDATE", [id]);
  if (!rows[0]) throw new EventError("race_not_found");
  return hydrate(rows[0]);
}

/** Only before launch: once live, the rules players compete under are fixed. */
export async function updateRace(id: number, input: RaceInput): Promise<void> {
  await withTx(async (conn) => {
    const race = await lockRace(conn, id);
    if (race.status !== "upcoming") throw new EventError("race_locked");
    const [now] = await conn.query<RowDataPacket[]>("SELECT ? <= UTC_TIMESTAMP() AS started", [race.start_at]);
    if (Number(now[0].started)) throw new EventError("race_locked", "start time has passed");
    await validateRaceInput(conn, input);
    await conn.query(
      `UPDATE races SET name = ?, kind = ?, period_id = ?, start_at = ?, end_at = ?, prize_pool = ?, prize_distribution = CAST(? AS JSON) WHERE id = ?`,
      [input.name, input.kind, input.period_id, input.start_at, input.end_at, input.prize_pool, JSON.stringify(input.distribution), id]
    );
  });
}

export async function deleteRace(id: number): Promise<void> {
  await withTx(async (conn) => {
    const race = await lockRace(conn, id);
    if (race.status !== "upcoming") throw new EventError("race_locked", "only upcoming races can be deleted");
    await conn.query("DELETE FROM races WHERE id = ?", [id]);
  });
}

// ── recompute (cron, after sync) ──

interface Batches {
  baselineAt: string | null;
  sampleAt: string | null;
  postEnd: boolean;
}

async function findBatches(conn: PoolConnection, race: Race): Promise<Batches> {
  const [base] = await conn.query<RowDataPacket[]>(
    `SELECT MAX(snapshot_at) AS t FROM rank_snapshots
     WHERE period_id = ? AND snapshot_at <= ? AND snapshot_at >= ? - INTERVAL ? MINUTE`,
    [race.period_id, race.start_at, race.start_at, BASELINE_TOLERANCE_MIN]
  );
  let baselineAt: string | null = base[0].t ? String(base[0].t) : null;
  if (!baselineAt) {
    const [after] = await conn.query<RowDataPacket[]>(
      "SELECT MIN(snapshot_at) AS t FROM rank_snapshots WHERE period_id = ? AND snapshot_at > ? AND snapshot_at <= ?",
      [race.period_id, race.start_at, race.end_at]
    );
    baselineAt = after[0].t ? String(after[0].t) : null;
  }
  const [sample] = await conn.query<RowDataPacket[]>(
    "SELECT MAX(snapshot_at) AS t FROM rank_snapshots WHERE period_id = ? AND snapshot_at <= LEAST(?, UTC_TIMESTAMP())",
    [race.period_id, race.end_at]
  );
  let sampleAt: string | null = sample[0].t ? String(sample[0].t) : null;
  if (baselineAt && sampleAt && sampleAt < baselineAt) sampleAt = baselineAt;
  if (!baselineAt) sampleAt = null;
  const [post] = await conn.query<RowDataPacket[]>(
    "SELECT EXISTS(SELECT 1 FROM rank_snapshots WHERE period_id = ? AND snapshot_at > ?) AS p",
    [race.period_id, race.end_at]
  );
  return { baselineAt, sampleAt, postEnd: Boolean(Number(post[0].p)) };
}

async function rebuildEntries(conn: PoolConnection, race: Race, batches: Batches, listsAll: boolean): Promise<{ entries: number; pending: number }> {
  let standings: Standing[] = [];
  let pending = 0;
  if (batches.baselineAt && batches.sampleAt) {
    const [baseRows] = await conn.query<RowDataPacket[]>(
      "SELECT casino_id, wagered FROM rank_snapshots WHERE period_id = ? AND snapshot_at = ?",
      [race.period_id, batches.baselineAt]
    );
    const [curRows] = await conn.query<RowDataPacket[]>(
      `SELECT s.casino_id, COALESCE(le.username, s.casino_id) AS username, s.wagered
       FROM rank_snapshots s
       LEFT JOIN live_entries le ON le.period_id = s.period_id AND le.casino_id = s.casino_id
       WHERE s.period_id = ? AND s.snapshot_at = ?
         AND NOT EXISTS (SELECT 1 FROM blacklist b WHERE b.casino_id = s.casino_id)`,
      [race.period_id, batches.sampleAt]
    );
    const result = computeStandings({
      baseline: new Map(baseRows.map((b) => [String(b.casino_id), String(b.wagered)])),
      current: curRows.map((c) => ({ casino_id: String(c.casino_id), username: String(c.username), wagered: String(c.wagered) })),
      baselineComplete: listsAll,
    });
    standings = result.standings;
    pending = result.pending;
  }
  // Replace inside the transaction so removed users cannot retain stale ranks.
  await conn.query("DELETE FROM race_entries WHERE race_id = ?", [race.id]);
  if (standings.length) {
    const values = standings.map((e, i) => [race.id, e.casino_id, e.username, e.wagered, i + 1,
      prizeForPercentage(race.prize_pool, percentageForRank(race.prize_distribution, i + 1))]);
    for (let i = 0; i < values.length; i += 1000) {
      await conn.query("INSERT INTO race_entries (race_id, casino_id, username, wagered, `rank`, prize) VALUES ?", [values.slice(i, i + 1000)]);
    }
  }
  return { entries: standings.length, pending };
}

function minutesBetween(a: string, b: string): number {
  return (new Date(`${b.replace(" ", "T")}Z`).getTime() - new Date(`${a.replace(" ", "T")}Z`).getTime()) / 60_000;
}

export interface RecomputeResult {
  races: number;
  entries: number;
  closed: number;
  finalizing: number;
}

// Idempotent: re-running with the same snapshots yields the same rows; closed
// races are skipped under the row lock, so a retry never touches frozen data.
export async function recomputeRaces(): Promise<RecomputeResult> {
  const pool = getPool();
  const listsAll = getWagerProvider().listsAllWagerers;
  const [raceRows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM races WHERE status IN ('live','finalizing') OR (status = 'upcoming' AND start_at <= UTC_TIMESTAMP())"
  );
  const out: RecomputeResult = { races: raceRows.length, entries: 0, closed: 0, finalizing: 0 };
  for (const row of raceRows) {
    await withTx(async (conn) => {
      const race = await lockRace(conn, Number(row.id));
      if (race.status === "closed" || !race.period_id) return;
      const [clock] = await conn.query<RowDataPacket[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS now");
      const now = String(clock[0].now);
      if (race.status === "upcoming" && race.start_at > now) return;
      const [periodRows] = await conn.query<RowDataPacket[]>("SELECT status FROM periods WHERE id = ?", [race.period_id]);
      const periodClosed = periodRows[0]?.status === "closed";

      const batches = await findBatches(conn, race);
      const { entries, pending } = await rebuildEntries(conn, race, batches, listsAll);
      out.entries += entries;

      let status: RaceStatus = "live";
      let note = "";
      if (race.end_at <= now) {
        const noFresherData = batches.postEnd || periodClosed;
        const fresh = batches.sampleAt != null && minutesBetween(batches.sampleAt, race.end_at) <= FINAL_TOLERANCE_MIN;
        if (noFresherData && fresh) status = "closed";
        else {
          status = "finalizing";
          note = !noFresherData ? "awaiting_post_end_sync" : "stale_final_sample";
        }
      }
      await conn.query(
        `UPDATE races SET status = ?, baseline_at = ?, last_sample_at = ?, last_computed_at = UTC_TIMESTAMP(),
           pending_baseline = ?, finalize_note = ?, finalized_at = IF(? = 'closed', UTC_TIMESTAMP(), NULL)
         WHERE id = ?`,
        [status, batches.baselineAt, batches.sampleAt, pending, note, status, race.id]
      );
      if (status === "closed") { out.closed++; await awardRace(conn, race); }
      if (status === "finalizing") out.finalizing++;
    });
  }
  return out;
}

/** Admin override for a race stuck in 'finalizing' (sync down / stale data). */
export async function forceFinalizeRace(id: number): Promise<void> {
  const listsAll = getWagerProvider().listsAllWagerers;
  await withTx(async (conn) => {
    await lockApp(conn, "race");
    const race = await lockRace(conn, id);
    if (race.status !== "finalizing") throw new EventError("race_not_finalizing");
    const batches = await findBatches(conn, race);
    const { pending } = await rebuildEntries(conn, race, batches, listsAll);
    await conn.query(
      `UPDATE races SET status = 'closed', baseline_at = ?, last_sample_at = ?, last_computed_at = UTC_TIMESTAMP(),
         pending_baseline = ?, finalized_at = UTC_TIMESTAMP(), finalize_note = ? WHERE id = ?`,
      [batches.baselineAt, batches.sampleAt, pending, `forced: last sample ${batches.sampleAt ?? "none"}`, id]
    );
    await awardRace(conn, race);
  });
}
