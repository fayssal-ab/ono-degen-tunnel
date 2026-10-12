import "server-only";
import { randomInt } from "node:crypto";
import type { RowDataPacket, PoolConnection, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./db";
import { EventError, withTx, lockApp } from "./events/common";
import { randomPoolSlot } from "./slotCatalog";

// 16-player single-elimination knockout fed by Kick chat (prompt: tournament
// upgrade). All rules are enforced here, server-side, under row locks:
//
// - registration: `!join` while open registers a Kick account (unique per
//   tournament by Kick user id) with a random slot from the verified pool;
//   the 16th registration closes registration atomically;
// - repeated `!join` by a REGISTERED player not yet rolled into the bracket
//   only rerolls their slot; in the bracket, eliminated or champion → ignored;
// - roller: picks two distinct eligible players (registered, not in any
//   match) with crypto.randomInt and puts them in the next empty round-of-16
//   match as 'rolled'. Confirm locks positions + slots (IN_KNOCKOUT); cancel
//   releases them. The client animation only reveals this stored result;
// - battles: one live battle at a time; the admin picks the winner; the loser
//   is ELIMINATED, the winner moves to the fixed next match (R16 i → QF i/2 …);
//   the grand-final winner is CHAMPION;
// - fewer than 16 players: once registration is closed and nobody is left to
//   roll, empty round-of-16 slots become void and lone players advance on byes.

export const ROUNDS: Record<number, { name: string; matches: number }> = {
  1: { name: "Round of 16", matches: 8 },
  2: { name: "Quarter-final", matches: 4 },
  3: { name: "Semi-final", matches: 2 },
  4: { name: "Grand Final", matches: 1 },
};

export type ParticipantState = "registered" | "in_knockout" | "eliminated" | "champion";
export type MatchStatus = "empty" | "rolled" | "ready" | "live" | "done" | "bye" | "void";

export interface KoTournament {
  id: number;
  title: string;
  prize: string;
  status: "open" | "closed" | "finished" | "cancelled";
  max_players: number;
  champion_id: number | null;
  roll_seq: number;
  focus_match_id: number | null;
  created_at: string;
  finished_at: string | null;
}

export interface KoParticipant {
  id: number;
  username: string;
  slot_name: string;
  slot_provider: string;
  slot_image: string;
  state: ParticipantState;
  bracket_pos: number | null;
  rerolls: number;
  joined_at: string;
}

export interface KoMatch {
  id: number;
  round: number;
  match_index: number;
  status: MatchStatus;
  p1: KoParticipant | null;
  p2: KoParticipant | null;
  winner_id: number | null;
  roll_seq: number | null;
}

export const JOIN_RE = /^\s*!join\s*$/i;

/** Where the winner of (round, index) plays next. Null after the grand final. */
export function nextMatch(round: number, index: number): { round: number; index: number; side: 1 | 2 } | null {
  if (round >= 4) return null;
  return { round: round + 1, index: Math.floor(index / 2), side: index % 2 === 0 ? 1 : 2 };
}

/** Two distinct uniformly random indexes in [0, n). */
export function pickTwo(n: number, rand: (max: number) => number = randomInt): [number, number] {
  if (n < 2) throw new EventError("not_enough_players");
  const a = rand(n);
  let b = rand(n - 1);
  if (b >= a) b++;
  return [a, b];
}

// ── reads ──

const T_COLS = "id, title, prize, status, max_players, champion_id, roll_seq, focus_match_id, created_at, finished_at";
const P_COLS = "id, username, slot_name, slot_provider, slot_image, state, bracket_pos, rerolls, joined_at";

/** Running tournament (open/closed), else the most recent finished one. */
export async function getFeaturedKo(): Promise<KoTournament | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${T_COLS} FROM ko_tournaments WHERE status IN ('open','closed','finished')
     ORDER BY FIELD(status,'open','closed','finished'), id DESC LIMIT 1`
  );
  return (rows[0] as KoTournament | undefined) ?? null;
}

export async function getActiveKo(conn?: PoolConnection): Promise<KoTournament | null> {
  const [rows] = await (conn ?? getPool()).query<RowDataPacket[]>(
    `SELECT ${T_COLS} FROM ko_tournaments WHERE status IN ('open','closed') ORDER BY id DESC LIMIT 1`
  );
  return (rows[0] as KoTournament | undefined) ?? null;
}

export async function getKoById(id: number): Promise<KoTournament | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT ${T_COLS} FROM ko_tournaments WHERE id = ?`, [id]);
  return (rows[0] as KoTournament | undefined) ?? null;
}

