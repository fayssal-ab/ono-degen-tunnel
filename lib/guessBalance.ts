import "server-only";
import type { RowDataPacket, PoolConnection, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./db";
import { maskUsername } from "./mask";
import { EventError, withTx, lockApp, DECIMAL_20_8 } from "./events/common";
import { getHuntFinalBalance } from "./bonusHunt";
import { recordAward } from "./prizes";
import { deleteTicketChannel } from "./discordTickets";

// Guess the Balance (prompt §5.7). Viewers type `!gb <amount>` in Kick chat;
// the signed Kick webhook records it. Rules (shown on the public page):
//
// - one guess per Kick account (stable Kick user id when the payload carries
//   one, else the lowercased username) — the latest guess sent counts;
// - "latest" is decided by the signed Kick message time, so a delayed
//   delivery of an older message can't overwrite a newer guess;
// - a guess counts only if sent while the round is open: after opened_at,
//   before the optional deadline, and processed before the round is closed.
//   Messages that arrive after closing are dropped — a round is never
//   reopened for late deliveries, and replays are de-duplicated by message id;
// - closest to the final balance wins. Ties: smaller distance, then whoever
//   locked in their final guess first (earlier guessed_at), then lowest id.
//
// All comparisons run in SQL on DECIMAL(20,8) — never a JS float. Usernames
// are masked before leaving the server.

export type GbStatus = "draft" | "open" | "closed" | "settled";

export interface GbRound {
  id: number;
  hunt_id: number | null;
  title: string;
  prize: string;
  status: GbStatus;
  deadline_at: string | null;
  actual_balance: string | null;
  opened_at: string;
  closed_at: string | null;
  settled_at: string | null;
}

export interface GbGuess {
  maskedName: string;
  amount: string;
  isWinner: boolean;
  offBy: string | null;
  guessedAt: string;
}

const ROUND_COLS = "id, hunt_id, title, prize, status, deadline_at, actual_balance, opened_at, closed_at, settled_at";

// ── chat command ──

const GB_RE = /^!gb\s+\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*$/i;

/**
 * The whole message must be `!gb <amount>`: non-negative, plain notation,
 * optional `$` and correctly grouped thousands commas, ≤ 12 integer digits
 * and ≤ 8 decimals (DECIMAL(20,8)). Anything else — exponents, suffixes,
 * Infinity, extra text, overflow — is ignored. Returns a canonical string.
 */
export function parseGbCommand(content: string): string | null {
  const m = content.trim().match(GB_RE);
  if (!m) return null;
  const raw = m[1].replace(/,/g, "");
  const [intPart, frac] = raw.split(".");
  const int = intPart.replace(/^0+(?=\d)/, "");
  const value = frac !== undefined ? `${int}.${frac}` : int;
  return DECIMAL_20_8.test(value) ? value : null;
}

export interface ChatGuess {
  kickUserId: string | null;
  username: string;
  content: string;
  /** Signed Kick message time (ms). */
  sentAt: Date;
}

export type GuessOutcome = "not_command" | "no_open_round" | "outside_window" | "recorded" | "older_ignored";

function sqlTime(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

export function identityKey(kickUserId: string | null, username: string): string {
  return kickUserId ? `id:${kickUserId}` : `name:${username.toLowerCase()}`;
}

// Called inside the webhook transaction; don't acknowledge failed writes.
export async function recordBalanceGuessIfActive(guess: ChatGuess, conn: PoolConnection): Promise<GuessOutcome> {
  const amount = parseGbCommand(guess.content);
  if (amount === null) return "not_command";
  const [rounds] = await conn.query<RowDataPacket[]>(
    "SELECT id, opened_at, deadline_at FROM gb_rounds WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE"
  );
  const round = rounds[0];
  if (!round) return "no_open_round";
  const sent = sqlTime(guess.sentAt);
  if (sent < String(round.opened_at) || (round.deadline_at && sent > String(round.deadline_at))) return "outside_window";
  // Assignment order matters: amount/username compare against the OLD
  // guessed_at, which is only then advanced.
  const [res] = await conn.query<ResultSetHeader>(
    `INSERT INTO gb_guesses (round_id, kick_user_id, kick_username, identity_key, amount, guessed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       amount = IF(VALUES(guessed_at) >= guessed_at, VALUES(amount), amount),
       kick_username = IF(VALUES(guessed_at) >= guessed_at, VALUES(kick_username), kick_username),
       guessed_at = GREATEST(guessed_at, VALUES(guessed_at))`,
    [round.id, guess.kickUserId, guess.username, identityKey(guess.kickUserId, guess.username), amount, sent]
  );
  // affectedRows: 1 insert, 2 updated, 0 unchanged (older or identical).
  return res.affectedRows === 0 ? "older_ignored" : "recorded";
}

// ── public reads (throw on DB failure) ──

/** The round to feature: open, else closed-awaiting-result, else latest settled. */
export async function getFeaturedRound(): Promise<GbRound | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${ROUND_COLS} FROM gb_rounds WHERE status IN ('open','closed','settled')
     ORDER BY FIELD(status,'open','closed','settled'), COALESCE(settled_at, opened_at) DESC, id DESC LIMIT 1`
  );
  return (rows[0] as GbRound | undefined) ?? null;
}

export async function getCurrentRound(): Promise<GbRound | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${ROUND_COLS} FROM gb_rounds WHERE status IN ('open','closed') ORDER BY FIELD(status,'open','closed'), opened_at DESC LIMIT 1`
  );
  return (rows[0] as GbRound | undefined) ?? null;
}

