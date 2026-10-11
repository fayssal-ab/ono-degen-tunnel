import "server-only";
import type { RowDataPacket, PoolConnection, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./db";
import { d } from "./money";
import { EventError, withTx, lockApp } from "./events/common";

// Tournaments (prompt §5.4): single-elim 8-slot slot battle, scored by the
// win multiplier the streamer hits on each slot (entered by an admin — no game
// is played on this site). QF=4 matches → SF=2 → Final=1.
//
// Engine rules (all inside one transaction with the tournament row locked):
// - a match can only be scored once both of its participants are known;
// - scores are compared as decimals; an exact tie is rejected — the match must
//   be replayed (announced on stream) and the replay scores entered;
// - the winner is written into the correct side of the next-round match;
// - a correction is refused once the next-round match has been scored, since
//   it would silently invalidate a result already played on stream;
// - a valid final finishes the tournament, after which nothing can change.

export type TournamentStatus = "upcoming" | "live" | "finished";

export interface Tournament {
  id: number;
  title: string;
  status: TournamentStatus;
  prize: string;
  starts_at: string | null;
  started_at: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface Competitor {
  seed: number;
  name: string;
  provider: string | null;
  image_url: string | null;
}

export interface Match {
  round: number; // 1 QF, 2 SF, 3 Final
  match_index: number;
  a: { seed: number | null; score: string | null };
  b: { seed: number | null; score: string | null };
  winner_seed: number | null;
}

export interface Bracket {
  tournament: Tournament;
  competitors: Map<number, Competitor>;
  rounds: Record<number, Match[]>;
  championSeed: number | null;
}

/** Standard 8-seed pairing: 1v8 and 4v5 meet in one semi, 2v7 and 3v6 in the other. */
export const QF_PAIRS: [number, number][] = [[1, 8], [4, 5], [2, 7], [3, 6]];
export const MATCHES_PER_ROUND: Record<number, number> = { 1: 4, 2: 2, 3: 1 };

/** Where the winner of (round, index) goes. Null after the final. */
export function nextSlot(round: number, index: number): { round: number; index: number; side: "a" | "b" } | null {
  if (round >= 3) return null;
  return { round: round + 1, index: Math.floor(index / 2), side: index % 2 === 0 ? "a" : "b" };
}

/** Decide a match from two decimal multipliers. Ties are not decided. */
export function decideMatch(seedA: number, seedB: number, scoreA: string, scoreB: string): number | "tie" {
  const cmp = d(scoreA).cmp(d(scoreB));
  if (cmp === 0) return "tie";
  return cmp > 0 ? seedA : seedB;
}

const COLS = "id, title, status, prize, starts_at, started_at, created_at, finished_at";

// ── public reads (throw on DB failure) ──

/** Live first, then the next upcoming, then the most recently finished. */
export async function getFeaturedTournament(): Promise<Tournament | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${COLS} FROM tournament
     ORDER BY FIELD(status,'live','upcoming','finished'),
       CASE WHEN status = 'upcoming' THEN COALESCE(starts_at, created_at) END ASC,
       COALESCE(finished_at, created_at) DESC, id DESC
     LIMIT 1`
  );
  return (rows[0] as Tournament | undefined) ?? null;
}

export async function getTournamentById(id: number): Promise<Tournament | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT ${COLS} FROM tournament WHERE id = ?`, [id]);
  return (rows[0] as Tournament | undefined) ?? null;
}

export async function getFinishedTournaments(limit = 12): Promise<(Tournament & { champion: string | null })[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT t.id, t.title, t.status, t.prize, t.starts_at, t.started_at, t.created_at, t.finished_at, s.slot_name AS champion
     FROM tournament t
     LEFT JOIN tournament_matches m ON m.tournament_id = t.id AND m.round = 3
     LEFT JOIN tournament_slots s ON s.tournament_id = t.id AND s.seed = m.winner_seed
     WHERE t.status = 'finished' ORDER BY t.finished_at DESC, t.id DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ ...(r as Tournament), champion: (r.champion as string) ?? null }));
}

