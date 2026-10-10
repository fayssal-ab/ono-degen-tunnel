import "server-only";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getPool } from "./db";
import { generateServerSeed, sha256, entriesHash, winnerIndex } from "./fair";

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
    subscribers_only: Boolean(r.subscribers_only),
    min_messages: Number(r.min_messages),
    ends_at: (r.ends_at as string) ?? null,
    entrants: Number(r.entrants ?? 0),
    server_seed_hash: (r.server_seed_hash as string) ?? null,
  };
}

const LIST_COLS = `g.id, g.title, g.type, g.keyword, g.entry_condition, g.prize, g.status,
  g.subscribers_only, g.min_messages, g.ends_at, g.server_seed_hash,
  (SELECT COUNT(*) FROM giveaway_entries e WHERE e.giveaway_id = g.id) AS entrants`;

export async function getOpenGiveaways(): Promise<Giveaway[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${LIST_COLS} FROM giveaways g WHERE g.status = 'open' ORDER BY g.created_at DESC`
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

/** Eligible (non-excluded) entrants in draw order. */
export async function getEligibleEntries(giveawayId: number): Promise<EntryRow[]> {
  return (await getEntries(giveawayId)).filter((e) => !e.excluded);
}

// Records a live chat entry (from the browser Kick-socket reader) for one open
// giveaway. Honors subscribers_only. Returns whether it was recorded. The
// keyword match already happened client-side, so this just upserts.
export async function recordLiveEntry(
  giveawayId: number,
  username: string,
  isSubscriber: boolean,
  avatar: string | null = null
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT subscribers_only, status FROM giveaways WHERE id = ? LIMIT 1",
    [giveawayId]
  );
  const g = rows[0];
  if (!g || g.status !== "open") return false;
  if (g.subscribers_only && !isSubscriber) return false;
  await pool.query(
    `INSERT INTO giveaway_entries (giveaway_id, kick_username, avatar, is_subscriber, message_count)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE avatar = COALESCE(VALUES(avatar), avatar),
       is_subscriber = VALUES(is_subscriber), message_count = message_count + 1`,
    [giveawayId, username.trim(), avatar, isSubscriber ? 1 : 0]
  );
  return true;
}

export async function setEntryExcluded(giveawayId: number, username: string, excluded: boolean): Promise<void> {
  await getPool().query(
    "UPDATE giveaway_entries SET excluded = ? WHERE giveaway_id = ? AND kick_username = ?",
    [excluded ? 1 : 0, giveawayId, username]
  );
}

// Called by the Kick webhook for every chat message. Matches the keyword of
// any OPEN keyword giveaway and records/【bumps the entry. Respects
// subscribers_only at entry time (so the draw pool is already eligible and
// stays verifiable). Never throws.
export async function recordChatEntry(
  username: string,
  content: string,
  avatar: string | null,
  isSubscriber: boolean
): Promise<void> {
  try {
    const pool = getPool();
    const [opens] = await pool.query<RowDataPacket[]>(
      "SELECT id, keyword, subscribers_only FROM giveaways WHERE status = 'open' AND type = 'keyword' AND keyword IS NOT NULL"
    );
    const normalized = content.trim().toLowerCase();
    for (const g of opens) {
      const keyword = String(g.keyword).trim().toLowerCase();
      if (!keyword) continue;
      const matches = normalized.startsWith(keyword);
      if (g.subscribers_only && !isSubscriber) {
        // bump activity only if already entered; don't create an entry
        await pool.query(
          "UPDATE giveaway_entries SET message_count = message_count + 1, avatar = ? WHERE giveaway_id = ? AND kick_username = ?",
          [avatar, g.id, username]
        );
        continue;
      }
      if (matches) {
        await pool.query(
          `INSERT INTO giveaway_entries (giveaway_id, kick_username, avatar, is_subscriber, message_count)
           VALUES (?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE avatar = VALUES(avatar), is_subscriber = VALUES(is_subscriber), message_count = message_count + 1`,
          [g.id, username, avatar, isSubscriber ? 1 : 0]
        );
      } else {
        await pool.query(
          "UPDATE giveaway_entries SET message_count = message_count + 1, avatar = ? WHERE giveaway_id = ? AND kick_username = ?",
          [avatar, g.id, username]
        );
      }
    }
  } catch {
    /* never wedge the webhook */
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
  await getPool().query(
    `INSERT INTO giveaway_entries (giveaway_id, kick_username, message_count) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE message_count = message_count + 1`,
    [giveawayId, username.trim()]
  );
}

// Preview-only: load sample entrants so the operator can rehearse the reel
// before going live. Clearly a test action in the UI; wiped by clearEntries.
const TEST_HANDLES = [
  "kT_striker", "mellowmars", "nova_lin", "gg_wizard", "frosty_fox", "pixel_pat",
  "echo_rey", "sunny_sol", "midnight_v", "lumen_lux", "turbo_tom", "ace_void",
];
export async function addTestEntrants(giveawayId: number, n = 8): Promise<void> {
  const pool = getPool();
  const picks = [...TEST_HANDLES].sort(() => Math.random() - 0.5).slice(0, Math.min(n, TEST_HANDLES.length));
  for (const u of picks) {
    await pool.query(
      `INSERT INTO giveaway_entries (giveaway_id, kick_username, is_subscriber, message_count)
       VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE message_count = message_count + 1`,
      [giveawayId, u, Math.random() < 0.4 ? 1 : 0]
    );
  }
}

export async function clearEntries(giveawayId: number): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM giveaway_entries WHERE giveaway_id = ?", [giveawayId]);
  await pool.query("DELETE FROM giveaway_winners WHERE giveaway_id = ?", [giveawayId]);
  await pool.query("UPDATE giveaways SET drawn_entrants = NULL, status = 'open' WHERE id = ?", [giveawayId]);
}

export async function setGiveawayStatus(id: number, status: Giveaway["status"]): Promise<void> {
  await getPool().query("UPDATE giveaways SET status = ? WHERE id = ?", [status, id]);
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

// Provably-fair draw. The eligible (non-excluded) entrant pool is snapshotted
// in draw order at the FIRST draw, so the pool + its hash stay fixed for
// verification even if entries change later. Each winner index is derived
// deterministically from the committed seed; nonce continues past existing
// winners and skips repeats, so rerolls never duplicate a winner and every
// pick is reproducible on /verify.
export async function drawWinners(giveawayId: number, count: number): Promise<DrawResult[]> {
  const pool = getPool();
  const [grows] = await pool.query<RowDataPacket[]>(
    "SELECT prize, server_seed, server_seed_hash, drawn_entrants FROM giveaways WHERE id = ? LIMIT 1",
    [giveawayId]
  );
  const g = grows[0];
  if (!g || !g.server_seed) throw new Error("giveaway missing committed seed");

  const current = await getEntries(giveawayId);
  const avatarOf = new Map(current.map((e) => [e.username.toLowerCase(), e.avatar]));

  // locked pool: snapshot if already drawn once, else the current eligible pool
  let poolNames = parseSnapshot(g.drawn_entrants);
  if (!poolNames) {
    poolNames = current.filter((e) => !e.excluded).map((e) => e.username);
    if (poolNames.length === 0) return [];
    await pool.query("UPDATE giveaways SET drawn_entrants = CAST(? AS JSON) WHERE id = ?", [
      JSON.stringify(poolNames),
      giveawayId,
    ]);
  }
  if (poolNames.length === 0) return [];
  const eHash = entriesHash(poolNames);

  const [wrows] = await pool.query<RowDataPacket[]>(
    "SELECT kick_username, nonce FROM giveaway_winners WHERE giveaway_id = ?",
    [giveawayId]
  );
  const alreadyWon = new Set(wrows.map((w) => String(w.kick_username).toLowerCase()));
  let nonce = wrows.reduce((max, w) => Math.max(max, (w.nonce as number) ?? -1), -1) + 1;

  const results: DrawResult[] = [];
  const target = Math.min(count, poolNames.length - alreadyWon.size);
  let guard = 0;
  while (results.length < target && guard < poolNames.length * 4) {
    guard++;
    const idx = winnerIndex(String(g.server_seed), eHash, nonce, poolNames.length);
    const name = poolNames[idx];
    if (!alreadyWon.has(name.toLowerCase())) {
      const avatar = avatarOf.get(name.toLowerCase()) ?? null;
      results.push({ username: name, avatar, nonce, index: idx });
      alreadyWon.add(name.toLowerCase());
      await pool.query(
        `INSERT INTO giveaway_winners
           (giveaway_id, kick_username, avatar, prize, nonce, winner_index, entrant_count, entries_hash, server_seed, server_seed_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [giveawayId, name, avatar, g.prize, nonce, idx, poolNames.length, eHash, g.server_seed, g.server_seed_hash]
      );
    }
    nonce++;
  }

  await pool.query("UPDATE giveaways SET status = 'drawn', drawn_at = NOW() WHERE id = ?", [giveawayId]);
  return results;
}

// ── verification (public /verify) ──

export interface Verification {
  giveaway: { id: number; title: string; prize: string; status: string };
  serverSeedHash: string;
  serverSeed: string | null; // revealed once drawn
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
  const drawn = g.status === "drawn" || g.status === "closed";

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