export async function getRoundById(id: number): Promise<GbRound | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT ${ROUND_COLS} FROM gb_rounds WHERE id = ?`, [id]);
  return (rows[0] as GbRound | undefined) ?? null;
}

export async function getAllRounds(limit = 40): Promise<GbRound[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${ROUND_COLS} FROM gb_rounds ORDER BY FIELD(status,'open','closed','draft','settled'), id DESC LIMIT ?`,
    [limit]
  );
  return rows as GbRound[];
}

export async function countRoundGuesses(roundId: number): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM gb_guesses WHERE round_id = ?", [roundId]);
  return Number(rows[0].n);
}

const RANK_ORDER = "ABS(g.amount - r.actual_balance) ASC, g.guessed_at ASC, g.id ASC";

interface RawGuess {
  kick_username: string;
  amount: string;
  is_winner: number;
  off_by: string | null;
  guessed_at: string;
}

async function queryGuesses(roundId: number, settledOrder: boolean, limit: number, offset: number): Promise<RawGuess[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT g.kick_username, g.amount, g.is_winner, g.guessed_at,
            IF(r.actual_balance IS NULL, NULL, ABS(g.amount - r.actual_balance)) AS off_by
     FROM gb_guesses g JOIN gb_rounds r ON r.id = g.round_id
     WHERE g.round_id = ?
     ORDER BY ${settledOrder ? RANK_ORDER : "g.guessed_at DESC, g.id DESC"}
     LIMIT ? OFFSET ?`,
    [roundId, limit, offset]
  );
  return rows as RawGuess[];
}

/** Ranked by closeness (over ALL guesses, sorted before LIMIT) once settled; newest first otherwise. */
export async function getRoundGuesses(round: GbRound, limit = 100, offset = 0): Promise<GbGuess[]> {
  const rows = await queryGuesses(round.id, round.status === "settled" && round.actual_balance != null, limit, offset);
  return rows.map((r) => ({
    maskedName: maskUsername(String(r.kick_username)),
    amount: String(r.amount),
    isWinner: Boolean(r.is_winner),
    offBy: r.off_by != null ? String(r.off_by) : null,
    guessedAt: String(r.guessed_at),
  }));
}

export interface GbHistoryItem {
  id: number;
  title: string;
  actual_balance: string | null;
  winner: string | null;
  off_by: string | null;
  prize: string;
  settled_at: string;
  guesses: number;
}

export async function getGbHistory(limit = 10): Promise<GbHistoryItem[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT r.id, r.title, r.actual_balance, r.prize, r.settled_at,
            (SELECT COUNT(*) FROM gb_guesses g WHERE g.round_id = r.id) AS guesses,
            w.kick_username AS winner, ABS(w.amount - r.actual_balance) AS off_by
     FROM gb_rounds r
     LEFT JOIN gb_guesses w ON w.round_id = r.id AND w.is_winner = 1
     WHERE r.status = 'settled' ORDER BY r.settled_at DESC, r.id DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    actual_balance: r.actual_balance != null ? String(r.actual_balance) : null,
    winner: r.winner ? maskUsername(String(r.winner)) : null,
    off_by: r.off_by != null ? String(r.off_by) : null,
    prize: r.prize as string,
    settled_at: String(r.settled_at),
    guesses: Number(r.guesses),
  }));
}

// ── admin lifecycle ──

export interface RoundInput {
  title: string;
  prize: string;
  hunt_id: number | null;
  deadline_at: string | null;
}

async function lockRound(conn: PoolConnection, id: number): Promise<GbRound> {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${ROUND_COLS} FROM gb_rounds WHERE id = ? FOR UPDATE`, [id]);
  if (!rows[0]) throw new EventError("round_not_found");
  return rows[0] as GbRound;
}