export async function getKoArchive(limit = 12): Promise<(KoTournament & { champion: string | null; champion_slot: string | null })[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT t.${T_COLS.split(", ").join(", t.")}, p.username AS champion, p.slot_name AS champion_slot
     FROM ko_tournaments t LEFT JOIN ko_participants p ON p.id = t.champion_id
     WHERE t.status = 'finished' ORDER BY t.finished_at DESC, t.id DESC LIMIT ?`,
    [limit]
  );
  return rows as (KoTournament & { champion: string | null; champion_slot: string | null })[];
}

export interface KoState {
  tournament: KoTournament;
  participants: KoParticipant[];
  matches: KoMatch[];
  registered: number;
  eligible: number;
  focus: KoMatch | null;
  live: KoMatch | null;
  pendingRoll: KoMatch | null;
  nextReady: KoMatch | null;
  champion: KoParticipant | null;
}

export async function getKoState(t: KoTournament): Promise<KoState> {
  const pool = getPool();
  const [[pRows], [mRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT ${P_COLS} FROM ko_participants WHERE tournament_id = ? ORDER BY id ASC`, [t.id]),
    pool.query<RowDataPacket[]>("SELECT * FROM ko_matches WHERE tournament_id = ? ORDER BY round ASC, match_index ASC", [t.id]),
  ]);
  const participants = pRows as KoParticipant[];
  const byId = new Map(participants.map((p) => [Number(p.id), p]));
  const matches: KoMatch[] = mRows.map((m) => ({
    id: Number(m.id), round: Number(m.round), match_index: Number(m.match_index), status: m.status as MatchStatus,
    p1: m.p1_id ? byId.get(Number(m.p1_id)) ?? null : null,
    p2: m.p2_id ? byId.get(Number(m.p2_id)) ?? null : null,
    winner_id: m.winner_id ? Number(m.winner_id) : null,
    roll_seq: m.roll_seq != null ? Number(m.roll_seq) : null,
  }));
  const inMatch = new Set<number>();
  for (const m of mRows) {
    if (Number(m.round) === 1) { if (m.p1_id) inMatch.add(Number(m.p1_id)); if (m.p2_id) inMatch.add(Number(m.p2_id)); }
  }
  const live = matches.find((m) => m.status === "live") ?? null;
  const pendingRoll = matches.find((m) => m.status === "rolled") ?? null;
  const nextReady = matches.find((m) => m.status === "ready") ?? null;
  const focus = (t.focus_match_id && matches.find((m) => m.id === Number(t.focus_match_id))) || live || pendingRoll || null;
  return {
    tournament: t,
    participants,
    matches,
    registered: participants.length,
    eligible: participants.filter((p) => p.state === "registered" && !inMatch.has(Number(p.id))).length,
    focus,
    live,
    pendingRoll,
    nextReady,
    champion: t.champion_id ? byId.get(Number(t.champion_id)) ?? null : null,
  };
}

// ── lifecycle ──

async function lockKo(conn: PoolConnection, id: number): Promise<KoTournament> {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${T_COLS} FROM ko_tournaments WHERE id = ? FOR UPDATE`, [id]);
  if (!rows[0]) throw new EventError("ko_not_found");
  return rows[0] as KoTournament;
}

async function lockRunning(conn: PoolConnection, id: number): Promise<KoTournament> {
  const t = await lockKo(conn, id);
  if (t.status === "finished") throw new EventError("ko_finished");
  if (t.status === "cancelled") throw new EventError("ko_cancelled");
  return t;
}

export async function createKo(input: { title: string; prize: string }): Promise<number> {
  return withTx(async (conn) => {
    await lockApp(conn, "ko");
    const active = await getActiveKo(conn);
    if (active) throw new EventError("ko_already_running", `#${active.id} is still running — finish or reset it first`);
    const [res] = await conn.query<ResultSetHeader>("INSERT INTO ko_tournaments (title, prize, status) VALUES (?, ?, 'closed')", [input.title, input.prize]);
    const id = res.insertId;
    const values: unknown[][] = [];
    for (const [round, r] of Object.entries(ROUNDS)) for (let i = 0; i < r.matches; i++) values.push([id, Number(round), i]);
    await conn.query("INSERT INTO ko_matches (tournament_id, round, match_index) VALUES ?", [values]);
    return id;
  });
}

