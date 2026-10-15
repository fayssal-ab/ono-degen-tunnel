import "server-only";
import { after } from "next/server";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./db";
import { maskUsername } from "./mask";
import { EventError, withTx } from "./events/common";
import { deleteTicketChannel, openPrizeTickets, ticketChanged } from "./discordTickets";
import type { Destination, PayoutMethod } from "./payout";

export { PAYOUT_LABEL, PAYOUT_METHODS, type PayoutMethod } from "./payout";

// Prize ledger. Results create 'pending' awards automatically. The winner
// claims it (where to send it) from /account/prizes or the Discord ticket, the
// admin pays and marks it 'paid' (or voids it: rerolled giveaway, no-show…),
// then the winner confirms receipt. The public "Prizes awarded" total and the
// /prizes page only count paid awards. Every change refreshes the ticket.

export type AwardSource = "tournament" | "giveaway" | "race" | "leaderboard" | "gb" | "challenge" | "manual";
export type AwardStatus = "pending" | "paid" | "void";

export interface Award {
  id: number;
  source: AwardSource;
  title: string;
  place: number | null;
  winner: string;
  amount: string | null;
  prize_label: string;
  status: AwardStatus;
  note: string;
  created_at: string;
  paid_at: string | null;
  winner_kick_id: string | null;
  winner_discord_id: string | null;
  payout_method: PayoutMethod | "other" | null;
  payout_username: string;
  payout_network: string;
  claim_note: string;
  claimed_at: string | null;
  received_at: string | null;
  discord_channel_id: string | null;
}

/** Casino usernames (leaderboard / races) are masked publicly and can't be claimed from an account; Kick chat handles are public. */
const MASKED: AwardSource[] = ["leaderboard", "race"];

/** "$50", "50$", "50 USD", "€25.5 cash" → "50.00"; text without an amount → null. */
export function parsePrizeAmount(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/(?:[$€£]\s*(\d{1,9}(?:\.\d{1,2})?))|(?:(\d{1,9}(?:\.\d{1,2})?)\s*(?:[$€£]|usd|usdt|eur|dollars?)(?![a-z]))/i);
  const v = m?.[1] ?? m?.[2];
  return v ? Number(v).toFixed(2) : null;
}

export interface AwardInput {
  source: AwardSource;
  sourceRef: string;
  title: string;
  place?: number | null;
  winner: string;
  /** Kick user id of the winner when the source knows it (claim matching survives renames) */
  winnerKickId?: string | null;
  /** Discord user id when the winner was verified on Discord (manual prizes) */
  winnerDiscordId?: string | null;
  amount?: string | null;
  prizeLabel?: string;
}

/** Idempotent: the same (source, ref) is only recorded once. Call inside the result's transaction. */
export async function recordAward(conn: PoolConnection, a: AwardInput): Promise<void> {
  // Discord ticket once the response is sent (the transaction has committed by then)
  try { after(openPrizeTickets); } catch { /* outside a request (scripts): the cron sync sweep opens it */ }
  await conn.query(
    `INSERT IGNORE INTO prize_awards (source, source_ref, title, place, winner, winner_kick_id, winner_discord_id, amount, prize_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.source, a.sourceRef.slice(0, 96), a.title.slice(0, 191), a.place ?? null, a.winner.slice(0, 191), a.winnerKickId ?? null,
      a.winnerDiscordId ?? null, a.amount ?? parsePrizeAmount(a.prizeLabel), (a.prizeLabel ?? "").slice(0, 120)]
  );
}

const COLS = `id, source, title, place, winner, winner_kick_id, winner_discord_id, amount, prize_label, status, note, created_at, paid_at,
  payout_method, payout_username, payout_network, claim_note, claimed_at, received_at, discord_channel_id`;

export async function listAwards(status: AwardStatus | "all" = "all", limit = 200): Promise<Award[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${COLS} FROM prize_awards ${status === "all" ? "" : "WHERE status = ?"}
     ORDER BY FIELD(status,'pending','paid','void'), created_at DESC, id DESC LIMIT ?`,
    status === "all" ? [limit] : [status, limit]
  );
  return rows as Award[];
}

export interface PublicAward { id: number; source: AwardSource; title: string; place: number | null; winner: string; amount: string | null; prize_label: string; paid_at: string | null; received: boolean }

