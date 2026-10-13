import "server-only";
import type { RowDataPacket, ResultSetHeader, PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { generateServerSeed, sha256, entriesHash, winnerIndex } from "./fair";
import { resolveKickAvatar } from "./kickChat";
import { entryEligible, collectionOpen } from "./giveawayRules";
import { recordAward } from "./prizes";

// Giveaways (prompt §5.10) — sharkz-style, but entries come from Kick chat
// (no user accounts) and the draw is provably fair (see lib/fair.ts). Entrant
// and winner usernames are public Kick chat handles, shown in full so the
// draw can actually be verified on /verify.

export interface Giveaway {
  id: number;
  title: string;
  type: "manual" | "keyword";
  keyword: string | null;
  entry_condition: string;
  prize: string;
  status: "open" | "drawn" | "closed";
  needs_reset: boolean;
  subscribers_only: boolean;
  min_messages: number;
  ends_at: string | null;
  entrants: number;
  server_seed_hash: string | null;
}

export interface GiveawayWinner {
  giveaway_id: number;
  giveaway_title: string;
  username: string;
  avatar: string | null;
  prize: string;
  drawn_at: string;
  verifiable: boolean;
}

function rowToGiveaway(r: RowDataPacket): Giveaway {
  return {
    id: r.id as number,
    title: r.title as string,
    type: r.type as Giveaway["type"],
    keyword: (r.keyword as string) ?? null,
    entry_condition: r.entry_condition as string,
    prize: r.prize as string,
    status: r.status as Giveaway["status"],
    needs_reset: Boolean(r.needs_reset),
    subscribers_only: Boolean(r.subscribers_only),
    min_messages: Number(r.min_messages),
    ends_at: (r.ends_at as string) ?? null,
    entrants: Number(r.entrants ?? 0),
    server_seed_hash: (r.server_seed_hash as string) ?? null,
  };
}

const LIST_COLS = `g.id, g.title, g.type, g.keyword, g.entry_condition, g.prize,
  CASE WHEN g.server_seed IS NULL OR g.server_seed NOT LIKE 'v2%' THEN 'closed' ELSE g.status END AS status,
  (g.server_seed IS NULL OR g.server_seed NOT LIKE 'v2%') AS needs_reset,
  g.subscribers_only, g.min_messages, g.ends_at, g.server_seed_hash,
  (SELECT COUNT(*) FROM giveaway_entries e WHERE e.giveaway_id = g.id) AS entrants`;

export async function getOpenGiveaways(): Promise<Giveaway[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${LIST_COLS} FROM giveaways g WHERE g.status = 'open' AND g.server_seed LIKE 'v2%' AND (g.ends_at IS NULL OR g.ends_at > UTC_TIMESTAMP()) ORDER BY g.created_at DESC`
    );
    return rows.map(rowToGiveaway);
  } catch {
    return [];
  }
}

export async function getAllGiveaways(): Promise<Giveaway[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${LIST_COLS} FROM giveaways g ORDER BY FIELD(g.status,'open','drawn','closed'), g.created_at DESC`
  );
  return rows.map(rowToGiveaway);
}

export async function getGiveaway(id: number): Promise<Giveaway | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${LIST_COLS} FROM giveaways g WHERE g.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? rowToGiveaway(rows[0]) : null;
}

export async function getPastWinners(limit = 18): Promise<GiveawayWinner[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT w.giveaway_id, w.kick_username, w.avatar, w.prize, w.drawn_at, w.server_seed,
              g.title AS giveaway_title
       FROM giveaway_winners w JOIN giveaways g ON g.id = w.giveaway_id
       ORDER BY w.drawn_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      giveaway_id: r.giveaway_id as number,
      giveaway_title: r.giveaway_title as string,
      username: String(r.kick_username),
      avatar: (r.avatar as string) ?? null,
      prize: r.prize as string,
      drawn_at: String(r.drawn_at),
      verifiable: Boolean(r.server_seed),
    }));
  } catch {
    return [];
  }
}

// ── entries (webhook path) ──

export interface EntryRow {
  username: string;
  avatar: string | null;
  is_subscriber: boolean;
  message_count: number;
  excluded: boolean;
  created_at: string;
}

