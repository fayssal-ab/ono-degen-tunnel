import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { KICK_CHANNEL } from "./constants";

// Resolves a Kick channel's chatroom id so the browser can subscribe to the
// live chat socket. UNOFFICIAL: Kick publishes no chat API; this endpoint + the
// socket are read from the public web client and can change.
//
// Kick's v2 endpoint is Cloudflare-gated and blocks Node's fetch by TLS
// fingerprint (403), but NOT curl — so we resolve via curl, falling back to
// fetch, with an env override for the default channel.

const execFileP = promisify(execFile);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface Cached {
  id: number;
  at: number;
}
const cache = new Map<string, Cached>();
const TTL = 10 * 60 * 1000;

interface KickChannel {
  chatroom?: { id?: number };
  livestream?: { viewer_count?: number; is_live?: boolean } | null;
  user?: { profile_pic?: string | null; username?: string };
}

async function fetchChannelJson(slug: string, timeout = 8): Promise<KickChannel | null> {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  // curl bypasses the Cloudflare fingerprint block that stops Node's fetch
  try {
    const { stdout } = await execFileP("curl", ["-s", "-m", String(timeout), "-A", UA, url], { maxBuffer: 8_000_000 });
    if (stdout && stdout.trim().startsWith("{")) return JSON.parse(stdout) as KickChannel;
  } catch {
    /* curl unavailable (e.g. some serverless) — fall through */
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout * 1000);
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) return (await res.json()) as KickChannel;
  } catch {
    /* ignore */
  }
  return null;
}

// Resolves a Kick user's real profile picture from the public channel endpoint
// (user.profile_pic). Cached (including misses) so a giveaway with many repeat
// chatters doesn't hammer Kick. Returns null when unavailable — callers fall
// back to initials. Never fabricates a URL.
interface AvatarCache { url: string | null; at: number; }
const avatarCache = new Map<string, AvatarCache>();
const AVATAR_TTL = 30 * 60 * 1000;

export async function resolveKickAvatar(username: string): Promise<string | null> {
  const slug = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!slug) return null;
  const hit = avatarCache.get(slug);
  if (hit && Date.now() - hit.at < AVATAR_TTL) return hit.url;
  const data = await fetchChannelJson(slug, 4);
  const url = typeof data?.user?.profile_pic === "string" ? data.user.profile_pic : null;
  avatarCache.set(slug, { url, at: Date.now() });
  return url;
}

export async function resolveChatroomId(slug: string): Promise<number | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;

  // env override applies only to the site's default channel
  const envId = Number(process.env.KICK_CHATROOM_ID);
  if (clean === KICK_CHANNEL.toLowerCase() && Number.isInteger(envId) && envId > 0) return envId;

  const hit = cache.get(clean);
  if (hit && Date.now() - hit.at < TTL) return hit.id;

  const data = await fetchChannelJson(clean);
  const id = data?.chatroom?.id;
  if (!id) return null;
  cache.set(clean, { id, at: Date.now() });
  return id;
}

// Public Pusher constants from Kick's web client (confirmed against the
// open-source chatmux reader). One place to update if Kick changes them.
export const KICK_PUSHER = {
  wsUrl: "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false",
  channel: (chatroomId: number) => `chatrooms.${chatroomId}.v2`,
  chatEvent: "App\\Events\\ChatMessageEvent",
} as const;

// Public fallback when OAuth credentials are unavailable. Never turn a failed
// lookup into a confirmed offline state.
export async function fetchPublicLiveStatus(slug: string): Promise<{ live: boolean; viewers: number | null } | null> {
  const channel = await fetchChannelJson(slug, 4);
  if (!channel || !Object.prototype.hasOwnProperty.call(channel, "livestream")) return null;
  return { live: Boolean(channel.livestream && channel.livestream.is_live !== false),
    viewers: channel.livestream?.viewer_count ?? null };
}
