import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { d } from "./money";
import { EventError, withTx, lockApp } from "./events/common";

// Bonus hunt (prompt §5.6). Algorithm ported from JBALLIN: the hunt collects
// bonuses with a bet each; payouts fill in as they're opened; break-even is
// the average multiplier still needed across the UNOPENED bonuses.
//
// Money conventions (MVP, shown as-is in the UI labels):
// - start balance = the reference bankroll the streamer announces;
// - sum of bets   = the bet size of each collected bonus, added up. It is NOT
//   the cost of buying the hunt and we never derive a cost from it;
// - final balance = the sum of all payouts once every bonus is opened (no
//   separate leftover balance is tracked);
// - profit        = final balance − start balance.
//
// Lifecycle: one hunt is 'active' at a time. While no payout has been entered
// the bonus list is editable. The first payout sets opening_started_at, locks
// the list and closes any open GB round linked to the hunt (same transaction).
// Finishing requires every bonus opened (a 0 payout counts as opened).

export interface HuntEntry {
  id: number;
  position: number;
  slot_name: string;
  provider: string | null;
  image_url: string | null;
  bet: string;
  payout: string | null;
}

export interface Hunt {
  id: number;
  title: string;
  start_balance: string;
  status: "active" | "finished" | "archived";
  image_url: string | null;
  created_at: string;
  opening_started_at: string | null;
  finished_at: string | null;
}

export interface HuntStats {
  count: number;
  opened: number;
  totalCost: string; // sum of bets (kept for older callers)
  sumBets: string;
  currentWin: string; // sum of payouts so far
  bestHit: { entry: HuntEntry; multiplier: number } | null;
  worstHit: { entry: HuntEntry; multiplier: number } | null;
  // avg multiplier needed on the remaining (unopened) bonuses to break even
  breakEvenX: number | null;
  // sum of payouts once all are opened (MVP convention, see header)
  finalBalance: string | null;
  // finalBalance − start balance, once complete
  profit: string | null;
  remaining: number;
  complete: boolean;
}

// Reads throw on DB failure so pages can show an error instead of "no hunt".
export async function getActiveHunt(): Promise<Hunt | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT * FROM bonus_hunt WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
  );
  return (rows[0] as Hunt | undefined) ?? null;
}

export async function getHuntById(id: number): Promise<Hunt | null> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT * FROM bonus_hunt WHERE id = ?", [id]);
  return (rows[0] as Hunt | undefined) ?? null;
}

export async function getAllHunts(limit = 40): Promise<Hunt[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT * FROM bonus_hunt ORDER BY FIELD(status,'active','finished','archived'), created_at DESC LIMIT ?",
    [limit]
  );
  return rows as Hunt[];
}

export async function getHuntEntries(huntId: number): Promise<HuntEntry[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, position, slot_name, provider, image_url, bet, payout FROM bonus_hunt_entries WHERE hunt_id = ? ORDER BY position ASC",
    [huntId]
  );
  return rows as HuntEntry[];
}

export function computeHuntStats(startBalance: string, entries: HuntEntry[]): HuntStats {
  const opened = entries.filter((e) => e.payout !== null);
  const totalCost = entries.reduce((s, e) => s.plus(d(e.bet)), d(0));
  const currentWin = opened.reduce((s, e) => s.plus(d(e.payout!)), d(0));

  let best: HuntStats["bestHit"] = null;
  let worst: HuntStats["worstHit"] = null;
  for (const e of opened) {
    const bet = d(e.bet);
    if (bet.lte(0)) continue;
    const mult = d(e.payout!).div(bet).toNumber();
    if (!best || mult > best.multiplier) best = { entry: e, multiplier: mult };
    if (!worst || mult < worst.multiplier) worst = { entry: e, multiplier: mult };
  }

  const remaining = entries.filter((e) => e.payout === null);
  const remainingCost = remaining.reduce((s, e) => s.plus(d(e.bet)), d(0));
  const spentAll = d(startBalance); // starting balance is the bankroll
  // need = (start balance - current win) to recover, spread over remaining bets
  const need = spentAll.minus(currentWin);
  const breakEvenX =
    remaining.length > 0 && remainingCost.gt(0) ? Math.max(0, need.div(remainingCost).toNumber()) : null;

  const complete = entries.length > 0 && remaining.length === 0;
  const finalBalance = complete ? currentWin.toFixed(2) : null;

  return {
    count: entries.length,
    opened: opened.length,
    remaining: remaining.length,
    totalCost: totalCost.toFixed(2),
    sumBets: totalCost.toFixed(2),
    profit: complete ? currentWin.minus(d(startBalance)).toFixed(2) : null,
    currentWin: currentWin.toFixed(2),
    bestHit: best,
    worstHit: worst,
    breakEvenX,
    finalBalance,
    complete,
  };
}

