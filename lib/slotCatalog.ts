import "server-only";
import { randomInt } from "node:crypto";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { EventError, withTx, lockApp } from "./events/common";

// Slot catalogue = Stake's own catalogue, from the sharkz.gg feed (used with
// Sharkz's permission). Every slot carries its official Stake art (served by
// Stake's image CDN, mediumrare.imgix.net), provider, the "Only on Stake"
// flag and Stake's popularity rank (0 = most played). Synced daily by the
// cron and on demand from Admin → Slot catalogue. No image is ever added by
// hand: a slot not in the feed simply has no art (name tile).

const FEED_URL = process.env.STAKE_SLOTS_FEED_URL || "https://api.sharkz.gg/api/slots";
const SYNC_MAX_AGE_H = 24;
/** Random tournament slots come from Stake's most played (same rule as the feed's "main" list). */
export const POOL_TOP = 1000;

export interface CatalogSlot {
  id: string;
  name: string;
  provider: string;
  imageUrl: string | null;
  onlyOnStake: boolean;
}

/** Lowercase, strip marks/symbols (®, ™, accents), collapse whitespace. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

/**
 * Relevance of a catalogue name for a query (both normalised). Exact > prefix
 * > every query word present > fuzzy trigram similarity (typos, missing
 * words). 0 = no match.
 */
export function scoreName(query: string, name: string): number {
  if (!query) return 0;
  if (name === query) return 1000;
  if (name.startsWith(query)) return 800 - Math.min(name.length - query.length, 100);
  const words = query.split(" ");
  const nameWords = name.split(" ");
  if (words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 600 - Math.min(name.length, 100);
  if (name.includes(query)) return 500;
  const a = trigrams(query);
  const b = trigrams(name);
  let common = 0;
  for (const g of a) if (b.has(g)) common++;
  const dice = (2 * common) / (a.size + b.size);
  return dice >= 0.45 ? Math.round(dice * 400) : 0;
}

// ── Stake feed ──

export interface StakeSlotRow {
  id: string;
  slug: string;
  name: string;
  provider: string;
  imageUrl: string | null;
  onlyOnStake: boolean;
  popularity: number | null;
}

interface StakeFeed {
  generated?: string;
  image_base?: string;
  providers?: string[];
  slots?: unknown[][];
}

/** Stake CDN art at thumbnail size (imgix resizes and picks webp/avif). */
export function stakeImageUrl(base: string, image: string): string {
  return `${base}${image}?w=280&h=367&fit=min&auto=format`;
}

/** Feed rows: [position, name, providerIdx, slug, image, rtp, bonus_buy, only_on_stake, max_win, volatility, popularity_rank]. */
export function parseStakeFeed(feed: StakeFeed): StakeSlotRow[] {
  const base = typeof feed.image_base === "string" && /^https:\/\/[a-z0-9.-]+\//i.test(feed.image_base) ? feed.image_base : "https://mediumrare.imgix.net/";
  const providers = Array.isArray(feed.providers) ? feed.providers : [];
  const seen = new Set<string>();
  const out: StakeSlotRow[] = [];
  for (const s of feed.slots ?? []) {
    if (!Array.isArray(s)) continue;
    const name = typeof s[1] === "string" ? s[1].trim().slice(0, 191) : "";
    const slug = typeof s[3] === "string" ? s[3].trim().slice(0, 150) : "";
    if (!name || !slug || seen.has(slug)) continue;
    seen.add(slug);
    const image = typeof s[4] === "string" && /^[a-z0-9]{16,128}$/i.test(s[4]) ? s[4] : null;
    const provider = typeof s[2] === "number" && typeof providers[s[2]] === "string" ? providers[s[2]].slice(0, 120) : "";
    out.push({
      id: `stake/${slug}`,
      slug,
      name,
      provider,
      imageUrl: image ? stakeImageUrl(base, image) : null,
      onlyOnStake: s[7] === 1,
      popularity: typeof s[10] === "number" && Number.isFinite(s[10]) ? Math.trunc(s[10]) : null,
    });
  }
  return out;
}

/** Upserts the Stake catalogue; deactivates slots no longer in it and all rows from older sources. */
export async function importStakeCatalog(rows: StakeSlotRow[]): Promise<{ total: number; onlyOnStake: number }> {
  if (rows.length < 500) throw new EventError("slot_api_failed", `only ${rows.length} slots in the feed`);
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  await withTx(async (conn) => {
    await lockApp(conn, "slots");
    await conn.query("UPDATE slot_catalog SET active = 0");
    for (let i = 0; i < rows.length; i += 1000) {
      await conn.query(
        `INSERT INTO slot_catalog (id, slug, name, name_norm, provider, provider_slug, image_status, image_url, image_checked_at,
                                   ambiguous, on_stake, only_on_stake, popularity, source, active, synced_at) VALUES ?
         ON DUPLICATE KEY UPDATE name = VALUES(name), name_norm = VALUES(name_norm), provider = VALUES(provider),
           provider_slug = VALUES(provider_slug), image_status = VALUES(image_status), image_url = VALUES(image_url),
           only_on_stake = VALUES(only_on_stake), popularity = VALUES(popularity), on_stake = 1, source = 'stake', active = 1,
           synced_at = VALUES(synced_at)`,
        [rows.slice(i, i + 1000).map((r) => [
          r.id, r.slug, r.name, normalizeName(r.name).slice(0, 191), r.provider, normalizeName(r.provider).replace(/ /g, "-").slice(0, 120),
          r.imageUrl ? "real" : "missing", r.imageUrl, now, 0, 1, r.onlyOnStake ? 1 : 0, r.popularity, "stake", 1, now,
        ])]
      );
    }
  });
  cache = null;
  return { total: rows.length, onlyOnStake: rows.filter((r) => r.onlyOnStake).length };
}

export async function syncCatalog(): Promise<{ total: number; onlyOnStake: number; generated: string | null }> {
  const res = await fetch(FEED_URL, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new EventError("slot_api_failed", `slot feed answered ${res.status}`);
  const feed = (await res.json()) as StakeFeed;
  const result = await importStakeCatalog(parseStakeFeed(feed));
  return { ...result, generated: typeof feed.generated === "string" ? feed.generated : null };
}

export async function catalogIsStale(): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n, MAX(synced_at) < UTC_TIMESTAMP() - INTERVAL ? HOUR AS stale FROM slot_catalog WHERE active = 1 AND source = 'stake'",
    [SYNC_MAX_AGE_H]
  );
  return Number(rows[0].n) === 0 || Number(rows[0].stale) === 1;
}

