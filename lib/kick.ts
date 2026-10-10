import "server-only";
import { createVerify } from "node:crypto";
import { KICK_CHANNEL } from "./constants";

// Server-only Kick client — ported from JBALLIN lib/kick.ts. App access token
// (client-credentials), channel lookup, webhook subscribe, and RSA-SHA256
// webhook signature verification. Extended with a live-status read for the
// /api/cron/kick-live cache.
//
// Needs KICK_CLIENT_ID / KICK_CLIENT_SECRET from an app registered at
// kick.com/settings/developer. All of these degrade gracefully when the creds
// are absent (demo mode) — the site must run with zero keys.

const TOKEN_URL = "https://id.kick.com/oauth/token";
const API_BASE = "https://api.kick.com/public/v1";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function kickConfigured(): boolean {
  return Boolean(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET);
}

async function getAppAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const clientId = process.env.KICK_CLIENT_ID;
  const clientSecret = process.env.KICK_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("KICK_CLIENT_ID / KICK_CLIENT_SECRET is not set");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kick token request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

interface KickChannelData {
  broadcaster_user_id: number;
  stream?: { is_live?: boolean; viewer_count?: number } | null;
}

async function getChannel(slug: string): Promise<KickChannelData | null> {
  const token = await getAppAccessToken();
  const res = await fetch(`${API_BASE}/channels?slug=${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kick channel lookup failed: ${res.status}`);
  const data = (await res.json()) as { data: KickChannelData[] };
  return data.data?.[0] ?? null;
}

export async function getBroadcasterUserId(slug: string = KICK_CHANNEL): Promise<number> {
  const channel = await getChannel(slug);
  if (!channel?.broadcaster_user_id) throw new Error(`Kick channel "${slug}" not found`);
  return channel.broadcaster_user_id;
}

export interface LiveStatus {
  live: boolean;
  viewers: number | null;
}

// Best-effort live status. Returns offline (not an error) when Kick isn't
// configured or the call fails, so the cron route is always safe to call.
export async function fetchLiveStatus(slug: string = KICK_CHANNEL): Promise<LiveStatus> {
  if (!kickConfigured()) return { live: false, viewers: null };
  try {
    const channel = await getChannel(slug);
    return {
      live: Boolean(channel?.stream?.is_live),
      viewers: channel?.stream?.viewer_count ?? null,
    };
  } catch {
    return { live: false, viewers: null };
  }
}

export async function subscribeToChatMessages(broadcasterUserId: number): Promise<unknown> {
  const token = await getAppAccessToken();
  const res = await fetch(`${API_BASE}/events/subscriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      broadcaster_user_id: broadcasterUserId,
      events: [{ name: "chat.message.sent", version: 1 }],
      method: "webhook",
    }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Kick subscribe failed: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

let cachedPublicKey: string | null = null;

async function getPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;
  const res = await fetch(`${API_BASE}/public-key`, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`Kick public-key fetch failed: ${res.status}`);
  const data = (await res.json()) as { data: { public_key: string } };
  cachedPublicKey = data.data.public_key;
  return cachedPublicKey;
}

// Kick signs each delivery with RSA-SHA256 over "{message-id}.{timestamp}.
// {raw body}". Verify against the RAW body — never a re-serialized JSON.parse,
// which can differ byte-for-byte and silently break verification.
export async function verifyKickWebhookSignature(params: {
  messageId: string;
  timestamp: string;
  rawBody: string;
  signatureBase64: string;
}): Promise<boolean> {
  const publicKey = await getPublicKey();
  const signedPayload = `${params.messageId}.${params.timestamp}.${params.rawBody}`;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signedPayload);
  verifier.end();
  try {
    return verifier.verify(publicKey, Buffer.from(params.signatureBase64, "base64"));
  } catch {
    return false;
  }
}
