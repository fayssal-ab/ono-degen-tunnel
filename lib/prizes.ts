import "server-only";
import { after } from "next/server";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./db";
import { maskUsername } from "./mask";
import { EventError, withTx } from "./events/common";
import { openPrizeTickets } from "./discordTickets";

// Prize ledger. Results create 'pending' awards automatically. The winner
// claims it from their account (where to send it), the admin pays and marks
// it 'paid' (or voids it: rerolled giveaway, no-show…), then the winner
// confirms receipt. The public "Prizes awarded" total and the /prizes page
// only count paid awards.

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
  payout_method: PayoutMethod | null;
  payout_username: string;
  claim_note: string;
  claimed_at: string | null;
  received_at: string | null;
}

export type PayoutMethod = "stake" | "rainbet" | "other";
export const PAYOUT_METHODS: PayoutMethod[] = ["stake", "rainbet", "other"];
export const PAYOUT_LABEL: Record<PayoutMethod, string> = { stake: "Stake", rainbet: "Rainbet", other: "Other" };

/** Casino usernames (leaderboard / races) are masked publicly and can't be claimed from a Kick account; Kick chat handles are public. */
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
  amount?: string | null;
  prizeLabel?: string;
}

/** Idempotent: the same (source, ref) is only recorded once. Call inside the result's transaction. */
export async function recordAward(conn: PoolConnection, a: AwardInput): Promise<void> {
  // Discord ticket once the response is sent (the transaction has committed by then)
  try { after(openPrizeTickets); } catch { /* outside a request (scripts): the cron sync sweep opens it */ }
  await conn.query(
    `INSERT IGNORE INTO prize_awards (source, source_ref, title, place, winner, winner_kick_id, amount, prize_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.source, a.sourceRef.slice(0, 96), a.title.slice(0, 191), a.place ?? null, a.winner.slice(0, 191), a.winnerKickId ?? null, a.amount ?? parsePrizeAmount(a.prizeLabel), (a.prizeLabel ?? "").slice(0, 120)]
  );
}

const COLS = "id, source, title, place, winner, winner_kick_id, amount, prize_label, status, note, created_at, paid_at, payout_method, payout_username, claim_note, claimed_at, received_at";

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
}

export async function voidAward(id: number, note: string): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>("UPDATE prize_awards SET status = 'void', note = ? WHERE id = ? AND status = 'pending'", [note, id]);
  if (!res.affectedRows) throw new EventError("award_not_pending");
}

/** Undo a mistaken confirmation (back to pending). */
export async function reopenAward(id: number): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>("UPDATE prize_awards SET status = 'pending', paid_at = NULL, received_at = NULL WHERE id = ? AND status IN ('paid','void')", [id]);
  if (!res.affectedRows) throw new EventError("award_not_found");
}

export async function createManualAward(input: { title: string; winner: string; amount: string | null; prizeLabel: string }): Promise<void> {
  await withTx((conn) => recordAward(conn, {
    source: "manual", sourceRef: `m:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    title: input.title, winner: input.winner, amount: input.amount, prizeLabel: input.prizeLabel,
  }));
}

// ── winner side (account page) ────────────────────────────────────────────
/** The account's linked Kick identity — the only way to own a prize. */
export interface KickOwner { id: string; username: string }

const OWNED = `source NOT IN ('leaderboard','race')
  AND (winner_kick_id = ? OR (winner_kick_id IS NULL AND LOWER(winner) = LOWER(?)))`;

export async function listOwnedAwards(kick: KickOwner): Promise<Award[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${COLS} FROM prize_awards WHERE ${OWNED} AND status <> 'void'
     ORDER BY (status = 'pending' AND claimed_at IS NULL) DESC, (status = 'paid' AND received_at IS NULL) DESC, created_at DESC LIMIT 50`,
    [kick.id, kick.username]
  );
  return rows as Award[];
}

/** Prizes waiting for an action from the winner: claim, or confirm receipt. */
export async function countOwnedActions(kick: KickOwner): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM prize_awards WHERE ${OWNED}
       AND ((status = 'pending' AND claimed_at IS NULL) OR (status = 'paid' AND received_at IS NULL))`,
    [kick.id, kick.username]
  );
  return Number(rows[0].n);
}

async function lockOwned(conn: PoolConnection, id: number, kick: KickOwner): Promise<Award> {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${COLS} FROM prize_awards WHERE id = ? AND ${OWNED} FOR UPDATE`, [id, kick.id, kick.username]);
  if (!rows[0]) throw new EventError("award_not_yours");
  return rows[0] as Award;
}

export interface ClaimInput { method: PayoutMethod; username: string; note: string }

/** Claim (or edit the claim) while unpaid. Records the Kick id so a later rename can't move it. */
export async function claimAward(id: number, accountId: number, kick: KickOwner, c: ClaimInput): Promise<void> {
  await withTx(async (conn) => {
    const a = await lockOwned(conn, id, kick);
    if (a.status !== "pending") throw new EventError("award_not_pending");
    await conn.query(
      `UPDATE prize_awards SET claim_account_id = ?, winner_kick_id = ?, payout_method = ?, payout_username = ?, claim_note = ?,
              claimed_at = COALESCE(claimed_at, UTC_TIMESTAMP()) WHERE id = ?`,
      [accountId, kick.id, c.method, c.username.slice(0, 191), c.note.slice(0, 255), id]
    );
  });
}

export async function confirmReceived(id: number, kick: KickOwner): Promise<void> {
  await withTx(async (conn) => {
    const a = await lockOwned(conn, id, kick);
    if (a.status !== "paid") throw new EventError("award_not_paid");
    if (a.received_at) throw new EventError("award_already_received");
    await conn.query("UPDATE prize_awards SET received_at = UTC_TIMESTAMP() WHERE id = ?", [id]);
  });
}