export async function getPublicAwards(limit = 50, offset = 0): Promise<{ awards: PublicAward[]; total: number; sum: string }> {
  const pool = getPool();
  const [[rows], [agg]] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT ${COLS} FROM prize_awards WHERE status = 'paid' ORDER BY paid_at DESC, id DESC LIMIT ? OFFSET ?`, [limit, offset]),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) n, COALESCE(SUM(amount), 0) s FROM prize_awards WHERE status = 'paid'"),
  ]);
  return {
    awards: (rows as Award[]).map((a) => ({
      id: a.id, source: a.source, title: a.title, place: a.place, amount: a.amount, prize_label: a.prize_label, paid_at: a.paid_at, received: a.received_at != null,
      winner: MASKED.includes(a.source) ? maskUsername(a.winner) : a.winner,
    })),
    total: Number(agg[0].n),
    sum: String(agg[0].s),
  };
}

export async function getPaidTotal(): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT COALESCE(SUM(amount), 0) s FROM prize_awards WHERE status = 'paid'");
  return Number(rows[0].s);
}

export async function confirmPaid(id: number, amount: string | null, note: string): Promise<void> {
  await withTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT status FROM prize_awards WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) throw new EventError("award_not_found");
    if (rows[0].status !== "pending") throw new EventError("award_not_pending");
    await conn.query("UPDATE prize_awards SET status = 'paid', amount = ?, note = ?, paid_at = UTC_TIMESTAMP() WHERE id = ?", [amount, note, id]);
  });
  ticketChanged(id, `💸 **Paid**${amount ? ` — $${amount}` : ""}${note ? ` · ${note}` : ""}. Ticket is now staff-only; the winner confirms receipt on the site.`);
}

export async function voidAward(id: number, note: string): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>("UPDATE prize_awards SET status = 'void', note = ? WHERE id = ? AND status = 'pending'", [note, id]);
  if (!res.affectedRows) throw new EventError("award_not_pending");
  ticketChanged(id, `❌ **Prize voided**${note ? ` — ${note}` : ""}.`);
}

/** Remove rejected (voided) prizes for good, with their Discord ticket. `id` null = all of them. Returns how many. */
export async function deleteVoidedAwards(id: number | null): Promise<number> {
  const where = id == null ? "status = 'void'" : "status = 'void' AND id = ?";
  const args = id == null ? [] : [id];
  return withTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT id, discord_channel_id FROM prize_awards WHERE ${where} FOR UPDATE`, args);
    if (id != null && !rows.length) throw new EventError("award_not_void");
    await conn.query(`DELETE FROM prize_awards WHERE ${where}`, args);
    for (const r of rows) deleteTicketChannel(r.discord_channel_id || null);
    return rows.length;
  });
}

/** Undo a mistaken confirmation (back to pending). */
export async function reopenAward(id: number): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>("UPDATE prize_awards SET status = 'pending', paid_at = NULL, received_at = NULL WHERE id = ? AND status IN ('paid','void')", [id]);
  if (!res.affectedRows) throw new EventError("award_not_found");
  ticketChanged(id, "↩️ Back to **pending** (the team undid the last step).");
}

