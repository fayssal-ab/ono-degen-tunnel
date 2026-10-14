import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";
import { SITE_URL } from "./constants";

// Discord prize tickets. Every new prize_awards row gets a private channel
// "🏆｜prize-<winner>" under 🎫 TICKETS, visible to the staff roles and to the
// winner when we can find them on the server (Discord linked on their site
// account, else an exact username match). Uses YUKI BOT's token over the REST
// API only — no gateway, so it works from serverless and doesn't need the bot
// process running. recordAward() schedules a sweep after the response; the
// cron sync sweeps again so a Discord outage only delays a ticket.

const API = "https://discord.com/api/v10";
const TICKET_CATEGORY = "🎫 TICKETS";
const STAFF_ROLES = ["👑 Owner", "🛡️ Moderator"];
const BATCH = 10;

// permission bits
const VIEW = 1n << 10n, SEND = 1n << 11n, EMBED = 1n << 14n, ATTACH = 1n << 15n, HISTORY = 1n << 16n;

const SOURCE_LABEL: Record<string, string> = {
  tournament: "🏆 Tournament", giveaway: "🎉 Giveaway", race: "🏁 Race", leaderboard: "📊 Leaderboard",
  gb: "💰 Guess the Balance", challenge: "🎯 Challenge", manual: "🎁 Prize",
};
/** Casino usernames, not Kick: not claimable from a site account. */
const CASINO_NAMED = ["leaderboard", "race"];

class DiscordError extends Error {
  constructor(public status: number, path: string, body: string) {
    super(`discord ${status} ${path}: ${body.slice(0, 200)}`);
  }
}

function config(): { token: string; guildId: string } | null {
  const token = process.env.DISCORD_BOT_TOKEN, guildId = process.env.DISCORD_GUILD_ID;
  return token && guildId ? { token, guildId } : null;
}

async function discord<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", "X-Audit-Log-Reason": "Prize ticket" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new DiscordError(res.status, path, await res.text());
  return (await res.json()) as T;
}

export function ticketChannelName(winner: string): string {
  const slug = winner.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "winner";
  return `🏆｜prize-${slug}`;
}

interface TicketAward extends RowDataPacket {
  id: number; source: string; title: string; place: number | null; winner: string;
  amount: string | null; prize_label: string; linked_discord_id: string | null;
}

interface GuildMember { user: { id: string; username: string; global_name: string | null }; nick: string | null }

/** The winner's Discord user id: the Discord linked to their site account, else an exact name match on the server. */
async function findWinner(token: string, guildId: string, a: TicketAward): Promise<string | null> {
  if (a.linked_discord_id) return a.linked_discord_id;
  const name = a.winner.toLowerCase();
  const found = await discord<GuildMember[]>(token, `/guilds/${guildId}/members/search?limit=10&query=${encodeURIComponent(a.winner)}`);
  const m = found.find((x) => [x.user.username, x.user.global_name, x.nick].some((n) => n?.toLowerCase() === name));
  return m?.user.id ?? null;
}