export interface CatalogStats {
  total: number;
  withArt: number;
  onlyOnStake: number;
  providers: number;
  pool: number;
  syncedAt: string | null;
}

export async function getCatalogStats(): Promise<CatalogStats> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) total, SUM(image_status = 'real') art, SUM(only_on_stake) only_n, COUNT(DISTINCT provider) prov,
            SUM(image_status = 'real' AND popularity IS NOT NULL AND popularity < ?) pool, MAX(synced_at) synced
     FROM slot_catalog WHERE active = 1`,
    [POOL_TOP]
  );
  const r = rows[0];
  return {
    total: Number(r.total), withArt: Number(r.art ?? 0), onlyOnStake: Number(r.only_n ?? 0), providers: Number(r.prov ?? 0),
    pool: Number(r.pool ?? 0), syncedAt: r.synced ? String(r.synced) : null,
  };
}

// ── search ──

interface CacheRow { id: string; name: string; norm: string; provider: string; image: string | null; onlyOnStake: boolean; popularity: number }
let cache: { rows: CacheRow[]; at: number } | null = null;

async function loadCache(): Promise<CacheRow[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.rows;
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, name, name_norm, provider, image_status, image_url, only_on_stake, popularity FROM slot_catalog WHERE active = 1"
  );
  const list = rows.map((r) => ({
    id: String(r.id), name: String(r.name), norm: String(r.name_norm), provider: String(r.provider),
    image: r.image_status === "real" && r.image_url ? String(r.image_url) : null,
    onlyOnStake: Boolean(r.only_on_stake),
    popularity: r.popularity != null ? Number(r.popularity) : Number.MAX_SAFE_INTEGER,
  }));
  cache = { rows: list, at: Date.now() };
  return list;
}

const toSlot = (r: CacheRow): CatalogSlot => ({ id: r.id, name: r.name, provider: r.provider, imageUrl: r.image, onlyOnStake: r.onlyOnStake });

/** Match quality tier: exact (4) > starts with (3) > every word / contains (2) > approximate (1). */
function tier(score: number): number {
  return score >= 1000 ? 4 : score >= 700 ? 3 : score >= 500 ? 2 : 1;
}

/** Fuzzy search; within the same match tier the slot most played on Stake comes first. */
export async function searchCatalog(query: string, limit = 10): Promise<CatalogSlot[]> {
  const q = normalizeName(query).slice(0, 80);
  if (q.length < 2) return [];
  return (await loadCache())
    .map((r) => ({ r, s: scoreName(q, r.norm) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => tier(b.s) - tier(a.s) || (tier(a.s) === 1 ? b.s - a.s : 0) || a.r.popularity - b.r.popularity || b.s - a.s || a.r.name.localeCompare(b.r.name))
    .slice(0, limit)
    .map((x) => toSlot(x.r));
}

export async function getSlotsByIds(ids: string[]): Promise<Map<string, CatalogSlot>> {
  if (!ids.length) return new Map();
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, name, provider, image_status, image_url, only_on_stake FROM slot_catalog WHERE id IN (?)",
    [ids]
  );
  return new Map(rows.map((r) => [String(r.id), {
    id: String(r.id), name: String(r.name), provider: String(r.provider),
    imageUrl: r.image_status === "real" && r.image_url ? String(r.image_url) : null,
    onlyOnStake: Boolean(r.only_on_stake),
  }]));
}

export async function getSlot(id: string): Promise<CatalogSlot | null> {
  return (await getSlotsByIds([id])).get(id) ?? null;
}

// ── random assignment (tournament) ──

export interface AssignedSlot {
  id: string;
  name: string;
  provider: string;
  imageUrl: string;
}

/**
 * Uniformly random slot among Stake's POOL_TOP most played with art,
 * avoiding `exclude` when possible (crypto.randomInt, not Math.random).
 */
export async function randomPoolSlot(conn: PoolConnection, exclude: string[] = []): Promise<AssignedSlot> {
  const base = "FROM slot_catalog WHERE active = 1 AND image_status = 'real' AND image_url IS NOT NULL AND popularity IS NOT NULL AND popularity < ?";
  const pick = async (withExclude: boolean) => {
    const cond = withExclude && exclude.length ? " AND id NOT IN (?)" : "";
    const args: unknown[] = withExclude && exclude.length ? [POOL_TOP, exclude] : [POOL_TOP];
    const [count] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n ${base}${cond}`, args);
    const n = Number(count[0].n);
    if (n === 0) return null;
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT id, name, provider, image_url ${base}${cond} ORDER BY id LIMIT 1 OFFSET ?`, [...args, randomInt(n)]);
    return rows[0] ?? null;
  };
  const row = (await pick(true)) ?? (await pick(false));
  if (!row) throw new EventError("slot_pool_empty");
  return { id: String(row.id), name: String(row.name), provider: String(row.provider), imageUrl: String(row.image_url) };
}

// ── viewer-chosen slot (`!join <slot name>`) ──

export interface ChosenSlot extends AssignedSlot {
  /** false = not in the catalogue: kept exactly as typed, no art, no provider */
  matched: boolean;
}

/** Text a viewer typed after `!join`, minus Kick emote tokens; null when empty. */
export function cleanSlotRequest(raw: string): string | null {
  const t = raw.replace(/\[emote:\d+:[^\]]*\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return normalizeName(t).length >= 2 ? t : null;
}

/**
 * The slot a viewer asked for. Strong catalogue match (exact, prefix, every
 * word, or a close typo) → its Stake name, provider and art; among near-equal
 * matches the most played on Stake wins ("wanted" → Wanted Dead or a Wild).
 * No confident match → the name as typed, never a different game.
 */
export async function findSlotByName(raw: string): Promise<ChosenSlot | null> {
  const typed = cleanSlotRequest(raw);
  if (!typed) return null;
  const q = normalizeName(typed);
  // Strict on purpose: below ~0.7 trigram similarity a "typo" can't be told
  // apart from a different game ("fist of demolition" ≈ "Fist of Destruction").
  const scored = (await loadCache()).map((r) => ({ r, s: scoreName(q, r.norm) })).filter((x) => x.s >= 280);
  const top = scored.reduce((m, x) => Math.max(m, x.s), 0);
  const near = scored.filter((x) => x.s >= top - (top >= 500 ? 30 : 0));
  near.sort((a, b) => Number(Boolean(b.r.image)) - Number(Boolean(a.r.image)) || a.r.popularity - b.r.popularity || b.s - a.s);
  const best = near[0]?.r;
  if (!best) return { id: `typed/${q.replace(/ /g, "-")}`.slice(0, 191), name: typed, provider: "", imageUrl: "", matched: false };
  return { id: best.id, name: best.name, provider: best.provider, imageUrl: best.image ?? "", matched: true };
}
