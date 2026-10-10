import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { maskUsername } from "./mask";

export interface Challenge {
  id: number;
  slot_name: string;
  provider: string | null;
  image_url: string | null;
  required_multiplier: string;
  min_bet: string;
  prize: string;
  status: "open" | "claimed" | "expired";
  claimedBy: string | null; // masked
  expires_at: string | null;
}

export async function getChallenges(): Promise<Challenge[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT id, slot_name, provider, image_url, required_multiplier, min_bet, prize, status, claimed_by, expires_at
       FROM challenges ORDER BY FIELD(status,'open','claimed','expired'), position ASC, id DESC`
    );
    return rows.map((r) => ({
      id: r.id as number,
      slot_name: r.slot_name as string,
      provider: (r.provider as string) ?? null,
      image_url: (r.image_url as string) ?? null,
      required_multiplier: String(r.required_multiplier),
      min_bet: String(r.min_bet),
      prize: r.prize as string,
      status: r.status as Challenge["status"],
      claimedBy: r.claimed_by ? maskUsername(String(r.claimed_by)) : null,
      expires_at: (r.expires_at as string) ?? null,
    }));
  } catch {
    return [];
  }
}
