import { KICK_CHANNEL } from "./constants";

// Helpers for signed Kick webhook events (pure, unit-tested).

interface Broadcaster {
  user_id?: number | string;
  username?: string;
  channel_slug?: string | null;
}

/**
 * The app may be subscribed for several channels; only ONO's counts.
 * KICK_BROADCASTER_USER_ID (stable numeric id) is authoritative when set;
 * otherwise fall back to the channel slug/username matching KICK_CHANNEL.
 */
export function isConfiguredBroadcaster(b: Broadcaster | null, env: { id?: string; channel?: string } = {
  id: process.env.KICK_BROADCASTER_USER_ID, channel: KICK_CHANNEL,
}): boolean {
  if (!b) return false;
  if (env.id) return b.user_id != null && String(b.user_id) === env.id.trim();
  const channel = (env.channel ?? "").toLowerCase();
  return Boolean(channel) && [b.channel_slug, b.username].some((v) => typeof v === "string" && v.toLowerCase() === channel);
}

/** Message time from the signed payload (created_at), else the signed header timestamp (RFC3339). */
export function messageSentAt(createdAt: string | undefined, headerTimestamp: string): Date | null {
  for (const v of [createdAt, headerTimestamp]) {
    if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v)) continue;
    const date = new Date(v);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}
