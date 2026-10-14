import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";
import { kickConfigured, lookupKickChannel } from "./kick";
import { lookupKickProfile } from "./kickChat";
import { avatarUrl, discordConfig, searchMember } from "./discordTickets";

// Admin → Prizes → "Add a prize": the winner must be a real account. Kick:
// someone the site already knows (signed in, chatted in a giveaway / GB /
// tournament) or a channel Kick confirms. Discord: a member of the server (or a
// Discord linked on the site). The result carries the platform id so the prize
// is owned by that exact account, not just a name.

export type WinnerPlatform = "kick" | "discord";
export interface VerifiedWinner { platform: WinnerPlatform; id: string; username: string; display: string; avatar: string | null; source: string }

const clean = (name: string) => name.trim().replace(/^@/, "");

async function knownKick(name: string): Promise<VerifiedWinner | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, username, avatar, src FROM (
       SELECT provider_user_id id, username, avatar, 'site account' src, 1 o FROM user_identities WHERE provider = 'kick' AND LOWER(username) = LOWER(?)
       UNION ALL SELECT kick_user_id, username, '', 'tournament', 2 FROM ko_participants WHERE LOWER(username) = LOWER(?)
       UNION ALL SELECT kick_user_id, kick_username, COALESCE(avatar, ''), 'giveaway chat', 3 FROM giveaway_entries WHERE kick_user_id IS NOT NULL AND LOWER(kick_username) = LOWER(?)
       UNION ALL SELECT kick_user_id, kick_username, '', 'Guess the Balance', 4 FROM gb_guesses WHERE kick_user_id IS NOT NULL AND LOWER(kick_username) = LOWER(?)
     ) k ORDER BY o LIMIT 1`, [name, name, name, name]);
  const r = rows[0];
  return r ? { platform: "kick", id: String(r.id), username: String(r.username), display: String(r.username), avatar: r.avatar || null, source: `Known on the site (${r.src})` } : null;
}

async function kickApi(name: string): Promise<VerifiedWinner | null> {
  const profile = await lookupKickProfile(name).catch(() => null);
  if (profile) return { platform: "kick", id: profile.id, username: profile.username, display: profile.username, avatar: profile.avatar, source: "Kick profile" };
  if (!kickConfigured()) return null;
  const ch = await lookupKickChannel(name.toLowerCase().replace(/_/g, "-")).catch(() => null);
  return ch ? { platform: "kick", id: ch.userId, username: name, display: ch.slug, avatar: null, source: "Kick channel" } : null;
}

async function discordWinner(name: string): Promise<VerifiedWinner | null> {
  const cfg = discordConfig();
  if (cfg) {
    const m = await searchMember(cfg.token, cfg.guildId, name).catch(() => null);
    if (m) return { platform: "discord", id: m.user.id, username: m.user.username, display: m.nick ?? m.user.global_name ?? m.user.username, avatar: avatarUrl(m.user), source: "Member of the Discord server" };
  }
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT provider_user_id id, username, avatar FROM user_identities WHERE provider = 'discord' AND LOWER(username) = LOWER(?) LIMIT 1", [name]);
  const r = rows[0];
  return r ? { platform: "discord", id: String(r.id), username: String(r.username), display: String(r.username), avatar: r.avatar || null, source: "Discord linked on the site" } : null;
}

/** The real account behind a name on that platform, or null when none exists. */
export async function verifyWinner(platform: WinnerPlatform, rawName: string): Promise<VerifiedWinner | null> {
  const name = clean(rawName);
  if (!/^[\w.-]{2,40}$/.test(name)) return null;
  if (platform === "discord") return discordWinner(name);
  return (await knownKick(name)) ?? kickApi(name);
}
