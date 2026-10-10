import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { CASINO_NAME, CASINO_CODE, CASINO_URL } from "./constants";

// key/value JSON settings (site_settings table). Admin-editable (prompt §5.15).
// Reads degrade to defaults if the table/row is missing so pages never crash
// before the DB is seeded.

export interface Announcement {
  text: string;
  href?: string;
}
export interface CasinoInfo {
  name: string;
  code: string;
  url: string;
}
export interface KickLive {
  live: boolean;
  viewers: number | null;
  checkedAt: string | null;
}

const DEFAULTS = {
  leaderboard_enabled: true,
  announcement: null as Announcement | null,
  casino: { name: CASINO_NAME, code: CASINO_CODE, url: CASINO_URL } as CasinoInfo,
  next_stream_at: null as string | null,
  kick_live: { live: false, viewers: null, checkedAt: null } as KickLive,
  // Per-page show/hide, admin-controlled. Missing key = visible (default on).
  page_visibility: {} as Record<string, boolean>,
};

type SettingKey = keyof typeof DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof DEFAULTS)[K]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT value FROM site_settings WHERE `key` = ? LIMIT 1",
      [key]
    );
    if (!rows[0]) return DEFAULTS[key];
    const raw = rows[0].value;
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return (value ?? DEFAULTS[key]) as (typeof DEFAULTS)[K];
  } catch {
    return DEFAULTS[key];
  }
}

export async function setSetting<K extends SettingKey>(key: K, value: (typeof DEFAULTS)[K]): Promise<void> {
  await getPool().query(
    "INSERT INTO site_settings (`key`, value) VALUES (?, CAST(? AS JSON)) ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [key, JSON.stringify(value)]
  );
}

/** Casino branding: admin override wins over env (prompt §6). */
export async function getCasinoInfo(): Promise<CasinoInfo> {
  const stored = await getSetting("casino");
  return {
    name: stored.name || CASINO_NAME,
    code: stored.code || CASINO_CODE,
    url: stored.url || CASINO_URL,
  };
}

export async function isLeaderboardEnabled(): Promise<boolean> {
  return getSetting("leaderboard_enabled");
}
