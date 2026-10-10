import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { maskUsername } from "./mask";

// Hall of Fame (prompt §5.12): aggregates winners across features. Everything
// is read from frozen/archived data; usernames masked before leaving.

export interface Champion {
  period_title: string;
  end_at: string;
  maskedName: string;
  wagered: string;
  prize: string;
}
export interface BigHit {
  slot_name: string;
  multiplier: number;
  hunt_title: string;
}
export interface GiveawayWin {
  maskedName: string;
  prize: string;
  giveaway_title: string;
  drawn_at: string;
}
export interface ChallengeWin {
  slot_name: string;
  multiplier: string;
  prize: string;
  maskedName: string;
}

export async function getChampions(limit = 12): Promise<Champion[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT p.title AS period_title, p.end_at, fr.username, fr.wagered, fr.prize
       FROM final_results fr JOIN periods p ON p.id = fr.period_id
       WHERE fr.\`rank\` = 1 ORDER BY p.end_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      period_title: (r.period_title as string) || "Monthly",
      end_at: String(r.end_at),
      maskedName: maskUsername(String(r.username)),
      wagered: String(r.wagered),
      prize: String(r.prize),
    }));
  } catch {
    return [];
  }
}

export async function getBigHits(limit = 12): Promise<BigHit[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT e.slot_name, (e.payout / e.bet) AS multiplier, h.title AS hunt_title
       FROM bonus_hunt_entries e JOIN bonus_hunt h ON h.id = e.hunt_id
       WHERE e.bet > 0 AND e.payout IS NOT NULL
       ORDER BY multiplier DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      slot_name: r.slot_name as string,
      multiplier: Number(r.multiplier),
      hunt_title: (r.hunt_title as string) || "Bonus hunt",
    }));
  } catch {
    return [];
  }
}

export async function getGiveawayWins(limit = 12): Promise<GiveawayWin[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT w.kick_username, w.prize, w.drawn_at, g.title AS giveaway_title
       FROM giveaway_winners w JOIN giveaways g ON g.id = w.giveaway_id
       ORDER BY w.drawn_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      maskedName: maskUsername(String(r.kick_username)),
      prize: r.prize as string,
      giveaway_title: r.giveaway_title as string,
      drawn_at: String(r.drawn_at),
    }));
  } catch {
    return [];
  }
}

export async function getChallengeWins(limit = 12): Promise<ChallengeWin[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT slot_name, required_multiplier, prize, claimed_by FROM challenges
       WHERE status = 'claimed' AND claimed_by IS NOT NULL ORDER BY claimed_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      slot_name: r.slot_name as string,
      multiplier: String(r.required_multiplier),
      prize: r.prize as string,
      maskedName: maskUsername(String(r.claimed_by)),
    }));
  } catch {
    return [];
  }
}
