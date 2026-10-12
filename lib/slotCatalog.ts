import "server-only";
import { createHash, randomInt } from "node:crypto";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { EventError, withTx, lockApp } from "./events/common";

// Slot catalogue backed by slot.report (real names, providers and ids; the
// API key is tied to the dofollow credit link in the footer). There is no
// public Stake game API, so availability on Stake specifically is not
// verified — this is the general slot catalogue.
//
// Thumbnails: slot.report serves a branded placeholder (HTTP 200) for slots it
// has no art for, which is most of the catalogue. Every thumbnail is fetched
// once and compared with that placeholder's hash; only verified images are
// ever shown or stored, everything else renders as a name tile.

const API_URL = "https://slot.report/api/v1/slots.json";
const thumbUrl = (slug: string) => `https://slot.report/images/slots/${encodeURIComponent(slug)}-thumb.webp`;
const SYNC_MAX_AGE_H = 24;
const PRIORITY_PROVIDERS = [
  "pragmatic-play", "hacksaw-gaming", "nolimit-city", "push-gaming", "relax-gaming", "elk-studios", "big-time-gaming",
  "playngo", "netent", "red-tiger", "thunderkick", "bgaming", "avatar-ux", "backseat-gaming", "bullshark-games", "print-studios", "octoplay",
];

export interface CatalogSlot {
  id: string;
  name: string;
  provider: string;
  imageUrl: string | null;
  imageStatus: "unknown" | "real" | "missing";
  ambiguous: boolean;
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

// ── sync ──

interface RemoteSlot {
  name: string;
  slug: string;
  provider: string;
  provider_slug: string;
}

export async function syncCatalog(): Promise<{ total: number; ambiguous: number }> {
  const apiKey = process.env.SLOT_REPORT_API_KEY;
  if (!apiKey) throw new EventError("slot_api_missing", "SLOT_REPORT_API_KEY is not set");
  const res = await fetch(API_URL, { headers: { "X-API-Key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new EventError("slot_api_failed", `slot.report answered ${res.status}`);
  const data = (await res.json()) as { results?: RemoteSlot[] };
  const rows = (data.results ?? []).filter((s) => s.name && s.slug && s.provider && s.provider_slug);
  if (rows.length < 100) throw new EventError("slot_api_failed", `only ${rows.length} slots returned`);

  const slugCount = new Map<string, number>();
  for (const s of rows) slugCount.set(s.slug, (slugCount.get(s.slug) ?? 0) + 1);
  const seen = new Set<string>();
  const values: unknown[][] = [];
  for (const s of rows) {
    const id = `${s.provider_slug}/${s.slug}`.slice(0, 191);
    if (seen.has(id)) continue;
    seen.add(id);
    values.push([id, s.slug.slice(0, 191), s.name.slice(0, 191), normalizeName(s.name).slice(0, 191), s.provider.slice(0, 120), s.provider_slug.slice(0, 120), (slugCount.get(s.slug) ?? 1) > 1 ? 1 : 0]);
  }

  await withTx(async (conn) => {
    await lockApp(conn, "slots");
    await conn.query("UPDATE slot_catalog SET active = 0");
    for (let i = 0; i < values.length; i += 500) {
      await conn.query(
        `INSERT INTO slot_catalog (id, slug, name, name_norm, provider, provider_slug, ambiguous, active, synced_at) VALUES ?
         ON DUPLICATE KEY UPDATE name = VALUES(name), name_norm = VALUES(name_norm), provider = VALUES(provider),
           ambiguous = VALUES(ambiguous), active = 1, synced_at = VALUES(synced_at)`,
        [values.slice(i, i + 500).map((v) => [...v, 1, new Date().toISOString().slice(0, 19).replace("T", " ")])]
      );
    }
  });
  cache = null;
  return { total: values.length, ambiguous: values.filter((v) => v[6] === 1).length };
}

export async function catalogIsStale(): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n, MAX(synced_at) < UTC_TIMESTAMP() - INTERVAL ? HOUR AS stale FROM slot_catalog WHERE active = 1",
    [SYNC_MAX_AGE_H]
  );
  return Number(rows[0].n) === 0 || Number(rows[0].stale) === 1;
}

// ── thumbnail verification ──

let placeholderHash: string | null = null;

async function fetchHash(url: string): Promise<{ status: number; type: string; hash: string } | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, type: res.headers.get("content-type") ?? "", hash: createHash("sha256").update(buf).digest("hex") };
  } catch {
    return null;
  }
}