export async function getAllTournaments(limit = 60): Promise<Tournament[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${COLS} FROM tournament ORDER BY FIELD(status,'live','upcoming','finished'), created_at DESC LIMIT ?`,
    [limit]
  );
  return rows as Tournament[];
}

export async function getBracket(t: Tournament): Promise<Bracket> {
  const pool = getPool();
  const [slotRows] = await pool.query<RowDataPacket[]>(
    "SELECT seed, slot_name, provider, image_url FROM tournament_slots WHERE tournament_id = ? ORDER BY seed ASC",
    [t.id]
  );
  const competitors = new Map<number, Competitor>();
  for (const s of slotRows) {
    competitors.set(s.seed as number, {
      seed: s.seed as number,
      name: s.slot_name as string,
      provider: (s.provider as string) || null,
      image_url: (s.image_url as string) ?? null,
    });
  }

  const [matchRows] = await pool.query<RowDataPacket[]>(
    "SELECT round, match_index, seed_a, seed_b, score_a, score_b, winner_seed FROM tournament_matches WHERE tournament_id = ? ORDER BY round ASC, match_index ASC",
    [t.id]
  );
  const rounds: Record<number, Match[]> = { 1: [], 2: [], 3: [] };
  let championSeed: number | null = null;
  for (const m of matchRows) {
    const match: Match = {
      round: m.round as number,
      match_index: m.match_index as number,
      a: { seed: (m.seed_a as number) ?? null, score: m.score_a != null ? String(m.score_a) : null },
      b: { seed: (m.seed_b as number) ?? null, score: m.score_b != null ? String(m.score_b) : null },
      winner_seed: (m.winner_seed as number) ?? null,
    };
    (rounds[match.round] ??= []).push(match);
    if (match.round === 3 && match.winner_seed != null) championSeed = match.winner_seed;
  }

  return { tournament: t, competitors, rounds, championSeed };
}

// ── admin lifecycle ──

export interface SlotInput {
  seed: number;
  slot_name: string;
  provider: string;
  image_url: string;
}

async function lockTournament(conn: PoolConnection, id: number): Promise<Tournament> {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${COLS} FROM tournament WHERE id = ? FOR UPDATE`, [id]);
  if (!rows[0]) throw new EventError("tournament_not_found");
  return rows[0] as Tournament;
}

export async function createTournament(input: { title: string; prize: string; starts_at: string | null }): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>(
    "INSERT INTO tournament (title, prize, starts_at, status) VALUES (?, ?, ?, 'upcoming')",
    [input.title, input.prize, input.starts_at]
  );
  return res.insertId;
}

export async function updateTournament(id: number, input: { title: string; prize: string; starts_at: string | null }): Promise<void> {
  await withTx(async (conn) => {
    const t = await lockTournament(conn, id);
    if (t.status !== "upcoming") throw new EventError("tournament_locked");
    await conn.query("UPDATE tournament SET title = ?, prize = ?, starts_at = ? WHERE id = ?", [input.title, input.prize, input.starts_at, id]);
  });
}

/** Replace the 8 seeds. Seeds must be exactly 1..8, slot names unique. */
export async function setTournamentSlots(id: number, slots: SlotInput[]): Promise<void> {
  const seeds = slots.map((s) => s.seed).sort((a, b) => a - b);
  if (slots.length !== 8 || seeds.some((s, i) => s !== i + 1)) throw new EventError("seeds_invalid", "exactly 8 slots with seeds 1..8");
  const names = new Set(slots.map((s) => s.slot_name.toLowerCase()));
  if (names.size !== 8) throw new EventError("seeds_invalid", "each slot can appear only once");
  await withTx(async (conn) => {
    const t = await lockTournament(conn, id);
    if (t.status !== "upcoming") throw new EventError("tournament_locked");
    await conn.query("DELETE FROM tournament_slots WHERE tournament_id = ?", [id]);
    await conn.query(
      "INSERT INTO tournament_slots (tournament_id, seed, slot_name, provider, image_url) VALUES ?",
      [slots.map((s) => [id, s.seed, s.slot_name, s.provider, s.image_url || null])]
    );
  });
}

