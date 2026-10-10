import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";

export interface VipTier {
  slug: string;
  name: string;
  threshold_wagered: string;
  perks: string[];
  position: number;
}

function parsePerks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function getVipTiers(): Promise<VipTier[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT slug, name, threshold_wagered, perks, position FROM vip_tiers ORDER BY position ASC"
    );
    return rows.map((r) => ({
      slug: r.slug as string,
      name: r.name as string,
      threshold_wagered: String(r.threshold_wagered),
      perks: parsePerks(r.perks),
      position: r.position as number,
    }));
  } catch {
    return [];
  }
}
