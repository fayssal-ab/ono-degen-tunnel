import "server-only";
import { after } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";
import { SITE_URL } from "./constants";
import { describeDestination } from "./payout";

// Discord prize tickets. Every new prize_awards row gets a private channel
// "🏆｜prize-<winner>", visible to the staff roles and to the
// winner when we can find them on the server (verified Discord winner, the
// Discord linked to their site account, else an exact username match).
//
// REST only (no gateway): works from serverless. The ticket message carries a
// green "Claim prize" button (then "I received it" once paid); clicks arrive at
// /api/discord/interactions (lib/discordInteractions.ts). Every prize change
// (claim, paid, void, received) edits the message, renames the channel with
// the status emoji, moves it to the category of its status (🆕 NEW → 📨 CLAIMED
// → 💸 PAID, or ❌ REJECTED; created on demand, staff-only) and posts a line,
// so the ticket is the full history. Once paid (or received) the winner can
// still read it but not write; rejected tickets are staff-only. Staff buttons: Mark paid (amount + tx
// note), Close (winner loses access), Reject (voids the prize) and Delete
// (removes the channel).
//
// recordAward() schedules a sweep after the response; the cron sync sweeps
// again so a Discord outage only delays a ticket.

const API = "https://discord.com/api/v10";
const STAFF_ROLES = ["👑 Owner", "🛡️ Moderator"];
const BATCH = 10;
const SITE = SITE_URL.replace(/\/$/, "");

// permission bits
const VIEW = 1n << 10n, SEND = 1n << 11n, EMBED = 1n << 14n, ATTACH = 1n << 15n, HISTORY = 1n << 16n;

const SOURCE_LABEL: Record<string, string> = {
  tournament: "🏆 Tournament", giveaway: "🎉 Giveaway", race: "🏁 Race", leaderboard: "📊 Leaderboard",
  gb: "💰 Guess the Balance", challenge: "🎯 Challenge", manual: "🎁 Stream prize",
};
const PLACE = ["", "🥇 1st", "🥈 2nd", "🥉 3rd"];
/** Casino usernames, not Kick: paid to the casino account, nothing to claim. */
const CASINO_NAMED = ["leaderboard", "race"];

export class DiscordError extends Error {
  constructor(public status: number, path: string, body: string) {
    super(`discord ${status} ${path}: ${body.slice(0, 200)}`);
  }
}

export function discordConfig(): { token: string; guildId: string } | null {
  const token = process.env.DISCORD_BOT_TOKEN, guildId = process.env.DISCORD_GUILD_ID;
  return token && guildId ? { token, guildId } : null;
}

export async function discord<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", "X-Audit-Log-Reason": "Prize ticket" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new DiscordError(res.status, path, await res.text());
  return (res.status === 204 ? null : await res.json()) as T;
}

export interface DiscordUser { id: string; username: string; global_name: string | null; avatar: string | null }
export interface GuildMember { user: DiscordUser; nick: string | null; avatar?: string | null }