async function getPlaceholderHash(): Promise<string> {
  if (placeholderHash) return placeholderHash;
  const probe = await fetchHash(thumbUrl(`odt-missing-probe-${randomInt(1e9)}`));
  if (!probe) throw new EventError("slot_images_unreachable");
  placeholderHash = probe.hash;
  return placeholderHash;
}

/** Pure decision used by verification (unit-tested). */
export function classifyThumb(r: { status: number; type: string; hash: string } | null, placeholder: string): "real" | "missing" | null {
  if (!r) return null; // network error: leave unknown, retry later
  if (r.status === 404 || r.status === 410) return "missing";
  if (r.status !== 200 || !r.type.startsWith("image/")) return null;
  return r.hash === placeholder ? "missing" : "real";
}

async function verifyIds(ids: { id: string; slug: string }[]): Promise<{ real: number; missing: number }> {
  if (!ids.length) return { real: 0, missing: 0 };
  const placeholder = await getPlaceholderHash();
  const out = { real: 0, missing: 0 };
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const item = ids[next++];
      const verdict = classifyThumb(await fetchHash(thumbUrl(item.slug)), placeholder);
      if (!verdict) continue;
      out[verdict]++;
      await getPool().query(
        "UPDATE slot_catalog SET image_status = ?, image_url = ?, image_checked_at = UTC_TIMESTAMP() WHERE id = ?",
        [verdict, verdict === "real" ? thumbUrl(item.slug) : null, item.id]
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(12, ids.length) }, worker));
  cache = null;
  return out;
}

/** Check the next batch of unchecked thumbnails (cron / admin button). */
export async function verifyBatch(limit = 400): Promise<{ checked: number; real: number; missing: number }> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    // Providers streamers play most are checked first so the tournament pool
    // fills with recognisable slots; the rest follow on later runs.
    `SELECT id, slug FROM slot_catalog WHERE active = 1 AND image_status = 'unknown'
     ORDER BY ambiguous ASC, FIELD(provider_slug, ${PRIORITY_PROVIDERS.map(() => "?").join(",")}) = 0, FIELD(provider_slug, ${PRIORITY_PROVIDERS.map(() => "?").join(",")}), id ASC LIMIT ?`,
    [...PRIORITY_PROVIDERS, ...PRIORITY_PROVIDERS, limit]
  );
  const r = await verifyIds(rows.map((x) => ({ id: String(x.id), slug: String(x.slug) })));
  return { checked: rows.length, ...r };
}

export interface CatalogStats {
  total: number;
  real: number;
  missing: number;
  unknown: number;
  ambiguous: number;
  pool: number;
  syncedAt: string | null;
}