export async function getEntries(giveawayId: number): Promise<EntryRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT kick_username, avatar, is_subscriber, message_count, excluded, created_at FROM giveaway_entries WHERE giveaway_id = ? ORDER BY created_at ASC, id ASC",
    [giveawayId]
  );
  return rows.map((r) => ({
    username: String(r.kick_username),
    avatar: (r.avatar as string) ?? null,
    is_subscriber: Boolean(r.is_subscriber),
    message_count: Number(r.message_count),
    excluded: Boolean(r.excluded),
    created_at: String(r.created_at),
  }));
}

/** All giveaway mutations take the same row lock, including chat collection. */
interface GiveawayDb extends RowDataPacket { status: string; ends_at: string | null; drawn_entrants: unknown; subscribers_only: boolean; min_messages: number; }
async function withGiveaway<T>(id: number, fn: (conn: PoolConnection, g: GiveawayDb) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<GiveawayDb[]>("SELECT * FROM giveaways WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) throw new Error("giveaway_not_found");
    const result = await fn(conn, rows[0]);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally { conn.release(); }
}

export async function getEligibleEntries(giveawayId: number): Promise<EntryRow[]> {
  const g = await getGiveaway(giveawayId);
  return g ? (await getEntries(giveawayId)).filter((e) => entryEligible(e, g)) : [];
}

export async function recordLiveEntry(giveawayId: number, username: string, isSubscriber: boolean, avatar: string | null = null): Promise<boolean> {
  return withGiveaway(giveawayId, async (conn, g) => {
    if (!collectionOpen(g)) return false;
    if (g.subscribers_only && !isSubscriber) return false;
    await conn.query(
      `INSERT INTO giveaway_entries (giveaway_id, kick_username, avatar, is_subscriber, message_count)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE avatar = COALESCE(VALUES(avatar), avatar),
         is_subscriber = VALUES(is_subscriber), message_count = message_count + 1`,
      [giveawayId, username.trim(), avatar, isSubscriber ? 1 : 0]
    );
    return true;
  });
}

export async function setEntryExcluded(giveawayId: number, username: string, excluded: boolean): Promise<void> {
  await withGiveaway(giveawayId, async (conn, g) => {
    if (g.drawn_entrants) throw new Error("draw_pool_locked");
    await conn.query("UPDATE giveaway_entries SET excluded = ? WHERE giveaway_id = ? AND kick_username = ?", [excluded ? 1 : 0, giveawayId, username]);
  });
}

export async function setGiveawayFilters(id: number, subscribersOnly: boolean, minMessages: number): Promise<void> {
  await withGiveaway(id, async (conn, g) => {
    if (g.drawn_entrants) throw new Error("draw_pool_locked");
    await conn.query("UPDATE giveaways SET subscribers_only = ?, min_messages = ? WHERE id = ?", [subscribersOnly ? 1 : 0, minMessages, id]);
  });
}

// The webhook supplies its transaction so message deduplication and every
// entry write commit together. Failures propagate and Kick can retry safely.
export async function recordChatEntry(username: string, content: string, avatar: string | null, isSubscriber: boolean, conn: PoolConnection): Promise<void> {
  const [opens] = await conn.query<GiveawayDb[]>(
    "SELECT * FROM giveaways WHERE status = 'open' AND type = 'keyword' AND keyword IS NOT NULL ORDER BY id FOR UPDATE"
  );
  const normalized = content.trim().toLowerCase();
  for (const g of opens) {
    if (!collectionOpen(g)) continue;
    const keyword = String(g.keyword).trim().toLowerCase();
    if (!keyword) continue;
    if (normalized.startsWith(keyword) && (!g.subscribers_only || isSubscriber)) {
      await conn.query(
        `INSERT INTO giveaway_entries (giveaway_id, kick_username, avatar, is_subscriber, message_count)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE avatar = COALESCE(VALUES(avatar), avatar), is_subscriber = VALUES(is_subscriber), message_count = message_count + 1`,
        [g.id, username, avatar, isSubscriber ? 1 : 0]
      );
    }
  }
}

// ── admin ──

export async function createGiveaway(input: {
  title: string;
  type: "manual" | "keyword";
  keyword: string | null;
  entry_condition: string;
  prize: string;
  subscribers_only: boolean;
  min_messages: number;
  ends_at: string | null;
}): Promise<number> {
  // commit the server seed up front (publish its hash, keep the seed)
  const serverSeed = generateServerSeed();
  const seedHash = sha256(serverSeed);
  const [res] = await getPool().query<ResultSetHeader>(
    `INSERT INTO giveaways (title, type, keyword, entry_condition, prize, subscribers_only, min_messages, ends_at, server_seed, server_seed_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
    [
      input.title,
      input.type,
      input.keyword,
      input.entry_condition,
      input.prize,
      input.subscribers_only ? 1 : 0,
      input.min_messages,
      input.ends_at,
      serverSeed,
      seedHash,
    ]
  );
  return res.insertId;
}

export async function addManualEntry(giveawayId: number, username: string): Promise<void> {
  await recordLiveEntry(giveawayId, username, false);
}

// Preview-only: load sample entrants so the operator can rehearse the reel
// before going live. Clearly a test action in the UI; wiped by clearEntries.
// Real Kick handles so the rehearsal reel shows REAL profile avatars (resolved
// on insert). Unknown/404 handles just fall back to initials — never faked.
const TEST_HANDLES = [
  "xqc", "trainwreckstv", "roshtein", "adinross", "ac7ionman", "nickmercs",
  "westcol", "ibai", "amouranth", "buddha", "yuuukine", "mellstroy",
];
export async function addTestEntrants(giveawayId: number, n = 8): Promise<void> {
  const picks = [...TEST_HANDLES].sort(() => Math.random() - 0.5).slice(0, Math.min(n, TEST_HANDLES.length));
  // resolve real avatars in parallel (cached; null → initials fallback)
  const avatars = await Promise.all(
    picks.map((u) => resolveKickAvatar(u).catch(() => null))
  );
  await withGiveaway(giveawayId, async (conn, g) => {
    if (!collectionOpen(g)) throw new Error("collection_closed");
    for (let i = 0; i < picks.length; i++) {
      await conn.query(
        `INSERT INTO giveaway_entries (giveaway_id, kick_username, avatar, is_subscriber, message_count)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE avatar = COALESCE(VALUES(avatar), avatar), message_count = message_count + 1`,
        [giveawayId, picks[i], avatars[i], Math.random() < 0.4 ? 1 : 0]
      );
    }
  });
}

export async function clearEntries(giveawayId: number): Promise<void> {
  await withGiveaway(giveawayId, async (conn) => {
    const seed = generateServerSeed();
    await conn.query("DELETE FROM giveaway_entries WHERE giveaway_id = ?", [giveawayId]);
    await conn.query("DELETE FROM giveaway_winners WHERE giveaway_id = ?", [giveawayId]);
    await conn.query(
      "UPDATE giveaways SET drawn_entrants = NULL, drawn_at = NULL, server_seed = ?, server_seed_hash = ?, ends_at = NULL, status = 'open' WHERE id = ?",
      [seed, sha256(seed), giveawayId]
    );
  });
}

export async function setGiveawayStatus(id: number, status: Giveaway["status"]): Promise<void> {
  await withGiveaway(id, async (conn, g) => {
    // 'drawn' is assigned only by an actual draw. 'closed' pauses collection
    // before a draw, or finalizes/reveals a completed round.
    if (status === "drawn") throw new Error("use_draw_action");
    if (status === "open" && (!String(g.server_seed).startsWith("v2") || g.drawn_entrants)) throw new Error("round_already_drawn");
    if (status === "open" && g.ends_at && !collectionOpen({ ...g, status: "open" })) throw new Error("giveaway_expired");
    await conn.query("UPDATE giveaways SET status = ? WHERE id = ?", [status, id]);
  });
}

// Deletes a giveaway and (via FK cascade) its entries + winners.
export async function deleteGiveaway(id: number): Promise<void> {
  await getPool().query("DELETE FROM giveaways WHERE id = ?", [id]);
}

export interface WinnerRow {
  username: string;
  avatar: string | null;
  nonce: number;
}

export async function getWinners(giveawayId: number): Promise<WinnerRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT kick_username, avatar, nonce FROM giveaway_winners WHERE giveaway_id = ? ORDER BY nonce ASC",
    [giveawayId]
  );
  return rows.map((r) => ({ username: String(r.kick_username), avatar: (r.avatar as string) ?? null, nonce: Number(r.nonce) }));
}

export interface DrawResult {
  username: string;
  avatar: string | null;
  nonce: number;
  index: number;
}

function parseSnapshot(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Serialize draws and assign a fresh nonce to EVERY pick. Repeated winners,
// including back-to-back wins, are deliberately allowed.
export async function drawWinners(giveawayId: number, count: number): Promise<DrawResult[]> {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("invalid_count");
  return withGiveaway(giveawayId, async (conn, g) => {
    if (!g.server_seed || !String(g.server_seed).startsWith("v2")) throw new Error("round_finished");
    if (g.drawn_entrants && (g.status === "closed" || !String(g.server_seed).startsWith("v2"))) throw new Error("round_finished");
    const [current] = await conn.query<RowDataPacket[]>(
      "SELECT kick_username, avatar, is_subscriber, message_count, excluded FROM giveaway_entries WHERE giveaway_id = ? ORDER BY created_at ASC, id ASC", [giveawayId]
    );
    let names = parseSnapshot(g.drawn_entrants);
    if (!names) {
      names = current.filter((e) => entryEligible({ excluded: e.excluded, is_subscriber: e.is_subscriber, message_count: e.message_count }, g)).map((e) => String(e.kick_username));
      if (!names.length) return [];
      await conn.query("UPDATE giveaways SET drawn_entrants = CAST(? AS JSON) WHERE id = ?", [JSON.stringify(names), giveawayId]);
    }
    if (!names.length) return [];
    const hash = entriesHash(names);
    const [rows] = await conn.query<RowDataPacket[]>("SELECT MAX(nonce) AS last_nonce FROM giveaway_winners WHERE giveaway_id = ?", [giveawayId]);
    let nonce = Number(rows[0]?.last_nonce ?? -1) + 1;
    const results: DrawResult[] = [];
    for (let i = 0; i < count; i++, nonce++) {
      const index = winnerIndex(String(g.server_seed), hash, nonce, names.length);
      const username = names[index];
      const avatar = current.find((e) => String(e.kick_username).toLowerCase() === username.toLowerCase())?.avatar ?? null;
      const [won] = await conn.query<ResultSetHeader>(
        `INSERT INTO giveaway_winners (giveaway_id, kick_username, avatar, prize, nonce, winner_index, entrant_count, entries_hash, server_seed, server_seed_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [giveawayId, username, avatar, g.prize, nonce, index, names.length, hash, g.server_seed, g.server_seed_hash]
      );
      // pending until the admin confirms the winner received it (Admin → Prizes)
      await recordAward(conn, { source: "giveaway", sourceRef: `gw:${won.insertId}`, title: String(g.title || "Giveaway"), winner: username, prizeLabel: String(g.prize ?? "") });
      results.push({ username, avatar, nonce, index });
    }
    await conn.query("UPDATE giveaways SET status = 'drawn', drawn_at = NOW() WHERE id = ?", [giveawayId]);
    return results;
  });
}