export const avatarUrl = (u: DiscordUser) =>
  u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) >> 22n) % 6}.png`;

/** Exact (case-insensitive) username / display name / nickname match among server members. */
export async function searchMember(token: string, guildId: string, name: string): Promise<GuildMember | null> {
  const q = name.trim().replace(/^@/, "");
  if (!q) return null;
  const found = await discord<GuildMember[]>(token, `/guilds/${guildId}/members/search?limit=25&query=${encodeURIComponent(q)}`);
  const lower = q.toLowerCase();
  return found.find((m) => [m.user.username, m.user.global_name, m.nick].some((n) => n?.toLowerCase() === lower)) ?? null;
}

async function getMember(token: string, guildId: string, userId: string): Promise<GuildMember | null> {
  try { return await discord<GuildMember>(token, `/guilds/${guildId}/members/${userId}`); }
  catch (e) { if (e instanceof DiscordError && e.status === 404) return null; throw e; }
}

export function ticketChannelName(winner: string, emoji = "🏆"): string {
  const slug = winner.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "winner";
  return `${emoji}｜prize-${slug}`;
}

// ── ticket message ────────────────────────────────────────────────────────
interface TicketAward extends RowDataPacket {
  id: number; source: string; source_ref: string; title: string; place: number | null; winner: string;
  winner_kick_id: string | null; amount: string | null; prize_label: string; status: "pending" | "paid" | "void"; note: string;
  created_at: string; paid_at: string | null; claimed_at: string | null; received_at: string | null;
  payout_method: string | null; payout_username: string; payout_network: string; claim_note: string;
  discord_channel_id: string | null; discord_user_id: string | null; discord_message_id: string | null;
  candidate_discord_id: string | null;
}

const AWARD_SQL = `
  SELECT pa.id, pa.source, pa.source_ref, pa.title, pa.place, pa.winner, pa.winner_kick_id, pa.amount, pa.prize_label, pa.status, pa.note,
         pa.created_at, pa.paid_at, pa.claimed_at, pa.received_at, pa.payout_method, pa.payout_username, pa.payout_network, pa.claim_note,
         pa.discord_channel_id, pa.discord_user_id, pa.discord_message_id,
         COALESCE(pa.winner_discord_id, IF(pa.source IN ('leaderboard','race'), NULL,
           (SELECT d.provider_user_id FROM user_identities k
              JOIN user_identities d ON d.account_id = k.account_id AND d.provider = 'discord'
             WHERE k.provider = 'kick'
               AND (k.provider_user_id = pa.winner_kick_id OR (pa.winner_kick_id IS NULL AND LOWER(k.username) = LOWER(pa.winner)))
             LIMIT 1))) AS candidate_discord_id
    FROM prize_awards pa`;

type Stage = "waiting" | "claimed" | "paid" | "received" | "void";
function stageOf(a: TicketAward): Stage {
  if (a.status === "void") return "void";
  if (a.received_at) return "received";
  if (a.status === "paid") return "paid";
  return a.claimed_at ? "claimed" : "waiting";
}
/** Category per status. A Discord category holds at most 50 channels: delete old tickets now and then. */
const CATEGORY: Record<Stage, string> = {
  waiting: "🆕 NEW PRIZES", claimed: "📨 CLAIMED PRIZES", paid: "💸 PAID PRIZES", received: "💸 PAID PRIZES", void: "❌ REJECTED PRIZES",
};

const STAGE: Record<Stage, { emoji: string; label: string; color: number }> = {
  waiting: { emoji: "🏆", label: "⏳ Waiting for the winner's claim", color: 0xf5c451 },
  claimed: { emoji: "📨", label: "📨 Claimed — the team is sending it", color: 0x22d3ee },
  paid: { emoji: "💸", label: "💸 Paid — waiting for the winner to confirm", color: 0x8b5cf6 },
  received: { emoji: "✅", label: "✅ Received — done", color: 0x34d399 },
  void: { emoji: "❌", label: "❌ Voided", color: 0xff4d5e },
};

const unix = (dbTime: string) => Math.floor(new Date(`${dbTime.replace(" ", "T")}Z`).getTime() / 1000);
const prizeText = (a: TicketAward) =>
  a.amount != null ? `**$${Number(a.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}**${a.prize_label ? `\n${a.prize_label}` : ""}` : a.prize_label || "—";

function progress(stage: Stage): string {
  if (stage === "void") return "`❌ VOIDED`";
  const order: Stage[] = ["waiting", "claimed", "paid", "received"];
  const at = order.indexOf(stage);
  return ["WON", "CLAIMED", "PAID", "RECEIVED"].map((s, i) => (i <= at ? `🟢 **${s}**` : `⚪ ${s}`)).join(" ─ ");
}

function ticketMessage(a: TicketAward, member: GuildMember | null) {
  const stage = stageOf(a);
  const casino = CASINO_NAMED.includes(a.source);
  const who = a.discord_user_id ? `<@${a.discord_user_id}>` : `**${a.winner}**`;
  const intro: Record<Stage, string> = {
    waiting: casino
      ? `GG ${who}! You placed in the **${a.title}**. Send your casino username here and the team pays you.`
      : `GG ${who}! You won ${prizeText(a).split("\n")[0]} in **${a.title || "the stream"}**.\nPress **Claim prize** and pick where to send it: **Stake**, **Rainbet** or a **USDC wallet**.`,
    claimed: `${who}, your claim is in. The team pays you shortly; this ticket updates when it's sent.`,
    paid: `💸 ${who}, your prize was sent! Press **I received it** once it's in your account.`,
    received: `All done — ${who} confirmed the prize. Thanks for watching ONO! 💛`,
    void: `This prize was voided${a.note ? `: ${a.note}` : "."}`,
  };
  const fields = [
    { name: "👤 Winner", value: `${a.winner}${a.winner_kick_id ? " · Kick" : ""}\n${member ? `<@${member.user.id}>` : "⚠️ not found on the server — add them by hand"}`, inline: true },
    { name: "🎮 Event", value: `${SOURCE_LABEL[a.source] ?? a.source}\n${a.title || "—"}`, inline: true },
    { name: "💰 Prize", value: prizeText(a), inline: true },
    ...(a.place ? [{ name: "🏅 Place", value: PLACE[a.place] ?? `#${a.place}`, inline: true }] : []),
    { name: "📅 Won", value: `<t:${unix(a.created_at)}:f>\n<t:${unix(a.created_at)}:R>`, inline: true },
    { name: "📌 Status", value: STAGE[stage].label, inline: true },
    {
      name: "💳 Payout",
      value: a.claimed_at && a.payout_method
        ? `\`${describeDestination(a.payout_method, a.payout_username, a.payout_network)}\`${a.claim_note ? `\n> ${a.claim_note}` : ""}`
        : casino ? "Casino account (leaderboard / race)" : "Not claimed yet",
    },
    ...(a.paid_at ? [{ name: "💸 Paid", value: `<t:${unix(a.paid_at)}:f>${a.note ? `\n${a.note}` : ""}`, inline: true }] : []),
    ...(a.received_at ? [{ name: "✅ Received", value: `<t:${unix(a.received_at)}:f>`, inline: true }] : []),
  ];

  const buttons: unknown[] = [];
  if (stage === "waiting" || stage === "claimed") {
    buttons.push({ type: 2, style: 3, custom_id: `prize:claim:${a.id}`, label: stage === "waiting" ? "Claim prize" : "Change payout", emoji: { name: "💸" } });
  }
  if (stage === "paid") buttons.push({ type: 2, style: 3, custom_id: `prize:recv:${a.id}`, label: "I received it", emoji: { name: "✅" } });
  buttons.push({ type: 2, style: 5, url: `${SITE}/account/prizes`, label: "Prize page", emoji: { name: "🌐" } });
  // staff row (the interaction handler refuses non-staff)
  const staffRow: unknown[] = [];
  if (a.status === "pending") staffRow.push({ type: 2, style: 3, custom_id: `prize:pay:${a.id}`, label: "Mark paid", emoji: { name: "💸" } });
  staffRow.push({ type: 2, style: 2, custom_id: `prize:close:${a.id}`, label: "Close", emoji: { name: "🔒" } });
  if (a.status === "pending") staffRow.push({ type: 2, style: 4, custom_id: `prize:reject:${a.id}`, label: "Reject", emoji: { name: "❌" } });
  staffRow.push({ type: 2, style: 4, custom_id: `prize:delete:${a.id}`, label: "Delete", emoji: { name: "🗑️" } });

  return {
    embeds: [{
      author: { name: `PRIZE TICKET · #${a.id}` },
      title: `🏆 ${a.winner}`,
      description: `${intro[stage]}\n\n${progress(stage)}`,
      color: STAGE[stage].color,
      fields,
      ...(member ? { thumbnail: { url: avatarUrl(member.user) } } : {}),
      footer: { text: "ONO DEGEN TUNNEL · Prize desk" },
      timestamp: new Date().toISOString(),
    }],
    components: [{ type: 1, components: buttons }, { type: 1, components: staffRow }],
  };
}