export async function deleteTournament(id: number): Promise<void> {
  await withTx(async (conn) => {
    const t = await lockTournament(conn, id);
    if (t.status !== "upcoming") throw new EventError("tournament_locked", "only upcoming tournaments can be deleted");
    await conn.query("DELETE FROM tournament WHERE id = ?", [id]);
  });
}

/** Creates the 7 matches. Only one tournament can be live at a time. */
export async function launchTournament(id: number): Promise<void> {
  await withTx(async (conn) => {
    await lockApp(conn, "tournament");
    const t = await lockTournament(conn, id);
    if (t.status !== "upcoming") throw new EventError("tournament_locked");
    const [live] = await conn.query<RowDataPacket[]>("SELECT id FROM tournament WHERE status = 'live' AND id <> ?", [id]);
    if (live.length) throw new EventError("tournament_already_live", `#${live[0].id} is live`);
    const [slots] = await conn.query<RowDataPacket[]>("SELECT seed FROM tournament_slots WHERE tournament_id = ? ORDER BY seed", [id]);
    if (slots.length !== 8) throw new EventError("seeds_invalid", "set all 8 slots before launching");
    await conn.query("DELETE FROM tournament_matches WHERE tournament_id = ?", [id]);
    const values: unknown[][] = QF_PAIRS.map(([a, b], i) => [id, 1, i, a, b]);
    values.push([id, 2, 0, null, null], [id, 2, 1, null, null], [id, 3, 0, null, null]);
    await conn.query("INSERT INTO tournament_matches (tournament_id, round, match_index, seed_a, seed_b) VALUES ?", [values]);
    await conn.query("UPDATE tournament SET status = 'live', started_at = UTC_TIMESTAMP() WHERE id = ?", [id]);
  });
}

export interface ScoreResult {
  winnerSeed: number;
  finished: boolean;
}

export async function recordMatchResult(id: number, round: number, index: number, scoreA: string, scoreB: string): Promise<ScoreResult> {
  if (!MATCHES_PER_ROUND[round] || index < 0 || index >= MATCHES_PER_ROUND[round]) throw new EventError("match_not_found");
  return withTx(async (conn) => {
    const t = await lockTournament(conn, id);
    if (t.status === "finished") throw new EventError("tournament_finished");
    if (t.status !== "live") throw new EventError("tournament_not_live");
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, match_index FOR UPDATE",
      [id]
    );
    const find = (r: number, i: number) => rows.find((m) => Number(m.round) === r && Number(m.match_index) === i);
    const match = find(round, index);
    if (!match) throw new EventError("match_not_found");
    if (match.seed_a == null || match.seed_b == null) throw new EventError("match_not_ready", "both participants must be known first");

    const next = nextSlot(round, index);
    if (match.winner_seed != null && next) {
      const downstream = find(next.round, next.index);
      if (downstream && (downstream.winner_seed != null || downstream.score_a != null || downstream.score_b != null)) {
        throw new EventError("correction_blocked", `${ROUND_NAMES[next.round]} already scored`);
      }
    }

    const winner = decideMatch(Number(match.seed_a), Number(match.seed_b), scoreA, scoreB);
    if (winner === "tie") throw new EventError("match_tied");

    await conn.query(
      "UPDATE tournament_matches SET score_a = ?, score_b = ?, winner_seed = ? WHERE id = ?",
      [scoreA, scoreB, winner, match.id]
    );
    if (next) {
      const col = next.side === "a" ? "seed_a" : "seed_b";
      await conn.query(
        `UPDATE tournament_matches SET ${col} = ? WHERE tournament_id = ? AND round = ? AND match_index = ?`,
        [winner, id, next.round, next.index]
      );
      return { winnerSeed: winner, finished: false };
    }
    await conn.query("UPDATE tournament SET status = 'finished', finished_at = UTC_TIMESTAMP() WHERE id = ?", [id]);
    return { winnerSeed: winner, finished: true };
  });
}

export const ROUND_NAMES: Record<number, string> = { 1: "Quarter-final", 2: "Semi-final", 3: "Final" };
