import "server-only";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { maskUsername } from "./mask";

// Guess the Balance (prompt §5.7). Algorithm ported from JBALLIN's prediction:
// viewers type `!gb <amount>` in Kick chat (one guess per user, latest wins),
// closest to the final balance wins when the round settles. Usernames are
// masked before leaving the server.

export interface GbRound {
  id: number;
  title: string;
  prize: string;
  status: "open" | "closed" | "settled";
  actual_balance: string | null;
  opened_at: string;
}

export interface GbGuess {
  maskedName: string;
  amount: string;
  isWinner: boolean;
  offBy: number | null;
}

export const GB_COMMAND_RE = /^!gb\s+\$?(\d+(?:\.\d+)?)/i;

// Called inside the webhook transaction; don't acknowledge failed writes.
export async function recordBalanceGuessIfActive(username: string, content: string, conn: PoolConnection): Promise<void> {
  const match = content.trim().match(GB_COMMAND_RE);
  if (!match) return;
  const [rounds] = await conn.query<RowDataPacket[]>("SELECT id FROM gb_rounds WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE");
  if (!rounds[0]) return;
  await conn.query(
    `INSERT INTO gb_guesses (round_id, kick_username, amount) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE amount = VALUES(amount)`, [rounds[0].id, username, match[1]]
  );
}

export async function getCurrentRound(): Promise<GbRound | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT id, title, prize, status, actual_balance, opened_at FROM gb_rounds WHERE status IN ('open','closed') ORDER BY opened_at DESC LIMIT 1"
    );
    return (rows[0] as GbRound | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function getLatestSettledRound(): Promise<GbRound | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT id, title, prize, status, actual_balance, opened_at FROM gb_rounds WHERE status = 'settled' ORDER BY settled_at DESC LIMIT 1"
    );
    return (rows[0] as GbRound | undefined) ?? null;
  } catch {
    return null;
  }
}

// Guesses for a round, masked, ranked by closeness when the actual is known.
export async function getRoundGuesses(round: GbRound, limit = 100): Promise<GbGuess[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT kick_username, amount, is_winner FROM gb_guesses WHERE round_id = ? ORDER BY created_at ASC LIMIT ?",
    [round.id, limit]
  );
  const actual = round.actual_balance != null ? Number(round.actual_balance) : null;
  const guesses = rows.map((r) => ({
    maskedName: maskUsername(String(r.kick_username)),
    amount: String(r.amount),
    isWinner: Boolean(r.is_winner),
    offBy: actual != null ? Math.abs(Number(r.amount) - actual) : null,
  }));
  if (actual != null) guesses.sort((a, b) => (a.offBy ?? 0) - (b.offBy ?? 0));
  return guesses;
}

export interface GbHistoryItem {
  id: number;
  title: string;
  actual_balance: string | null;
  winner: string | null;
  prize: string;
  settled_at: string;
}

export async function getGbHistory(limit = 10): Promise<GbHistoryItem[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT r.id, r.title, r.actual_balance, r.prize, r.settled_at,
              (SELECT g.kick_username FROM gb_guesses g WHERE g.round_id = r.id AND g.is_winner = 1 LIMIT 1) AS winner
       FROM gb_rounds r WHERE r.status = 'settled' ORDER BY r.settled_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      id: r.id as number,
      title: r.title as string,
      actual_balance: r.actual_balance != null ? String(r.actual_balance) : null,
      winner: r.winner ? maskUsername(String(r.winner)) : null,
      prize: r.prize as string,
      settled_at: String(r.settled_at),
    }));
  } catch {
    return [];
  }
}