async function checkHunt(conn: PoolConnection, huntId: number | null): Promise<void> {
  if (huntId == null) return;
  const [rows] = await conn.query<RowDataPacket[]>("SELECT status, opening_started_at FROM bonus_hunt WHERE id = ? LOCK IN SHARE MODE", [huntId]);
  if (!rows[0]) throw new EventError("hunt_not_found");
  if (rows[0].status !== "active") throw new EventError("hunt_not_active");
  if (rows[0].opening_started_at) throw new EventError("hunt_opening_started", "guesses must close before the first bonus is opened");
}

export async function createRound(input: RoundInput): Promise<number> {
  return withTx(async (conn) => {
    await checkHunt(conn, input.hunt_id);
    const [res] = await conn.query<ResultSetHeader>(
      "INSERT INTO gb_rounds (title, prize, hunt_id, deadline_at, status) VALUES (?, ?, ?, ?, 'draft')",
      [input.title, input.prize, input.hunt_id, input.deadline_at]
    );
    return res.insertId;
  });
}

export async function updateRound(id: number, input: RoundInput): Promise<void> {
  await withTx(async (conn) => {
    await checkHunt(conn, input.hunt_id);
    const round = await lockRound(conn, id);
    if (round.status !== "draft") throw new EventError("round_locked");
    await conn.query("UPDATE gb_rounds SET title = ?, prize = ?, hunt_id = ?, deadline_at = ? WHERE id = ?", [input.title, input.prize, input.hunt_id, input.deadline_at, id]);
  });
}

/**
 * Delete a round in any state, with its guesses. An unpaid prize it created
 * goes too (with its Discord ticket); a paid one stays in Admin → Prizes.
 */
export async function deleteRound(id: number): Promise<void> {
  const channels = await withTx(async (conn) => {
    await lockRound(conn, id);
    return deleteRoundInTx(conn, id);
  });
  for (const c of channels) deleteTicketChannel(c);
}

/** Inside a transaction: drop the round (+ guesses by cascade) and its unpaid prize. Returns ticket channels to delete. */
export async function deleteRoundInTx(conn: PoolConnection, id: number): Promise<string[]> {
  const [awards] = await conn.query<RowDataPacket[]>(
    "SELECT id, discord_channel_id FROM prize_awards WHERE source = 'gb' AND source_ref = ? AND status <> 'paid' FOR UPDATE", [`gb:${id}`]);
  if (awards.length) await conn.query("DELETE FROM prize_awards WHERE source = 'gb' AND source_ref = ? AND status <> 'paid'", [`gb:${id}`]);
  await conn.query("DELETE FROM gb_rounds WHERE id = ?", [id]);
  return awards.map((a) => String(a.discord_channel_id ?? "")).filter(Boolean);
}

/** Title / prize can be fixed at any time (the rest only while it's a draft: updateRound). */
export async function renameRound(id: number, title: string, prize: string): Promise<void> {
  await withTx(async (conn) => {
    await lockRound(conn, id);
    await conn.query("UPDATE gb_rounds SET title = ?, prize = ? WHERE id = ?", [title, prize, id]);
  });
}

/** Lock order: app lock → hunt (shared) → round, matching the payout path (hunt → round). */
export async function openRound(id: number): Promise<void> {
  await withTx(async (conn) => {
    await lockApp(conn, "gb");
    const [peek] = await conn.query<RowDataPacket[]>("SELECT hunt_id FROM gb_rounds WHERE id = ?", [id]);
    if (!peek[0]) throw new EventError("round_not_found");
    await checkHunt(conn, peek[0].hunt_id ?? null);
    const round = await lockRound(conn, id);
    if (round.status !== "draft") throw new EventError("round_locked", "only a draft round can be opened");
    if (round.deadline_at) {
      const [past] = await conn.query<RowDataPacket[]>("SELECT ? <= UTC_TIMESTAMP() AS p", [round.deadline_at]);
      if (Number(past[0].p)) throw new EventError("deadline_passed");
    }
    const [open] = await conn.query<RowDataPacket[]>("SELECT id FROM gb_rounds WHERE status = 'open' AND id <> ?", [id]);
    if (open.length) throw new EventError("round_already_open", `#${open[0].id} is open`);
    await conn.query("UPDATE gb_rounds SET status = 'open', opened_at = UTC_TIMESTAMP(3), closed_at = NULL WHERE id = ?", [id]);
  });
}

