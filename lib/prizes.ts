import "server-only";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./db";
import { maskUsername } from "./mask";
import { EventError, withTx } from "./events/common";

// Prize ledger. Results create 'pending' awards automatically; the admin
// confirms each one once the winner actually received it ('paid') or voids it
// (rerolled giveaway, no-show…). The public "Prizes awarded" total and the
// /prizes page only count paid awards.

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
}

/** Casino usernames (leaderboard / races) are masked publicly; Kick chat handles are public. */
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
  amount?: string | null;
  prizeLabel?: string;
}

/** Idempotent: the same (source, ref) is only recorded once. Call inside the result's transaction. */
export async function recordAward(conn: PoolConnection, a: AwardInput): Promise<void> {
  await conn.query(
    `INSERT IGNORE INTO prize_awards (source, source_ref, title, place, winner, amount, prize_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [a.source, a.sourceRef.slice(0, 96), a.title.slice(0, 191), a.place ?? null, a.winner.slice(0, 191), a.amount ?? parsePrizeAmount(a.prizeLabel), (a.prizeLabel ?? "").slice(0, 120)]
  );
}

const COLS = "id, source, title, place, winner, amount, prize_label, status, note, created_at, paid_at";

export async function listAwards(status: AwardStatus | "all" = "all", limit = 200): Promise<Award[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${COLS} FROM prize_awards ${status === "all" ? "" : "WHERE status = ?"}
     ORDER BY FIELD(status,'pending','paid','void'), created_at DESC, id DESC LIMIT ?`,
    status === "all" ? [limit] : [status, limit]
  );
  return rows as Award[];
}

export interface PublicAward { id: number; source: AwardSource; title: string; place: number | null; winner: string; amount: string | null; prize_label: string; paid_at: string | null }

export async function getPublicAwards(limit = 50, offset = 0): Promise<{ awards: PublicAward[]; total: number; sum: string }> {
  const pool = getPool();
  const [[rows], [agg]] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT ${COLS} FROM prize_awards WHERE status = 'paid' ORDER BY paid_at DESC, id DESC LIMIT ? OFFSET ?`, [limit, offset]),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) n, COALESCE(SUM(amount), 0) s FROM prize_awards WHERE status = 'paid'"),
  ]);
  return {
    awards: (rows as Award[]).map((a) => ({
      id: a.id, source: a.source, title: a.title, place: a.place, amount: a.amount, prize_label: a.prize_label, paid_at: a.paid_at,
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
  const [res] = await getPool().query<ResultSetHeader>("UPDATE prize_awards SET status = 'pending', paid_at = NULL WHERE id = ? AND status IN ('paid','void')", [id]);
  if (!res.affectedRows) throw new EventError("award_not_found");
}

export async function createManualAward(input: { title: string; winner: string; amount: string | null; prizeLabel: string }): Promise<void> {
  await withTx((conn) => recordAward(conn, {
    source: "manual", sourceRef: `m:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    title: input.title, winner: input.winner, amount: input.amount, prizeLabel: input.prizeLabel,
  }));
}
