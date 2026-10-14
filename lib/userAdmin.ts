import "server-only";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getPool } from "./db";
import { EventError } from "./events/common";

// Admin → Users: list / search viewer accounts, ban, sign out, delete.

export interface UserRow {
  id: number; display_name: string; avatar: string; created_at: string; last_login_at: string | null;
  banned: number; banned_reason: string;
  kick_id: string | null; kick_name: string | null; discord_id: string | null; discord_name: string | null;
  payout_method: string | null; stake_username: string; rainbet_username: string; usdc_address: string; usdc_network: string;
  sessions: number; prizes_won: number; prizes_open: number; prizes_paid: number; won_amount: string; paid_amount: string;
}

export interface UserStats { total: number; kick: number; discord: number; both: number; new7: number; banned: number; active24: number; withWallet: number; winners: number }

/** Prizes owned by the row's account (same rule as lib/prizes owned()): Kick id, Kick name, or verified Discord id. */
const OWNS = `pa.source NOT IN ('leaderboard','race') AND (
    (k.provider_user_id IS NOT NULL AND pa.winner_kick_id = k.provider_user_id)
    OR (k.username IS NOT NULL AND pa.winner_kick_id IS NULL AND pa.winner_discord_id IS NULL AND LOWER(pa.winner) = LOWER(k.username))
    OR (d.provider_user_id IS NOT NULL AND pa.winner_discord_id = d.provider_user_id))`;
const PRIZES = (what: string, status: string) => `(SELECT ${what} FROM prize_awards pa WHERE ${OWNS} AND pa.status ${status})`;

export async function listUsers(opts: { q?: string; id?: number; filter?: "all" | "banned" | "kick" | "discord"; limit: number; offset: number }): Promise<{ rows: UserRow[]; total: number }> {
  const where: string[] = [];
  const args: unknown[] = [];
  const q = opts.q?.trim();
  if (q) {
    where.push(`(a.display_name LIKE ? OR k.username LIKE ? OR d.username LIKE ? OR k.provider_user_id = ? OR d.provider_user_id = ?
      OR a.stake_username LIKE ? OR a.rainbet_username LIKE ? OR a.usdc_address = ? OR a.id = ?)`);
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like, q, q, like, like, q, /^\d+$/.test(q) ? Number(q) : 0);
  }
  if (opts.id != null) { where.push("a.id = ?"); args.push(opts.id); }
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
      `SELECT a.id, a.display_name, a.avatar, a.created_at, a.last_login_at, a.banned, a.banned_reason,
              a.payout_method, a.stake_username, a.rainbet_username, a.usdc_address, a.usdc_network,
              k.provider_user_id AS kick_id, k.username AS kick_name, d.provider_user_id AS discord_id, d.username AS discord_name,
              (SELECT COUNT(*) FROM user_sessions s WHERE s.account_id = a.id AND s.expires_at > CURRENT_TIMESTAMP) AS sessions,
              ${PRIZES("COUNT(*)", "<> 'void'")} AS prizes_won,
              ${PRIZES("COUNT(*)", "= 'pending'")} AS prizes_open,
              ${PRIZES("COUNT(*)", "= 'paid'")} AS prizes_paid,
              ${PRIZES("COALESCE(SUM(pa.amount), 0)", "<> 'void'")} AS won_amount,
              ${PRIZES("COALESCE(SUM(pa.amount), 0)", "= 'paid'")} AS paid_amount
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
            SUM(a.banned) banned,
            SUM(a.last_login_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)) active24,
            SUM(a.stake_username <> '' OR a.rainbet_username <> '' OR a.usdc_address <> '') with_wallet,
            (SELECT COUNT(DISTINCT pa.claim_account_id) FROM prize_awards pa WHERE pa.claim_account_id IS NOT NULL) winners
       FROM user_accounts a`);
  const r = rows[0];
  const n = (v: unknown) => Number(v ?? 0);
  return {
    total: n(r.total), kick: n(r.kick), discord: n(r.discord), both: n(r.both_), new7: n(r.new7), banned: n(r.banned),
    active24: n(r.active24), withWallet: n(r.with_wallet), winners: n(r.winners),
  };
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

export interface UserDetail {
  user: UserRow;
  identities: { provider: "kick" | "discord"; provider_user_id: string; username: string; avatar: string; linked_at: string; updated_at: string }[];
  sessions: { created_at: string; expires_at: string }[];
  prizes: { id: number; source: string; title: string; place: number | null; amount: string | null; prize_label: string; status: string;
    created_at: string; claimed_at: string | null; paid_at: string | null; received_at: string | null;
    payout_method: string | null; payout_username: string; payout_network: string; discord_channel_id: string | null }[];
}

/** Everything about one account for Admin → Users → detail. */
export async function getUserDetail(id: number): Promise<UserDetail | null> {
  const user = (await listUsers({ id, limit: 1, offset: 0 })).rows[0];
  if (!user) return null;
  const pool = getPool();
  const [[identities], [sessions], [prizes]] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT provider, provider_user_id, username, avatar, linked_at, updated_at FROM user_identities WHERE account_id = ? ORDER BY linked_at", [id]),
    pool.query<RowDataPacket[]>("SELECT created_at, expires_at FROM user_sessions WHERE account_id = ? AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 20", [id]),
    pool.query<RowDataPacket[]>(
      `SELECT pa.id, pa.source, pa.title, pa.place, pa.amount, pa.prize_label, pa.status, pa.created_at, pa.claimed_at, pa.paid_at, pa.received_at,
              pa.payout_method, pa.payout_username, pa.payout_network, pa.discord_channel_id
         FROM prize_awards pa
         LEFT JOIN user_identities k ON k.account_id = ? AND k.provider = 'kick'
         LEFT JOIN user_identities d ON d.account_id = ? AND d.provider = 'discord'
        WHERE (${OWNS}) OR pa.claim_account_id = ?
        ORDER BY pa.created_at DESC LIMIT 100`, [id, id, id]),
  ]);
  return { user, identities: identities as UserDetail["identities"], sessions: sessions as UserDetail["sessions"], prizes: prizes as UserDetail["prizes"] };
}