export interface HuntHistoryItem {
  id: number;
  title: string;
  start_balance: string;
  finished_at: string | null;
  entries: number;
  final_balance: string | null;
  best_multiplier: number | null;
}

export async function getHuntHistory(limit = 12): Promise<HuntHistoryItem[]> {
  {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT h.id, h.title, h.start_balance, h.finished_at,
              COUNT(e.id) AS entries, SUM(e.payout) AS final_balance,
              MAX(CASE WHEN e.bet > 0 AND e.payout IS NOT NULL THEN e.payout / e.bet END) AS best_multiplier
       FROM bonus_hunt h
       LEFT JOIN bonus_hunt_entries e ON e.hunt_id = h.id
       WHERE h.status IN ('finished','archived')
       GROUP BY h.id
       ORDER BY h.finished_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      id: r.id as number,
      title: r.title as string,
      start_balance: String(r.start_balance),
      finished_at: (r.finished_at as string) ?? null,
      entries: Number(r.entries),
      final_balance: r.final_balance != null ? String(r.final_balance) : null,
      best_multiplier: r.best_multiplier != null ? Number(r.best_multiplier) : null,
    }));
  }
}

// ── admin lifecycle ──

async function lockHunt(conn: PoolConnection, id: number): Promise<Hunt> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM bonus_hunt WHERE id = ? FOR UPDATE", [id]);
  if (!rows[0]) throw new EventError("hunt_not_found");
  return rows[0] as Hunt;
}

async function lockEditableHunt(conn: PoolConnection, id: number): Promise<Hunt> {
  const hunt = await lockHunt(conn, id);
  if (hunt.status !== "active") throw new EventError("hunt_not_active");
  if (hunt.opening_started_at) throw new EventError("hunt_opening_started");
  return hunt;
}

export async function createHunt(input: { title: string; start_balance: string; image_url: string }): Promise<number> {
  return withTx(async (conn) => {
    await lockApp(conn, "hunt");
    const [active] = await conn.query<RowDataPacket[]>("SELECT id FROM bonus_hunt WHERE status = 'active' LIMIT 1");
    if (active.length) throw new EventError("hunt_already_active", `#${active[0].id} is still active`);
    const [res] = await conn.query<ResultSetHeader>(
      "INSERT INTO bonus_hunt (title, start_balance, image_url, status) VALUES (?, ?, ?, 'active')",
      [input.title, input.start_balance, input.image_url || null]
    );
    return res.insertId;
  });
}

export async function updateHunt(id: number, input: { title: string; start_balance: string }): Promise<void> {
  await withTx(async (conn) => {
    await lockEditableHunt(conn, id);
    await conn.query("UPDATE bonus_hunt SET title = ?, start_balance = ? WHERE id = ?", [input.title, input.start_balance, id]);
  });
}

export interface HuntEntryInput {
  slot_name: string;
  provider: string;
  bet: string;
  image_url: string;
}

export async function addHuntEntry(huntId: number, input: HuntEntryInput): Promise<void> {
  await withTx(async (conn) => {
    await lockEditableHunt(conn, huntId);
    const [count] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS p FROM bonus_hunt_entries WHERE hunt_id = ?", [huntId]);
    if (Number(count[0].n) >= 500) throw new EventError("hunt_too_many_entries");
    await conn.query(
      "INSERT INTO bonus_hunt_entries (hunt_id, slot_name, provider, bet, image_url, position) VALUES (?, ?, ?, ?, ?, ?)",
      [huntId, input.slot_name, input.provider, input.bet, input.image_url || null, Number(count[0].p) + 1]
    );
  });
}

export async function updateHuntEntry(huntId: number, entryId: number, input: HuntEntryInput): Promise<void> {
  await withTx(async (conn) => {
    await lockEditableHunt(conn, huntId);
    const [res] = await conn.query<ResultSetHeader>(
      "UPDATE bonus_hunt_entries SET slot_name = ?, provider = ?, bet = ?, image_url = ? WHERE id = ? AND hunt_id = ?",
      [input.slot_name, input.provider, input.bet, input.image_url || null, entryId, huntId]
    );
    if (!res.affectedRows) throw new EventError("entry_not_found");
  });
}

export async function removeHuntEntry(huntId: number, entryId: number): Promise<void> {
  await withTx(async (conn) => {
    await lockEditableHunt(conn, huntId);
    const [res] = await conn.query<ResultSetHeader>("DELETE FROM bonus_hunt_entries WHERE id = ? AND hunt_id = ?", [entryId, huntId]);
    if (!res.affectedRows) throw new EventError("entry_not_found");
  });
}