export async function openRegistration(id: number): Promise<void> {
  await withTx(async (conn) => {
    const t = await lockRunning(conn, id);
    const [n] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM ko_participants WHERE tournament_id = ?", [id]);
    if (Number(n[0].n) >= t.max_players) throw new EventError("ko_full");
    const [void_] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM ko_matches WHERE tournament_id = ? AND round = 1 AND status IN ('void','bye')", [id]);
    if (Number(void_[0].n) > 0) throw new EventError("ko_bracket_sealed");
    await conn.query("UPDATE ko_tournaments SET status = 'open', opened_at = COALESCE(opened_at, UTC_TIMESTAMP()) WHERE id = ?", [id]);
  });
}

export async function closeRegistration(id: number): Promise<void> {
  await withTx(async (conn) => {
    const t = await lockRunning(conn, id);
    if (t.status !== "open") throw new EventError("ko_not_open");
    await conn.query("UPDATE ko_tournaments SET status = 'closed', closed_at = UTC_TIMESTAMP() WHERE id = ?", [id]);
    await propagate(conn, id);
  });
}

/** "Reset": the tournament is cancelled (kept for the record); create a new one after. */
export async function resetKo(id: number): Promise<void> {
  await withTx(async (conn) => {
    await lockRunning(conn, id);
    await conn.query("UPDATE ko_tournaments SET status = 'cancelled', focus_match_id = NULL WHERE id = ?", [id]);
  });
}

// ── chat registration ──

export interface JoinInput {
  kickUserId: string;
  username: string;
  messageId: string;
}

export type JoinOutcome =
  | "registered" | "rerolled" | "duplicate_message" | "no_tournament" | "registration_closed"
  | "full" | "locked_in_bracket" | "eliminated" | "pending_roll" | "no_slots";

/** Run inside a transaction (webhook or admin socket relay). */
export async function recordJoin(conn: PoolConnection, input: JoinInput): Promise<{ outcome: JoinOutcome; count?: number }> {
  const [seen] = await conn.query<ResultSetHeader>("INSERT IGNORE INTO ko_join_seen (message_id) VALUES (?)", [input.messageId.slice(0, 191)]);
  if (!seen.affectedRows) return { outcome: "duplicate_message" };
  // The tournament row lock must be the FIRST read of this transaction: under
  // REPEATABLE READ a plain SELECT before it would pin an older snapshot and
  // later counts could miss concurrent registrations (→ more than 16).
  const [locked] = await conn.query<RowDataPacket[]>(
    `SELECT ${T_COLS} FROM ko_tournaments WHERE status IN ('open','closed') ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  const t = locked[0] as KoTournament | undefined;
  if (!t) return { outcome: "no_tournament" };

  const [existing] = await conn.query<RowDataPacket[]>(
    "SELECT id, state, slot_id FROM ko_participants WHERE tournament_id = ? AND kick_user_id = ? FOR UPDATE",
    [t.id, input.kickUserId]
  );
  const [assigned] = await conn.query<RowDataPacket[]>("SELECT slot_id FROM ko_participants WHERE tournament_id = ? FOR SHARE", [t.id]);
  const taken = assigned.map((r) => String(r.slot_id));

  if (existing[0]) {
    const p = existing[0];
    if (p.state === "eliminated") return { outcome: "eliminated" };
    if (p.state !== "registered") return { outcome: "locked_in_bracket" };
    const [inMatch] = await conn.query<RowDataPacket[]>(
      "SELECT status FROM ko_matches WHERE tournament_id = ? AND (p1_id = ? OR p2_id = ?) LIMIT 1",
      [t.id, p.id, p.id]
    );
    if (inMatch[0]) return { outcome: inMatch[0].status === "rolled" ? "pending_roll" : "locked_in_bracket" };
    let slot;
    try { slot = await randomPoolSlot(conn, [...taken, String(p.slot_id)]); } catch { return { outcome: "no_slots" }; }
    await conn.query(
      "UPDATE ko_participants SET slot_id = ?, slot_name = ?, slot_provider = ?, slot_image = ?, username = ?, rerolls = rerolls + 1 WHERE id = ?",
      [slot.id, slot.name, slot.provider, slot.imageUrl, input.username, p.id]
    );
    return { outcome: "rerolled" };
  }

  if (t.status !== "open") return { outcome: "registration_closed" };
  const count = assigned.length;
  if (count >= t.max_players) return { outcome: "full" };
  let slot;
  try { slot = await randomPoolSlot(conn, taken); } catch { return { outcome: "no_slots" }; }
  await conn.query(
    `INSERT INTO ko_participants (tournament_id, kick_user_id, username, slot_id, slot_name, slot_provider, slot_image)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [t.id, input.kickUserId, input.username, slot.id, slot.name, slot.provider, slot.imageUrl]
  );
  if (count + 1 >= t.max_players) {
    await conn.query("UPDATE ko_tournaments SET status = 'closed', closed_at = UTC_TIMESTAMP() WHERE id = ?", [t.id]);
  }
  return { outcome: "registered", count: count + 1 };
}