// ── verification (public /verify) ──

export interface Verification {
  giveaway: { id: number; title: string; prize: string; status: string };
  serverSeedHash: string;
  serverSeed: string | null; // revealed when the round is finished
  entrants: string[]; // ordered, full handles (public chat names)
  winners: { username: string; nonce: number; index: number; entriesHash: string }[];
}

export async function getVerification(giveawayId: number): Promise<Verification | null> {
  const pool = getPool();
  const [grows] = await pool.query<RowDataPacket[]>(
    "SELECT id, title, prize, status, server_seed, server_seed_hash, drawn_entrants FROM giveaways WHERE id = ? LIMIT 1",
    [giveawayId]
  );
  const g = grows[0];
  if (!g) return null;

  // the verifiable pool is the draw-time snapshot if present, else the current
  // eligible entrants (before any draw)
  const snapshot = parseSnapshot(g.drawn_entrants);
  const entrants = snapshot ?? (await getEligibleEntries(giveawayId)).map((e) => e.username);
  const [wrows] = await pool.query<RowDataPacket[]>(
    "SELECT kick_username, nonce, winner_index, entries_hash FROM giveaway_winners WHERE giveaway_id = ? ORDER BY nonce ASC",
    [giveawayId]
  );
  const drawn = Boolean(snapshot) && (g.status === "closed" || (g.status === "drawn" && !String(g.server_seed).startsWith("v2")));

  return {
    giveaway: { id: g.id as number, title: g.title as string, prize: g.prize as string, status: g.status as string },
    serverSeedHash: String(g.server_seed_hash ?? ""),
    serverSeed: drawn ? (g.server_seed as string) ?? null : null,
    entrants,
    winners: wrows.map((w) => ({
      username: String(w.kick_username),
      nonce: Number(w.nonce),
      index: Number(w.winner_index),
      entriesHash: String(w.entries_hash ?? ""),
    })),
  };
}