async function loadTicketAward(id: number): Promise<TicketAward | null> {
  const [rows] = await getPool().query<TicketAward[]>(`${AWARD_SQL} WHERE pa.id = ?`, [id]);
  return rows[0] ?? null;
}

// ── categories ────────────────────────────────────────────────────────────
interface Role { id: string; name: string }
const staffRoles = async (token: string, guildId: string) =>
  (await discord<Role[]>(token, `/guilds/${guildId}/roles`)).filter((r) => STAFF_ROLES.includes(r.name));

const categoryIds = new Map<string, string>();
/** The status category's id, created (private: staff only) when the server doesn't have it yet. */
async function categoryFor(token: string, guildId: string, stage: Stage, staff: Role[]): Promise<string> {
  const name = CATEGORY[stage];
  const cached = categoryIds.get(name);
  if (cached) return cached;
  const channels = await discord<{ id: string; name: string; type: number }[]>(token, `/guilds/${guildId}/channels`);
  for (const c of channels) if (c.type === 4) categoryIds.set(c.name, c.id);
  const found = categoryIds.get(name);
  if (found) return found;
  const created = await discord<{ id: string }>(token, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: {
      name, type: 4,
      permission_overwrites: [
        { id: guildId, type: 0, allow: "0", deny: String(VIEW) },
        ...staff.map((r) => ({ id: r.id, type: 0, allow: String(VIEW | SEND | HISTORY), deny: "0" })),
      ],
    },
  });
  categoryIds.set(name, created.id);
  return created.id;
}