async function openTicket(token: string, guildId: string, a: TicketAward): Promise<string> {
  const [channels, roles] = await Promise.all([
    discord<{ id: string; name: string; type: number }[]>(token, `/guilds/${guildId}/channels`),
    discord<{ id: string; name: string }[]>(token, `/guilds/${guildId}/roles`),
  ]);
  const category = channels.find((c) => c.type === 4 && c.name === TICKET_CATEGORY);
  const staff = roles.filter((r) => STAFF_ROLES.includes(r.name));
  const winnerId = await findWinner(token, guildId, a);

  const overwrites = [
    { id: guildId, type: 0, allow: "0", deny: String(VIEW) }, // @everyone
    ...staff.map((r) => ({ id: r.id, type: 0, allow: String(VIEW | SEND | HISTORY | EMBED | ATTACH), deny: "0" })),
    ...(winnerId ? [{ id: winnerId, type: 1, allow: String(VIEW | SEND | HISTORY | ATTACH), deny: "0" }] : []),
  ];
  const channel = await discord<{ id: string }>(token, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: { name: ticketChannelName(a.winner), type: 0, parent_id: category?.id, permission_overwrites: overwrites, topic: `Prize #${a.id} · ${a.winner}` },
  });

  const prize = a.prize_label || (a.amount != null ? `$${a.amount}` : "—");
  const claimable = !CASINO_NAMED.includes(a.source);
  const fields = [
    { name: "Event", value: `${SOURCE_LABEL[a.source] ?? a.source}\n${a.title || "—"}`, inline: true },
    ...(a.place ? [{ name: "Place", value: `#${a.place}`, inline: true }] : []),
    { name: "Prize", value: prize, inline: true },
    {
      name: "Next step",
      value: claimable
        ? `Claim it on **[your account](${SITE_URL.replace(/\/$/, "")}/account)** (where to send it), then wait here for the payout.`
        : "Send your casino username here so the team can pay you.",
    },
    { name: "Winner on Discord", value: winnerId ? `<@${winnerId}>` : "⚠️ Not found — add them to this channel by hand." },
  ];
  await discord(token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: {
      content: [winnerId ? `<@${winnerId}>` : "", ...staff.map((r) => `<@&${r.id}>`)].join(" ").trim() || undefined,
      embeds: [{ title: `🏆 PRIZE • ${a.winner}`, color: 0xf5c451, fields, footer: { text: `ONO DEGEN TUNNEL · award #${a.id}` } }],
      allowed_mentions: { users: winnerId ? [winnerId] : [], roles: staff.map((r) => r.id) },
    },
  });
  return channel.id;
}

const PENDING_SQL = `
  SELECT pa.id, pa.source, pa.title, pa.place, pa.winner, pa.amount, pa.prize_label,
         IF(pa.source IN ('leaderboard','race'), NULL,
           (SELECT d.provider_user_id FROM user_identities k
              JOIN user_identities d ON d.account_id = k.account_id AND d.provider = 'discord'
             WHERE k.provider = 'kick'
               AND (k.provider_user_id = pa.winner_kick_id OR (pa.winner_kick_id IS NULL AND LOWER(k.username) = LOWER(pa.winner)))
             LIMIT 1)) AS linked_discord_id
    FROM prize_awards pa
   WHERE pa.discord_channel_id IS NULL
     AND (pa.discord_ticket_lock IS NULL OR pa.discord_ticket_lock < UTC_TIMESTAMP() - INTERVAL 2 MINUTE)
   ORDER BY pa.id LIMIT ${BATCH}`;

async function sweep(): Promise<number> {
  const cfg = config();
  if (!cfg) return 0;
  const pool = getPool();
  const [rows] = await pool.query<TicketAward[]>(PENDING_SQL);
  let opened = 0;
  for (const a of rows) {
    // claim the row so a parallel sweep skips it
    const [lock] = await pool.query<ResultSetHeader>(
      `UPDATE prize_awards SET discord_ticket_lock = UTC_TIMESTAMP() WHERE id = ? AND discord_channel_id IS NULL
         AND (discord_ticket_lock IS NULL OR discord_ticket_lock < UTC_TIMESTAMP() - INTERVAL 2 MINUTE)`, [a.id]);
    if (!lock.affectedRows) continue;
    try {
      const channelId = await openTicket(cfg.token, cfg.guildId, a);
      await pool.query("UPDATE prize_awards SET discord_channel_id = ?, discord_ticket_lock = NULL WHERE id = ?", [channelId, a.id]);
      opened++;
    } catch (err) {
      await pool.query("UPDATE prize_awards SET discord_ticket_lock = NULL WHERE id = ?", [a.id]);
      console.error(`discord ticket for award #${a.id} failed`, err);
      if (err instanceof DiscordError && (err.status === 429 || err.status === 401)) break; // rate limited / bad token: next sweep
    }
  }
  return opened;
}

let running: Promise<number> | null = null;

/** Open tickets for prizes that don't have one yet. Never throws; concurrent calls share one sweep. */
export function openPrizeTickets(): Promise<number> {
  running ??= sweep()
    .catch((err) => { console.error("discord prize tickets failed", err); return 0; })
    .finally(() => { running = null; });
  return running;
}