/** Swap an entry with its neighbour (opening order). */
export async function moveHuntEntry(huntId: number, entryId: number, direction: "up" | "down"): Promise<void> {
  await withTx(async (conn) => {
    await lockEditableHunt(conn, huntId);
    const [rows] = await conn.query<RowDataPacket[]>("SELECT id FROM bonus_hunt_entries WHERE hunt_id = ? ORDER BY position, id FOR UPDATE", [huntId]);
    const ids = rows.map((r) => Number(r.id));
    const i = ids.indexOf(entryId);
    if (i < 0) throw new EventError("entry_not_found");
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (let k = 0; k < ids.length; k++) await conn.query("UPDATE bonus_hunt_entries SET position = ? WHERE id = ?", [k + 1, ids[k]]);
  });
}

/**
 * Record (or correct) a payout, zero included. The first payout of the hunt
 * starts the opening phase and closes any open GB round linked to it.
 * Lock order is always hunt → gb round (GB open uses the same order).
 */
export async function setHuntPayout(huntId: number, entryId: number, payout: string): Promise<{ closedRounds: number }> {
  return withTx(async (conn) => {
    const hunt = await lockHunt(conn, huntId);
    if (hunt.status !== "active") throw new EventError("hunt_not_active");
    const [res] = await conn.query<ResultSetHeader>("UPDATE bonus_hunt_entries SET payout = ? WHERE id = ? AND hunt_id = ?", [payout, entryId, huntId]);
    if (!res.affectedRows) throw new EventError("entry_not_found");
    let closedRounds = 0;
    if (!hunt.opening_started_at) {
      await conn.query("UPDATE bonus_hunt SET opening_started_at = UTC_TIMESTAMP() WHERE id = ?", [huntId]);
      const [open] = await conn.query<RowDataPacket[]>("SELECT id FROM gb_rounds WHERE hunt_id = ? AND status = 'open' FOR UPDATE", [huntId]);
      if (open.length) {
        const [closed] = await conn.query<ResultSetHeader>(
          "UPDATE gb_rounds SET status = 'closed', closed_at = UTC_TIMESTAMP() WHERE hunt_id = ? AND status = 'open'",
          [huntId]
        );
        closedRounds = closed.affectedRows;
      }
    }
    return { closedRounds };
  });
}

export async function finishHunt(huntId: number): Promise<void> {
  await withTx(async (conn) => {
    const hunt = await lockHunt(conn, huntId);
    if (hunt.status !== "active") throw new EventError("hunt_not_active");
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n, SUM(payout IS NULL) AS unopened FROM bonus_hunt_entries WHERE hunt_id = ?",
      [huntId]
    );
    if (Number(rows[0].n) === 0) throw new EventError("hunt_empty");
    if (Number(rows[0].unopened) > 0) throw new EventError("hunt_unopened_bonuses", `${rows[0].unopened} bonus(es) still unopened`);
    await conn.query("UPDATE bonus_hunt SET status = 'finished', finished_at = UTC_TIMESTAMP() WHERE id = ?", [huntId]);
  });
}

export async function archiveHunt(huntId: number): Promise<void> {
  await withTx(async (conn) => {
    const hunt = await lockHunt(conn, huntId);
    if (hunt.status !== "finished") throw new EventError("hunt_not_finished");
    await conn.query("UPDATE bonus_hunt SET status = 'archived' WHERE id = ?", [huntId]);
  });
}

export async function deleteHunt(huntId: number): Promise<void> {
  await withTx(async (conn) => {
    await lockEditableHunt(conn, huntId);
    const [rounds] = await conn.query<RowDataPacket[]>("SELECT id FROM gb_rounds WHERE hunt_id = ? AND status <> 'draft' LIMIT 1", [huntId]);
    if (rounds.length) throw new EventError("hunt_has_gb_round");
    await conn.query("DELETE FROM bonus_hunt WHERE id = ?", [huntId]);
  });
}

/** Final balance of a finished hunt under the MVP convention (sum of payouts). */
export async function getHuntFinalBalance(conn: PoolConnection, huntId: number): Promise<string | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT h.status, COUNT(e.id) AS n, SUM(e.payout IS NULL) AS unopened, COALESCE(SUM(e.payout), 0) AS total FROM bonus_hunt h LEFT JOIN bonus_hunt_entries e ON e.hunt_id = h.id WHERE h.id = ? GROUP BY h.id, h.status LOCK IN SHARE MODE",
    [huntId]
  );
  const r = rows[0];
  if (!r || !["finished", "archived"].includes(String(r.status)) || Number(r.n) === 0 || Number(r.unopened) > 0) return null;
  return d(String(r.total)).toFixed(8);
}