export async function createManualAward(input: {
  title: string; winner: string; winnerKickId: string | null; winnerDiscordId: string | null; amount: string | null; prizeLabel: string;
}): Promise<void> {
  await withTx((conn) => recordAward(conn, {
    source: "manual", sourceRef: `m:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    title: input.title, winner: input.winner, winnerKickId: input.winnerKickId, winnerDiscordId: input.winnerDiscordId,
    amount: input.amount, prizeLabel: input.prizeLabel,
  }));
}

// ── winner side (account page, Discord ticket) ────────────────────────────
/** The identities an account owns prizes through: its linked Kick and/or Discord. */
export interface PrizeOwner { kickId: string | null; kickName: string | null; discordId: string | null }

/**
 * Prizes owned by the account: by Kick id, by Kick name for rows that only
 * know a name (not Discord-verified ones), or by verified Discord id.
 * Casino-username prizes (leaderboard / race) never match.
 */
function owned(o: PrizeOwner): { sql: string; args: unknown[] } {
  const or: string[] = [];
  const args: unknown[] = [];
  if (o.kickId) { or.push("winner_kick_id = ?"); args.push(o.kickId); }
  if (o.kickName) { or.push("(winner_kick_id IS NULL AND winner_discord_id IS NULL AND LOWER(winner) = LOWER(?))"); args.push(o.kickName); }
  if (o.discordId) { or.push("winner_discord_id = ?"); args.push(o.discordId); }
  return { sql: `source NOT IN ('leaderboard','race') AND (${or.length ? or.join(" OR ") : "FALSE"})`, args };
}

export async function listOwnedAwards(o: PrizeOwner): Promise<Award[]> {
  const w = owned(o);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${COLS} FROM prize_awards WHERE ${w.sql} AND status <> 'void'
     ORDER BY (status = 'pending' AND claimed_at IS NULL) DESC, (status = 'paid' AND received_at IS NULL) DESC, created_at DESC LIMIT 100`,
    w.args
  );
  return rows as Award[];
}

/** Prizes waiting for an action from the winner: claim, or confirm receipt. */
export async function countOwnedActions(o: PrizeOwner): Promise<number> {
  const w = owned(o);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM prize_awards WHERE ${w.sql}
       AND ((status = 'pending' AND claimed_at IS NULL) OR (status = 'paid' AND received_at IS NULL))`,
    w.args
  );
  return Number(rows[0].n);
}

export interface PrizeNotification {
  key: string; kind: "won" | "paid"; at: string; award_id: number; title: string; source: AwardSource;
  place: number | null; amount: string | null; prize_label: string; claimed: boolean; unread: boolean;
}

/** Bell feed: "you won" and "you got paid" events, newest first; unread = after the account last opened it. */
export async function listPrizeNotifications(o: PrizeOwner, seenAt: string | null, limit = 12): Promise<{ items: PrizeNotification[]; unread: number }> {
  const w = owned(o);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT * FROM (
       SELECT CONCAT('w', id) k, 'won' kind, created_at at, id, title, source, place, amount, prize_label, claimed_at IS NOT NULL claimed
         FROM prize_awards WHERE ${w.sql} AND status <> 'void'
       UNION ALL
       SELECT CONCAT('p', id), 'paid', paid_at, id, title, source, place, amount, prize_label, 1
         FROM prize_awards WHERE ${w.sql} AND status = 'paid' AND paid_at IS NOT NULL
     ) ev ORDER BY at DESC, k DESC LIMIT ?`,
    [...w.args, ...w.args, limit]
  );
  const seen = seenAt ? new Date(`${String(seenAt).replace(" ", "T")}Z`).getTime() : 0;
  const items = rows.map((r) => {
    const at = r.at instanceof Date ? r.at.toISOString() : new Date(`${String(r.at).replace(" ", "T")}Z`).toISOString();
    return {
      key: String(r.k), kind: r.kind, at, award_id: Number(r.id), title: String(r.title), source: r.source, place: r.place,
      amount: r.amount, prize_label: String(r.prize_label), claimed: Boolean(Number(r.claimed)), unread: new Date(at).getTime() > seen,
    } as PrizeNotification;
  });
  return { items, unread: items.filter((i) => i.unread).length };
}

async function lockOwned(conn: PoolConnection, id: number, o: PrizeOwner): Promise<Award> {
  const w = owned(o);
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${COLS} FROM prize_awards WHERE id = ? AND ${w.sql} FOR UPDATE`, [id, ...w.args]);
  if (!rows[0]) throw new EventError("award_not_yours");
  return rows[0] as Award;
}

async function writeClaim(conn: PoolConnection, id: number, accountId: number | null, d: Destination, note: string): Promise<void> {
  await conn.query(
    `UPDATE prize_awards SET claim_account_id = COALESCE(?, claim_account_id), payout_method = ?, payout_username = ?, payout_network = ?,
            claim_note = ?, claimed_at = COALESCE(claimed_at, UTC_TIMESTAMP()) WHERE id = ?`,
    [accountId, d.method, d.value.slice(0, 191), d.network, note.slice(0, 255), id]
  );
}

const claimLine = (d: Destination, via: string) =>
  `📨 **Claimed** ${via} — send to **${d.method === "usdc" ? `USDC (${d.network})` : d.method === "stake" ? "Stake" : "Rainbet"}** \`${d.value}\``;

/** Claim (or edit the claim) while unpaid, from the site. */
export async function claimAward(id: number, accountId: number, o: PrizeOwner, d: Destination, note: string): Promise<void> {
  await withTx(async (conn) => {
    const a = await lockOwned(conn, id, o);
    if (a.status !== "pending") throw new EventError("award_not_pending");
    await writeClaim(conn, id, accountId, d, note);
  });
  ticketChanged(id, claimLine(d, "on the website"));
}

/** Claim from the Discord ticket: the ticket member (or staff) picks the destination. */
export async function claimFromDiscord(id: number, discordUserId: string, isStaff: boolean, d: Destination): Promise<void> {
  await withTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT status, discord_user_id FROM prize_awards WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) throw new EventError("award_not_found");
    if (!isStaff && rows[0].discord_user_id !== discordUserId) throw new EventError("award_not_yours");
    if (rows[0].status !== "pending") throw new EventError("award_not_pending");
    const [acc] = await conn.query<RowDataPacket[]>("SELECT account_id FROM user_identities WHERE provider = 'discord' AND provider_user_id = ?", [discordUserId]);
    await writeClaim(conn, id, !isStaff && acc[0] ? Number(acc[0].account_id) : null, d, "");
  });
  ticketChanged(id, claimLine(d, `on Discord by <@${discordUserId}>`));
}

async function markReceived(conn: PoolConnection, a: { id: number; status: string; received_at: unknown }): Promise<void> {
  if (a.status !== "paid") throw new EventError("award_not_paid");
  if (a.received_at) throw new EventError("award_already_received");
  await conn.query("UPDATE prize_awards SET received_at = UTC_TIMESTAMP() WHERE id = ?", [a.id]);
}

export async function confirmReceived(id: number, o: PrizeOwner): Promise<void> {
  await withTx(async (conn) => markReceived(conn, await lockOwned(conn, id, o)));
  ticketChanged(id, "✅ **Received** — the winner confirmed on the website. GG!");
}

export async function confirmReceivedFromDiscord(id: number, discordUserId: string): Promise<void> {
  await withTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT id, status, received_at, discord_user_id FROM prize_awards WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) throw new EventError("award_not_found");
    if (rows[0].discord_user_id !== discordUserId) throw new EventError("award_not_yours");
    await markReceived(conn, rows[0] as { id: number; status: string; received_at: unknown });
  });
  ticketChanged(id, `✅ **Received** — confirmed by <@${discordUserId}>. GG!`);
}
