import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { d } from "./money";

// Bonus hunt (prompt §5.6). Algorithm ported from JBALLIN: the hunt collects
// bonuses with a bet each; payouts fill in as they're opened; break-even is
// the average multiplier still needed across the UNOPENED bonuses.

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
  finished_at: string | null;
}

export interface HuntStats {
  count: number;
  opened: number;
  totalCost: string; // sum of bets
  currentWin: string; // sum of payouts so far
  bestHit: { entry: HuntEntry; multiplier: number } | null;
  worstHit: { entry: HuntEntry; multiplier: number } | null;
  // avg multiplier needed on the remaining (unopened) bonuses to break even
  breakEvenX: number | null;
  // running profit vs start balance once all are opened
  finalBalance: string | null;
  complete: boolean;
}

export async function getActiveHunt(): Promise<Hunt | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT * FROM bonus_hunt WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    );
    return (rows[0] as Hunt | undefined) ?? null;
  } catch {
    return null;
  }
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
    totalCost: totalCost.toFixed(2),
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
  best_multiplier: number | null;
}

export async function getHuntHistory(limit = 12): Promise<HuntHistoryItem[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT h.id, h.title, h.start_balance, h.finished_at,
              COUNT(e.id) AS entries,
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
      best_multiplier: r.best_multiplier != null ? Number(r.best_multiplier) : null,
    }));
  } catch {
    return [];
  }
}