// ── roller ──

export async function rollPlayers(id: number): Promise<{ matchId: number; p1: number; p2: number | null; bye: boolean }> {
  return withTx(async (conn) => {
    const t = await lockRunning(conn, id);
    const [matches] = await conn.query<RowDataPacket[]>(
      "SELECT * FROM ko_matches WHERE tournament_id = ? AND round = 1 ORDER BY match_index FOR UPDATE",
      [id]
    );
    if (matches.some((m) => m.status === "rolled")) throw new EventError("roll_pending");
    const target = matches.find((m) => m.status === "empty");
    if (!target) throw new EventError("first_round_full");
    const used = new Set<number>();
    for (const m of matches) { if (m.p1_id) used.add(Number(m.p1_id)); if (m.p2_id) used.add(Number(m.p2_id)); }
    const [pRows] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM ko_participants WHERE tournament_id = ? AND state = 'registered' ORDER BY id FOR UPDATE",
      [id]
    );
    const pool = pRows.map((r) => Number(r.id)).filter((pid) => !used.has(pid));
    const seq = Number(t.roll_seq) + 1;

    if (pool.length === 1 && t.status === "closed") {
      // last player with nobody left to face: advances on a bye
      const p1 = pool[0];
      await conn.query("UPDATE ko_matches SET p1_id = ?, status = 'bye', winner_id = ?, roll_seq = ?, rolled_at = UTC_TIMESTAMP(), finished_at = UTC_TIMESTAMP() WHERE id = ?", [p1, p1, seq, target.id]);
      await conn.query("UPDATE ko_participants SET state = 'in_knockout', bracket_pos = ? WHERE id = ?", [Number(target.match_index) * 2 + 1, p1]);
      await conn.query("UPDATE ko_tournaments SET roll_seq = ?, focus_match_id = ? WHERE id = ?", [seq, target.id, id]);
      await propagate(conn, id);
      return { matchId: Number(target.id), p1, p2: null, bye: true };
    }
    if (pool.length < 2) throw new EventError("not_enough_players", pool.length === 1 ? "close registration to give the last player a bye" : "no unassigned players left");
    const [a, b] = pickTwo(pool.length);
    await conn.query(
      "UPDATE ko_matches SET p1_id = ?, p2_id = ?, status = 'rolled', roll_seq = ?, rolled_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'empty'",
      [pool[a], pool[b], seq, target.id]
    );
    await conn.query("UPDATE ko_tournaments SET roll_seq = ?, focus_match_id = ? WHERE id = ?", [seq, target.id, id]);
    return { matchId: Number(target.id), p1: pool[a], p2: pool[b], bye: false };
  });
}