// ── open ──────────────────────────────────────────────────────────────────
async function openTicket(token: string, guildId: string, a: TicketAward): Promise<{ channelId: string; messageId: string; userId: string | null }> {
  const staff = await staffRoles(token, guildId);
  const parent = await categoryFor(token, guildId, stageOf(a), staff);
  const member = a.candidate_discord_id
    ? await getMember(token, guildId, a.candidate_discord_id)
    : await searchMember(token, guildId, a.winner);
  const userId = member?.user.id ?? null;

  const overwrites = [
    { id: guildId, type: 0, allow: "0", deny: String(VIEW) }, // @everyone
    ...staff.map((r) => ({ id: r.id, type: 0, allow: String(VIEW | SEND | HISTORY | EMBED | ATTACH), deny: "0" })),
    ...(userId ? [{ id: userId, type: 1, allow: String(VIEW | SEND | HISTORY | ATTACH), deny: "0" }] : []),
  ];
  const channel = await discord<{ id: string }>(token, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: {
      name: ticketChannelName(a.winner, STAGE[stageOf(a)].emoji), type: 0, parent_id: parent, permission_overwrites: overwrites,
      topic: `Prize #${a.id} · ${a.winner} · ${SOURCE_LABEL[a.source] ?? a.source}: ${a.title}`.slice(0, 1024),
    },
  });
  const msg = await discord<{ id: string }>(token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: {
      content: [userId ? `<@${userId}>` : "", ...staff.map((r) => `<@&${r.id}>`)].join(" ").trim() || undefined,
      ...ticketMessage({ ...a, discord_user_id: userId } as TicketAward, member),
      allowed_mentions: { users: userId ? [userId] : [], roles: staff.map((r) => r.id) },
    },
  });
  // pinned so the details stay one click away however long the chat gets
  await discord(token, `/channels/${channel.id}/pins/${msg.id}`, { method: "PUT" }).catch(() => {});
  return { channelId: channel.id, messageId: msg.id, userId };
}

const PENDING_SQL = `${AWARD_SQL}
   WHERE pa.discord_channel_id IS NULL
     AND (pa.discord_ticket_lock IS NULL OR pa.discord_ticket_lock < UTC_TIMESTAMP() - INTERVAL 2 MINUTE)
   ORDER BY pa.id LIMIT ${BATCH}`;