export async function closeRound(id: number): Promise<void> {
  await withTx(async (conn) => {
    const round = await lockRound(conn, id);
    if (round.status !== "open") throw new EventError("round_not_open");
    await conn.query("UPDATE gb_rounds SET status = 'closed', closed_at = UTC_TIMESTAMP() WHERE id = ?", [id]);
  });
}

export interface SettlementPreview {
  actual: string;
  source: "hunt" | "manual";
  total: number;
  winner: { username: string; amount: string; offBy: string; guessedAt: string } | null;
}

async function resolveActual(conn: PoolConnection, round: GbRound, manual: string | null): Promise<{ actual: string; source: "hunt" | "manual" }> {
  if (round.hunt_id != null) {
    const final = await getHuntFinalBalance(conn, round.hunt_id);
    if (final == null) throw new EventError("hunt_not_final", "finish the linked hunt (all bonuses opened) first");
    return { actual: final, source: "hunt" };
  }
  if (manual == null || !DECIMAL_20_8.test(manual)) throw new EventError("actual_required", "enter the final balance");
  return { actual: manual, source: "manual" };
}

async function findWinner(conn: PoolConnection, roundId: number, actual: string) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, kick_user_id, kick_username, amount, guessed_at, ABS(amount - CAST(? AS DECIMAL(20,8))) AS off_by
     FROM gb_guesses WHERE round_id = ?
     ORDER BY off_by ASC, guessed_at ASC, id ASC LIMIT 1`,
    [actual, roundId]
  );
  return rows[0] ?? null;
}

export async function previewSettlement(id: number, manual: string | null): Promise<SettlementPreview> {
  return withTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${ROUND_COLS} FROM gb_rounds WHERE id = ?`, [id]);
    if (!rows[0]) throw new EventError("round_not_found");
    const round = rows[0] as GbRound;
    const { actual, source } = await resolveActual(conn, round, manual);
    const w = await findWinner(conn, id, actual);
    const [count] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM gb_guesses WHERE round_id = ?", [id]);
    return {
      actual,
      source,
      total: Number(count[0].n),
      winner: w ? { username: String(w.kick_username), amount: String(w.amount), offBy: String(w.off_by), guessedAt: String(w.guessed_at) } : null,
    };
  });
}

/** Freezes the result. Concurrent/replayed calls fail on the status check under the row lock. */
export async function settleRound(id: number, manual: string | null): Promise<{ actual: string; winnerId: number | null }> {
  return withTx(async (conn) => {
    const round = await lockRound(conn, id);
    if (round.status === "settled") throw new EventError("round_settled");
    if (round.status !== "closed") throw new EventError("round_not_closed", "close the round before settling");
    const { actual } = await resolveActual(conn, round, manual);
    const w = await findWinner(conn, id, actual);
    await conn.query("UPDATE gb_guesses SET is_winner = 0 WHERE round_id = ?", [id]);
    if (w) {
      await conn.query("UPDATE gb_guesses SET is_winner = 1 WHERE id = ?", [w.id]);
      await recordAward(conn, { source: "gb", sourceRef: `gb:${id}`, title: round.title || "Guess the Balance", place: 1, winner: String(w.kick_username), winnerKickId: w.kick_user_id ? String(w.kick_user_id) : null, prizeLabel: round.prize });
    }
    await conn.query("UPDATE gb_rounds SET status = 'settled', actual_balance = ?, settled_at = UTC_TIMESTAMP() WHERE id = ?", [actual, id]);
    return { actual, winnerId: w ? Number(w.id) : null };
  });
}

// ── collection health (admin) ──

export interface CollectionStatus {
  kickAppConfigured: boolean;
  broadcasterConfigured: boolean;
  lastWebhookAt: string | null;
  lastGuessAt: string | null;
}

export async function getCollectionStatus(): Promise<CollectionStatus> {
  const pool = getPool();
  const [[seen], [guess]] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT MAX(seen_at) AS t FROM kick_webhook_seen"),
    pool.query<RowDataPacket[]>("SELECT MAX(guessed_at) AS t FROM gb_guesses"),
  ]);
  return {
    kickAppConfigured: Boolean(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET),
    broadcasterConfigured: Boolean(process.env.KICK_BROADCASTER_USER_ID),
    lastWebhookAt: seen[0].t ? String(seen[0].t) : null,
    lastGuessAt: guess[0].t ? String(guess[0].t) : null,
  };
}