export async function confirmRoll(id: number): Promise<void> {
  await withTx(async (conn) => {
    await lockRunning(conn, id);
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM ko_matches WHERE tournament_id = ? AND status = 'rolled' FOR UPDATE", [id]);
    const m = rows[0];
    if (!m) throw new EventError("no_pending_roll");
    const base = Number(m.match_index) * 2;
    await conn.query("UPDATE ko_participants SET state = 'in_knockout', bracket_pos = ? WHERE id = ? AND state = 'registered'", [base + 1, m.p1_id]);
    await conn.query("UPDATE ko_participants SET state = 'in_knockout', bracket_pos = ? WHERE id = ? AND state = 'registered'", [base + 2, m.p2_id]);
    await conn.query("UPDATE ko_matches SET status = 'ready' WHERE id = ?", [m.id]);
    await propagate(conn, id);
  });
}

export async function cancelRoll(id: number): Promise<void> {
  await withTx(async (conn) => {
    await lockRunning(conn, id);
    const [res] = await conn.query<ResultSetHeader>(
      "UPDATE ko_matches SET p1_id = NULL, p2_id = NULL, status = 'empty', roll_seq = NULL, rolled_at = NULL WHERE tournament_id = ? AND status = 'rolled'",
      [id]
    );
    if (!res.affectedRows) throw new EventError("no_pending_roll");
    await conn.query("UPDATE ko_tournaments SET focus_match_id = NULL WHERE id = ?", [id]);
  });
}

// ── battles ──

/** Starts the focused battle if it is ready, else the next ready one in bracket order. */
export async function startBattle(id: number): Promise<number> {
  return withTx(async (conn) => {
    const t = await lockRunning(conn, id);
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM ko_matches WHERE tournament_id = ? ORDER BY round, match_index FOR UPDATE", [id]);
    if (rows.some((m) => m.status === "live")) throw new EventError("battle_already_live");
    if (rows.some((m) => m.status === "rolled")) throw new EventError("roll_pending");
    const focused = rows.find((m) => Number(m.id) === Number(t.focus_match_id) && m.status === "ready");
    const m = focused ?? rows.find((x) => x.status === "ready");
    if (!m) throw new EventError("no_ready_battle");
    await conn.query("UPDATE ko_matches SET status = 'live', started_at = UTC_TIMESTAMP() WHERE id = ?", [m.id]);
    await conn.query("UPDATE ko_tournaments SET focus_match_id = ? WHERE id = ?", [m.id, id]);
    return Number(m.id);
  });
}

/** Moves the dashboard/overlay focus to the next ready battle (or clears it). */
export async function focusNext(id: number): Promise<number | null> {
  return withTx(async (conn) => {
    await lockRunning(conn, id);
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT id, status FROM ko_matches WHERE tournament_id = ? AND status IN ('live','rolled','ready') ORDER BY FIELD(status,'live','rolled','ready'), round, match_index LIMIT 1",
      [id]
    );
    const next = rows[0] ? Number(rows[0].id) : null;
    await conn.query("UPDATE ko_tournaments SET focus_match_id = ? WHERE id = ?", [next, id]);
    return next;
  });
}

export async function declareWinner(id: number, matchId: number, side: 1 | 2): Promise<{ winnerId: number; champion: boolean }> {
  return withTx(async (conn) => {
    await lockRunning(conn, id);
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM ko_matches WHERE id = ? AND tournament_id = ? FOR UPDATE", [matchId, id]);
    const m = rows[0];
    if (!m) throw new EventError("match_not_found");
    if (m.status !== "live") throw new EventError("battle_not_live", "start the battle first");
    const winner = Number(side === 1 ? m.p1_id : m.p2_id);
    const loser = Number(side === 1 ? m.p2_id : m.p1_id);
    await conn.query("UPDATE ko_matches SET status = 'done', winner_id = ?, finished_at = UTC_TIMESTAMP() WHERE id = ?", [winner, matchId]);
    await conn.query("UPDATE ko_participants SET state = 'eliminated' WHERE id = ?", [loser]);
    await conn.query("UPDATE ko_tournaments SET focus_match_id = ? WHERE id = ?", [matchId, id]);
    const champion = await propagate(conn, id);
    return { winnerId: winner, champion: champion === winner };
  });
}

