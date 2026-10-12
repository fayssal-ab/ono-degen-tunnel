import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { maskUsername } from "./mask";

// Hall of Fame (prompt §5.12): aggregates winners across features. Everything
// is read from frozen/finalised data only (closed periods and races, finished
// tournaments and hunts, settled GB rounds, accepted challenge claims);
// usernames masked before leaving. Readers throw so the page can tell a DB
// failure from an empty record book.

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
  {
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
  }
}

export async function getBigHits(limit = 12): Promise<BigHit[]> {
  {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT e.slot_name, (e.payout / e.bet) AS multiplier, h.title AS hunt_title
       FROM bonus_hunt_entries e JOIN bonus_hunt h ON h.id = e.hunt_id
       WHERE e.bet > 0 AND e.payout IS NOT NULL AND h.status IN ('finished','archived')
       ORDER BY multiplier DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      slot_name: r.slot_name as string,
      multiplier: Number(r.multiplier),
      hunt_title: (r.hunt_title as string) || "Bonus hunt",
    }));
  }
}

export async function getGiveawayWins(limit = 12): Promise<GiveawayWin[]> {
  {
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
  }
}

export async function getChallengeWins(limit = 12): Promise<ChallengeWin[]> {
  {
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
  }
}

export interface RaceWin {
  race_name: string;
  end_at: string;
  maskedName: string;
  wagered: string;
  prize: string;
}

export async function getRaceWins(limit = 12): Promise<RaceWin[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT r.name, r.end_at, e.username, e.wagered, e.prize FROM race_entries e JOIN races r ON r.id = e.race_id
     WHERE r.status = 'closed' AND e.\`rank\` = 1 ORDER BY r.end_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ race_name: String(r.name), end_at: String(r.end_at), maskedName: maskUsername(String(r.username)), wagered: String(r.wagered), prize: String(r.prize) }));
}

export interface TournamentWin {
  title: string;
  prize: string;
  champion: string;
  slot: string;
  finished_at: string;
}

export async function getTournamentWins(limit = 12): Promise<TournamentWin[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT t.title, t.prize, t.finished_at, p.username, p.slot_name FROM ko_tournaments t
     JOIN ko_participants p ON p.id = t.champion_id
     WHERE t.status = 'finished' ORDER BY t.finished_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ title: String(r.title), prize: String(r.prize), champion: String(r.username), slot: String(r.slot_name), finished_at: String(r.finished_at) }));
}

export interface GbWin {
  title: string;
  prize: string;
  maskedName: string;
  off_by: string;
}

export async function getGbWins(limit = 12): Promise<GbWin[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT r.title, r.prize, g.kick_username, ABS(g.amount - r.actual_balance) AS off_by FROM gb_rounds r
     JOIN gb_guesses g ON g.round_id = r.id AND g.is_winner = 1
     WHERE r.status = 'settled' ORDER BY r.settled_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ title: String(r.title), prize: String(r.prize), maskedName: maskUsername(String(r.kick_username)), off_by: String(r.off_by) }));
}
