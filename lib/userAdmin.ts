import "server-only";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getPool } from "./db";
import { EventError } from "./events/common";

// Admin → Users: list / search viewer accounts, ban, sign out, delete.

export interface UserRow {
  id: number; display_name: string; avatar: string; created_at: string; last_login_at: string | null;
  banned: number; banned_reason: string;
  kick_id: string | null; kick_name: string | null; discord_name: string | null;
  payout_method: string | null; payout_username: string;
  sessions: number; prizes_won: number; prizes_open: number; prizes_paid: number;
}

export interface UserStats { total: number; kick: number; discord: number; both: number; new7: number; banned: number }

const PRIZES = (status: string) => `(SELECT COUNT(*) FROM prize_awards pa WHERE pa.source NOT IN ('leaderboard','race') AND pa.status ${status}
  AND (pa.winner_kick_id = k.provider_user_id OR (pa.winner_kick_id IS NULL AND LOWER(pa.winner) = LOWER(k.username))))`;

export async function listUsers(opts: { q?: string; filter?: "all" | "banned" | "kick" | "discord"; limit: number; offset: number }): Promise<{ rows: UserRow[]; total: number }> {
  const where: string[] = [];
  const args: unknown[] = [];
  const q = opts.q?.trim();
  if (q) {
    where.push("(a.display_name LIKE ? OR k.username LIKE ? OR d.username LIKE ? OR k.provider_user_id = ? OR d.provider_user_id = ?)");
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like, q, q);
  }
  if (opts.filter === "banned") where.push("a.banned = 1");
  if (opts.filter === "kick") where.push("k.provider_user_id IS NOT NULL");
  if (opts.filter === "discord") where.push("d.provider_user_id IS NOT NULL");
  const from = `FROM user_accounts a
    LEFT JOIN user_identities k ON k.account_id = a.id AND k.provider = 'kick'
    LEFT JOIN user_identities d ON d.account_id = a.id AND d.provider = 'discord'
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
  const pool = getPool();
  const [[rows], [cnt]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT a.id, a.display_name, a.avatar, a.created_at, a.last_login_at, a.banned, a.banned_reason, a.payout_method, a.payout_username,
              k.provider_user_id AS kick_id, k.username AS kick_name, d.username AS discord_name,
              (SELECT COUNT(*) FROM user_sessions s WHERE s.account_id = a.id AND s.expires_at > CURRENT_TIMESTAMP) AS sessions,
              IF(k.provider_user_id IS NULL, 0, ${PRIZES("<> 'void'")}) AS prizes_won,
              IF(k.provider_user_id IS NULL, 0, ${PRIZES("= 'pending'")}) AS prizes_open,
              IF(k.provider_user_id IS NULL, 0, ${PRIZES("= 'paid'")}) AS prizes_paid
         ${from} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
      [...args, opts.limit, opts.offset]),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) n ${from}`, args),
  ]);
  return { rows: rows as UserRow[], total: Number(cnt[0].n) };
}

export async function getUserStats(): Promise<UserStats> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) total,
            SUM(EXISTS(SELECT 1 FROM user_identities i WHERE i.account_id = a.id AND i.provider = 'kick')) kick,
            SUM(EXISTS(SELECT 1 FROM user_identities i WHERE i.account_id = a.id AND i.provider = 'discord')) discord,
            SUM((SELECT COUNT(*) FROM user_identities i WHERE i.account_id = a.id) = 2) both_,
            SUM(a.created_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)) new7,
            SUM(a.banned) banned
       FROM user_accounts a`);
  const r = rows[0];
  return { total: Number(r.total), kick: Number(r.kick ?? 0), discord: Number(r.discord ?? 0), both: Number(r.both_ ?? 0), new7: Number(r.new7 ?? 0), banned: Number(r.banned ?? 0) };
}

export async function setBanned(id: number, banned: boolean, reason: string): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>(
    "UPDATE user_accounts SET banned = ?, banned_reason = ?, banned_at = IF(?, UTC_TIMESTAMP(), NULL) WHERE id = ?",
    [banned ? 1 : 0, banned ? reason.slice(0, 255) : "", banned, id]);
  if (!res.affectedRows) throw new EventError("user_not_found");
  if (banned) await signOutEverywhere(id);
}

export async function signOutEverywhere(id: number): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>("DELETE FROM user_sessions WHERE account_id = ?", [id]);
  return res.affectedRows;
}

/** Deletes the account, its identities and sessions. Prizes stay in the ledger (they belong to the Kick username). */
export async function deleteUser(id: number): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>("DELETE FROM user_accounts WHERE id = ?", [id]);
  if (!res.affectedRows) throw new EventError("user_not_found");
  await getPool().query("UPDATE prize_awards SET claim_account_id = NULL WHERE claim_account_id = ?", [id]);
}