export async function getCatalogStats(): Promise<CatalogStats> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) total, SUM(image_status='real') real_n, SUM(image_status='missing') missing_n,
            SUM(image_status='unknown') unknown_n, SUM(ambiguous) amb,
            SUM(image_status='real' AND ambiguous=0) pool, MAX(synced_at) synced
     FROM slot_catalog WHERE active = 1`
  );
  const r = rows[0];
  return {
    total: Number(r.total), real: Number(r.real_n ?? 0), missing: Number(r.missing_n ?? 0), unknown: Number(r.unknown_n ?? 0),
    ambiguous: Number(r.amb ?? 0), pool: Number(r.pool ?? 0), syncedAt: r.synced ? String(r.synced) : null,
  };
}

// ── search ──

/** Lower = more likely to be the right provider when the catalogue lists a slug twice. */
function providerRank(slug: string): number {
  const i = PRIORITY_PROVIDERS.indexOf(slug);
  return i < 0 ? PRIORITY_PROVIDERS.length : i;
}

interface CacheRow { id: string; slug: string; name: string; norm: string; provider: string; provider_slug: string; status: CatalogSlot["imageStatus"]; image: string | null; ambiguous: boolean }
let cache: { rows: CacheRow[]; at: number } | null = null;

async function loadCache(): Promise<CacheRow[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.rows;
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, slug, name, name_norm, provider, provider_slug, image_status, image_url, ambiguous FROM slot_catalog WHERE active = 1"
  );
  const list = rows.map((r) => ({
    id: String(r.id), slug: String(r.slug), name: String(r.name), norm: String(r.name_norm), provider: String(r.provider), provider_slug: String(r.provider_slug),
    status: r.image_status as CacheRow["status"], image: (r.image_url as string) ?? null, ambiguous: Boolean(r.ambiguous),
  }));
  cache = { rows: list, at: Date.now() };
  return list;
}

function toSlot(r: CacheRow): CatalogSlot {
  return { id: r.id, name: r.name, provider: r.provider, imageUrl: r.status === "real" ? r.image : null, imageStatus: r.status, ambiguous: r.ambiguous };
}

/** Fuzzy search; thumbnails of the returned slots are verified on demand. */
export async function searchCatalog(query: string, limit = 10): Promise<CatalogSlot[]> {
  const q = normalizeName(query).slice(0, 80);
  if (q.length < 2) return [];
  const rows = await loadCache();
  const scored = rows
    .map((r) => ({ r, s: scoreName(q, r.norm) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.r.ambiguous === b.r.ambiguous ? 0 : a.r.ambiguous ? 1 : -1) || providerRank(a.r.provider_slug) - providerRank(b.r.provider_slug) || a.r.name.localeCompare(b.r.name))
    .slice(0, limit)
    .map((x) => x.r);
  const unchecked = scored.filter((r) => r.status === "unknown");
  if (unchecked.length) {
    try {
      await verifyIds(unchecked.map((r) => ({ id: r.id, slug: r.slug })));
      const fresh = await getSlotsByIds(scored.map((r) => r.id));
      return scored.map((r) => fresh.get(r.id) ?? toSlot(r));
    } catch {
      /* image host unreachable: show what we know, no image */
    }
  }
  return scored.map(toSlot);
}

export async function getSlotsByIds(ids: string[]): Promise<Map<string, CatalogSlot>> {
  if (!ids.length) return new Map();
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, name, provider, image_status, image_url, ambiguous FROM slot_catalog WHERE id IN (?)",
    [ids]
  );
  return new Map(rows.map((r) => [String(r.id), {
    id: String(r.id), name: String(r.name), provider: String(r.provider),
    imageUrl: r.image_status === "real" ? (r.image_url as string) : null,
    imageStatus: r.image_status as CatalogSlot["imageStatus"], ambiguous: Boolean(r.ambiguous),
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
 * Uniformly random slot from the verified pool (real thumbnail, unambiguous
 * provider), avoiding `exclude` when possible. crypto.randomInt, not Math.random.
 */
export async function randomPoolSlot(conn: PoolConnection, exclude: string[] = []): Promise<AssignedSlot> {
  const base = "FROM slot_catalog WHERE active = 1 AND image_status = 'real' AND ambiguous = 0 AND image_url IS NOT NULL";
  const pick = async (withExclude: boolean) => {
    const cond = withExclude && exclude.length ? " AND id NOT IN (?)" : "";
    const args = withExclude && exclude.length ? [exclude] : [];
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