// ── bracket propagation ──

type Side = { kind: "player"; id: number } | { kind: "void" } | { kind: "pending" };

function feederSide(m: RowDataPacket | undefined): Side {
  if (!m) return { kind: "pending" };
  if ((m.status === "done" || m.status === "bye") && m.winner_id) return { kind: "player", id: Number(m.winner_id) };
  if (m.status === "void") return { kind: "void" };
  return { kind: "pending" };
}

/**
 * Fills later rounds from finished matches, resolves byes/voids, and crowns
 * the champion. Idempotent. Returns the champion's participant id, if any.
 */
async function propagate(conn: PoolConnection, id: number): Promise<number | null> {
  const [tRows] = await conn.query<RowDataPacket[]>("SELECT status FROM ko_tournaments WHERE id = ?", [id]);
  const closed = tRows[0]?.status === "closed";
  const load = async () => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM ko_matches WHERE tournament_id = ? ORDER BY round, match_index", [id]);
    return rows;
  };
  let rows = await load();

  if (closed) {
    const r1 = rows.filter((m) => Number(m.round) === 1);
    const used = new Set<number>();
    for (const m of r1) { if (m.p1_id) used.add(Number(m.p1_id)); if (m.p2_id) used.add(Number(m.p2_id)); }
    const [pRows] = await conn.query<RowDataPacket[]>("SELECT id FROM ko_participants WHERE tournament_id = ? AND state = 'registered'", [id]);
    const unassigned = pRows.filter((p) => !used.has(Number(p.id))).length;
    if (unassigned === 0 && !r1.some((m) => m.status === "rolled")) {
      await conn.query("UPDATE ko_matches SET status = 'void' WHERE tournament_id = ? AND round = 1 AND status = 'empty'", [id]);
      rows = await load();
    }
  }

  for (let round = 2; round <= 4; round++) {
    for (const m of rows.filter((x) => Number(x.round) === round)) {
      if (["live", "done", "bye", "void"].includes(m.status)) continue;
      const f1 = rows.find((x) => Number(x.round) === round - 1 && Number(x.match_index) === Number(m.match_index) * 2);
      const f2 = rows.find((x) => Number(x.round) === round - 1 && Number(x.match_index) === Number(m.match_index) * 2 + 1);
      const a = feederSide(f1);
      const b = feederSide(f2);
      const p1 = a.kind === "player" ? a.id : null;
      const p2 = b.kind === "player" ? b.id : null;
      let status: MatchStatus = "empty";
      let winner: number | null = null;
      if (p1 && p2) status = "ready";
      else if (a.kind === "void" && b.kind === "void") status = "void";
      else if ((p1 && b.kind === "void") || (p2 && a.kind === "void")) { status = "bye"; winner = p1 ?? p2; }
      if (status !== m.status || p1 !== (m.p1_id ? Number(m.p1_id) : null) || p2 !== (m.p2_id ? Number(m.p2_id) : null)) {
        await conn.query(
          "UPDATE ko_matches SET p1_id = ?, p2_id = ?, status = ?, winner_id = ?, finished_at = IF(? = 'bye', UTC_TIMESTAMP(), NULL) WHERE id = ?",
          [p1, p2, status, winner, status, m.id]
        );
        Object.assign(m, { p1_id: p1, p2_id: p2, status, winner_id: winner });
      }
    }
  }

  const final = rows.find((x) => Number(x.round) === 4);
  if (final && (final.status === "done" || final.status === "bye") && final.winner_id) {
    const champ = Number(final.winner_id);
    await conn.query("UPDATE ko_participants SET state = 'champion' WHERE id = ?", [champ]);
    await conn.query("UPDATE ko_tournaments SET status = 'finished', champion_id = ?, finished_at = UTC_TIMESTAMP() WHERE id = ?", [champ, id]);
    return champ;
  }
  return null;
}