async function sweep(): Promise<number> {
  const cfg = discordConfig();
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
      const t = await openTicket(cfg.token, cfg.guildId, a);
      await pool.query(
        "UPDATE prize_awards SET discord_channel_id = ?, discord_message_id = ?, discord_user_id = ?, discord_ticket_lock = NULL WHERE id = ?",
        [t.channelId, t.messageId, t.userId, a.id]);
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

// ── update ────────────────────────────────────────────────────────────────
/** Re-render the ticket message + channel name for the award's current state, and post `note` as a history line. */
export async function refreshTicket(id: number, note?: string): Promise<void> {
  const cfg = discordConfig();
  if (!cfg) return;
  const a = await loadTicketAward(id);
  if (!a?.discord_channel_id) return;
  const { token, guildId } = cfg;
  const member = a.discord_user_id ? await getMember(token, guildId, a.discord_user_id).catch(() => null) : null;
  const stage = stageOf(a);
  const parent = await staffRoles(token, guildId).then((staff) => categoryFor(token, guildId, stage, staff)).catch((e) => {
    console.error(`discord ticket #${id} category failed`, e);
    return undefined;
  });
  // winner access: open → read + write; paid / received → read-only (they still see
  // the payout); rejected → staff-only
  if (a.discord_user_id) {
    const perm = `/channels/${a.discord_channel_id}/permissions/${a.discord_user_id}`;
    const access = stage === "void"
      ? discord(token, perm, { method: "DELETE" })
      : stage === "paid" || stage === "received"
        ? discord(token, perm, { method: "PUT", body: { type: 1, allow: String(VIEW | HISTORY), deny: String(SEND | ATTACH) } })
        : discord(token, perm, { method: "PUT", body: { type: 1, allow: String(VIEW | SEND | HISTORY | ATTACH), deny: "0" } });
    await access.catch((e) => { if (!(e instanceof DiscordError && e.status === 404)) console.error(`discord ticket #${id} access failed`, e); });
  }
  const jobs: Promise<unknown>[] = [
    // moving category keeps the channel's own permissions (lock_permissions false)
    discord(token, `/channels/${a.discord_channel_id}`, { method: "PATCH", body: { name: ticketChannelName(a.winner, STAGE[stage].emoji), ...(parent ? { parent_id: parent, lock_permissions: false } : {}) } })
      .catch((e) => {
        // a category deleted by hand: forget it, the next update recreates it
        if (e instanceof DiscordError && e.status === 400) categoryIds.clear();
        throw e;
      }),
  ];
  jobs.push(updateMessage(token, a, member));
  if (note) jobs.push(discord(token, `/channels/${a.discord_channel_id}/messages`, { method: "POST", body: { content: note, allowed_mentions: { parse: [] } } }));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error(`discord ticket #${id} update failed`, r.reason);
}

/**
 * Edit the pinned ticket message. A message can only be edited by the bot that
 * wrote it: when the token changed (or the message is gone), post a fresh one
 * with working buttons, pin it and remember it.
 */
async function updateMessage(token: string, a: TicketAward, member: GuildMember | null): Promise<void> {
  const body = ticketMessage(a, member);
  if (a.discord_message_id) {
    try {
      await discord(token, `/channels/${a.discord_channel_id}/messages/${a.discord_message_id}`, { method: "PATCH", body });
      return;
    } catch (e) {
      if (!(e instanceof DiscordError && (e.status === 403 || e.status === 404))) throw e;
    }
  }
  const msg = await discord<{ id: string }>(token, `/channels/${a.discord_channel_id}/messages`, {
    method: "POST", body: { content: a.discord_user_id ? `<@${a.discord_user_id}>` : undefined, ...body, allowed_mentions: { users: a.discord_user_id ? [a.discord_user_id] : [] } },
  });
  await discord(token, `/channels/${a.discord_channel_id}/pins/${msg.id}`, { method: "PUT" }).catch(() => {});
  await getPool().query("UPDATE prize_awards SET discord_message_id = ? WHERE id = ?", [msg.id, a.id]);
}

/** Create the 4 status categories, then re-render every live ticket (newest first): moves them to their status category and replaces messages the current bot can't edit. */
export async function refreshAllTickets(limit = 25): Promise<number> {
  const cfg = discordConfig();
  if (!cfg) return 0;
  // every status category exists up front, even before its first ticket
  const staff = await staffRoles(cfg.token, cfg.guildId);
  for (const stage of ["waiting", "claimed", "paid", "void"] as Stage[]) await categoryFor(cfg.token, cfg.guildId, stage, staff);
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM prize_awards WHERE discord_channel_id IS NOT NULL AND discord_channel_id <> '' ORDER BY id DESC LIMIT ?", [limit]);
  let done = 0;
  for (const r of rows) {
    try { await refreshTicket(Number(r.id)); done++; } catch (e) { console.error(`discord ticket #${r.id} refresh failed`, e); }
  }
  return done;
}

/** Staff closed the ticket: the winner loses access, the channel stays in its status category for the record. */
export async function closeTicket(id: number, byUserId: string): Promise<void> {
  const cfg = discordConfig();
  if (!cfg) return;
  const a = await loadTicketAward(id);
  if (!a?.discord_channel_id) return;
  if (a.discord_user_id) {
    await discord(cfg.token, `/channels/${a.discord_channel_id}/permissions/${a.discord_user_id}`, { method: "DELETE" })
      .catch((e) => { if (!(e instanceof DiscordError && e.status === 404)) throw e; });
  }
  await refreshTicket(id, `🔒 **Ticket closed** by <@${byUserId}>${a.discord_user_id ? " — the winner no longer sees it." : "."}`);
}

/** Delete the ticket channel. The prize keeps no ticket ('' — the sweep won't open a new one). */
export async function deleteTicket(id: number): Promise<void> {
  const cfg = discordConfig();
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT discord_channel_id FROM prize_awards WHERE id = ?", [id]);
  const channel = rows[0]?.discord_channel_id as string | null | undefined;
  await getPool().query("UPDATE prize_awards SET discord_channel_id = '', discord_message_id = NULL WHERE id = ?", [id]);
  if (cfg && channel) {
    await discord(cfg.token, `/channels/${channel}`, { method: "DELETE" })
      .catch((e) => { if (!(e instanceof DiscordError && e.status === 404)) throw e; });
  }
}

/** Delete a ticket channel by id after the response (the prize row itself is being removed). */
export function deleteTicketChannel(channelId: string | null): void {
  const cfg = discordConfig();
  if (!cfg || !channelId) return;
  const run = () => discord(cfg.token, `/channels/${channelId}`, { method: "DELETE" }).catch((e) => {
    if (!(e instanceof DiscordError && e.status === 404)) console.error(`discord ticket channel ${channelId} delete failed`, e);
  });
  try { after(run); } catch { void run(); }
}

/** (Re)register the server's slash commands for this bot: /profile and /top. Idempotent. */
export async function registerCommands(): Promise<void> {
  const cfg = discordConfig();
  if (!cfg) return;
  const app = await discord<{ id: string }>(cfg.token, "/applications/@me");
  await discord(cfg.token, `/applications/${app.id}/guilds/${cfg.guildId}/commands`, {
    method: "PUT",
    body: [
      { name: "profile", type: 1, description: "Show an ONO player card: wins, total won, last prize",
        options: [{ type: 6, name: "user", description: "Whose card (default: yours)", required: false }] },
      { name: "top", type: 1, description: "Top winners on ONO this month" },
    ],
  });
}

/** After the response: refresh the award's ticket. Safe anywhere (no-op outside a request or without Discord config). */
export function ticketChanged(id: number, note?: string): void {
  if (!discordConfig()) return;
  try { after(() => refreshTicket(id, note).catch((e) => console.error(`discord ticket #${id} refresh failed`, e))); } catch { /* outside a request */ }
}
