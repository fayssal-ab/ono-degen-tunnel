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
  onStake: boolean;
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
    await conn.query("UPDATE slot_catalog SET active = 0 WHERE source = 'slotreport'");
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
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3_500) });
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

/**
 * Checks thumbnails with a time budget: Netlify ends a function after ~10 s,
 * so no new download starts once `budgetMs` has elapsed (each download is
 * capped at 4 s). Results are written in two bulk UPDATEs.
 */
async function verifyIds(ids: { id: string; slug: string }[], budgetMs = 4500): Promise<{ checked: number; real: number; missing: number }> {
  if (!ids.length) return { checked: 0, real: 0, missing: 0 };
  const deadline = Date.now() + budgetMs;
  const placeholder = await getPlaceholderHash();
  const real: string[] = [];
  const missing: string[] = [];
  let next = 0;
  async function worker() {
    while (next < ids.length && Date.now() < deadline) {
      const item = ids[next++];
      const verdict = classifyThumb(await fetchHash(thumbUrl(item.slug)), placeholder);
      if (verdict === "real") real.push(item.id);
      else if (verdict === "missing") missing.push(item.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(16, ids.length) }, worker));
  if (real.length) {
    await getPool().query(
      `UPDATE slot_catalog SET image_status = 'real', image_url = CONCAT('https://slot.report/images/slots/', slug, '-thumb.webp'), image_checked_at = UTC_TIMESTAMP() WHERE id IN (?)`,
      [real]
    );
  }
  if (missing.length) {
    await getPool().query("UPDATE slot_catalog SET image_status = 'missing', image_url = NULL, image_checked_at = UTC_TIMESTAMP() WHERE id IN (?)", [missing]);
  }
  cache = null;
  return { checked: real.length + missing.length, real: real.length, missing: missing.length };
}

/** Check the next batch of unchecked thumbnails (cron / admin button). */
export async function verifyBatch(limit = 300, budgetMs = 4500): Promise<{ checked: number; real: number; missing: number }> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    // Providers streamers play most are checked first so the tournament pool
    // fills with recognisable slots; the rest follow on later runs.
    `SELECT id, slug FROM slot_catalog WHERE active = 1 AND image_status = 'unknown'
     ORDER BY on_stake DESC, ambiguous ASC, FIELD(provider_slug, ${PRIORITY_PROVIDERS.map(() => "?").join(",")}) = 0, FIELD(provider_slug, ${PRIORITY_PROVIDERS.map(() => "?").join(",")}), id ASC LIMIT ?`,
    [...PRIORITY_PROVIDERS, ...PRIORITY_PROVIDERS, limit]
  );
  return verifyIds(rows.map((x) => ({ id: String(x.id), slug: String(x.slug) })), budgetMs);
}

export interface CatalogStats {
  total: number;
  real: number;
  missing: number;
  unknown: number;
  ambiguous: number;
  pool: number;
  onStake: number;
  stakeOnly: number;
  syncedAt: string | null;
}

export async function getCatalogStats(): Promise<CatalogStats> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) total, SUM(image_status='real') real_n, SUM(image_status='missing') missing_n,
            SUM(image_status='unknown') unknown_n, SUM(ambiguous) amb,
            SUM(on_stake) stake_n, SUM(source='manual') manual_n,
            SUM(on_stake = 1 AND image_status = 'real') stake_pool,
            SUM(image_status='real' AND ambiguous=0) pool, MAX(CASE WHEN source='slotreport' THEN synced_at END) synced
     FROM slot_catalog WHERE active = 1`
  );
  const r = rows[0];
  return {
    total: Number(r.total), real: Number(r.real_n ?? 0), missing: Number(r.missing_n ?? 0), unknown: Number(r.unknown_n ?? 0),
    ambiguous: Number(r.amb ?? 0),
    // once Stake slots are marked, the tournament draws only from them
    pool: Number(r.stake_n ?? 0) > 0 ? Number(r.stake_pool ?? 0) : Number(r.pool ?? 0),
    onStake: Number(r.stake_n ?? 0), stakeOnly: Number(r.manual_n ?? 0),
    syncedAt: r.synced ? String(r.synced) : null,
  };
}

// ── search ──

/** Lower = more likely to be the right provider when the catalogue lists a slug twice. */
function providerRank(slug: string): number {
  const i = PRIORITY_PROVIDERS.indexOf(slug);
  return i < 0 ? PRIORITY_PROVIDERS.length : i;
}

interface CacheRow { id: string; slug: string; name: string; norm: string; provider: string; provider_slug: string; status: CatalogSlot["imageStatus"]; image: string | null; ambiguous: boolean; onStake: boolean }
let cache: { rows: CacheRow[]; at: number } | null = null;

async function loadCache(): Promise<CacheRow[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.rows;
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, slug, name, name_norm, provider, provider_slug, image_status, image_url, ambiguous, on_stake FROM slot_catalog WHERE active = 1"
  );
  const list = rows.map((r) => ({
    id: String(r.id), slug: String(r.slug), name: String(r.name), norm: String(r.name_norm), provider: String(r.provider), provider_slug: String(r.provider_slug),
    status: r.image_status as CacheRow["status"], image: (r.image_url as string) ?? null, ambiguous: Boolean(r.ambiguous), onStake: Boolean(r.on_stake),
  }));
  cache = { rows: list, at: Date.now() };
  return list;
}

function toSlot(r: CacheRow): CatalogSlot {
  return { id: r.id, name: r.name, provider: r.provider, imageUrl: r.status === "real" ? r.image : null, imageStatus: r.status, ambiguous: r.ambiguous, onStake: r.onStake };
}

/** Fuzzy search; thumbnails of the returned slots are verified on demand. */
export async function searchCatalog(query: string, limit = 10): Promise<CatalogSlot[]> {
  const q = normalizeName(query).slice(0, 80);
  if (q.length < 2) return [];
  const rows = await loadCache();
  const scored = rows
    .map((r) => ({ r, s: scoreName(q, r.norm) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(b.r.onStake) - Number(a.r.onStake) || (a.r.ambiguous === b.r.ambiguous ? 0 : a.r.ambiguous ? 1 : -1) || providerRank(a.r.provider_slug) - providerRank(b.r.provider_slug) || a.r.name.localeCompare(b.r.name))
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
    "SELECT id, name, provider, image_status, image_url, ambiguous, on_stake FROM slot_catalog WHERE id IN (?)",
    [ids]
  );
  return new Map(rows.map((r) => [String(r.id), {
    id: String(r.id), name: String(r.name), provider: String(r.provider),
    imageUrl: r.image_status === "real" ? (r.image_url as string) : null,
    imageStatus: r.image_status as CatalogSlot["imageStatus"], ambiguous: Boolean(r.ambiguous), onStake: Boolean(r.on_stake),
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
 * Uniformly random slot from the verified pool, avoiding `exclude` when
 * possible (crypto.randomInt, not Math.random). As soon as the admin has
 * marked Stake slots, only those are drawn (the admin chose them, so a
 * disputed catalogue provider no longer excludes them); before that, any slot
 * with verified art and an undisputed provider.
 */
export async function randomPoolSlot(conn: PoolConnection, exclude: string[] = []): Promise<AssignedSlot> {
  const [stake] = await conn.query<RowDataPacket[]>("SELECT EXISTS(SELECT 1 FROM slot_catalog WHERE on_stake = 1) AS s");
  const base = Number(stake[0].s)
    ? "FROM slot_catalog WHERE active = 1 AND on_stake = 1 AND image_status = 'real' AND image_url IS NOT NULL"
    : "FROM slot_catalog WHERE active = 1 AND image_status = 'real' AND ambiguous = 0 AND image_url IS NOT NULL";
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

// ── Stake availability (admin-curated) ──

export interface StakeMatch {
  line: string;
  slot: { id: string; name: string; provider: string; hasArt: boolean } | null;
}

/** Best catalogue match for a pasted name: exact > prefix/word match; disputed providers resolved by priority. */
export async function matchStakeNames(text: string): Promise<StakeMatch[]> {
  const lines = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))].slice(0, 1000);
  const rows = await loadCache();
  return lines.map((line) => {
    const q = normalizeName(line);
    let best: { r: CacheRow; s: number } | null = null;
    for (const r of rows) {
      const sc = scoreName(q, r.norm);
      if (sc < 600) continue; // exact, prefix or every word — no loose fuzzy guesses
      if (!best || sc > best.s || (sc === best.s && providerRank(r.provider_slug) < providerRank(best.r.provider_slug))) best = { r, s: sc };
    }
    return { line, slot: best ? { id: best.r.id, name: best.r.name, provider: best.r.provider, hasArt: best.r.status !== "missing" } : null };
  });
}

export async function markOnStake(ids: string[], on = true): Promise<number> {
  if (!ids.length) return 0;
  const [res] = await getPool().query<import("mysql2").ResultSetHeader>("UPDATE slot_catalog SET on_stake = ? WHERE id IN (?)", [on ? 1 : 0, ids]);
  cache = null;
  return res.affectedRows;
}

/** Hosts allowed for Stake-only slot art (also allowed by the CSP img-src). */
export const STAKE_IMAGE_HOSTS = ["mediumrare.imgix.net", "slot.report"];

/** Adds a Stake-only slot slot.report doesn't list. The image is downloaded and must be a real image. */
export async function addStakeOnlySlot(input: { name: string; provider: string; imageUrl: string }): Promise<string> {
  let url: URL;
  try { url = new URL(input.imageUrl); } catch { throw new EventError("invalid_input", "image URL is not a valid URL"); }
  if (url.protocol !== "https:" || !STAKE_IMAGE_HOSTS.includes(url.hostname)) {
    throw new EventError("invalid_input", `image must be an https link from ${STAKE_IMAGE_HOSTS.join(" or ")}`);
  }
  const r = await fetchHash(url.toString());
  if (!r || r.status !== 200 || !r.type.startsWith("image/")) throw new EventError("invalid_input", "that link did not return an image");
  if (url.hostname === "slot.report" && r.hash === (await getPlaceholderHash())) throw new EventError("invalid_input", "that is slot.report's placeholder, not the slot's art");
  const slug = normalizeName(input.name).replace(/ /g, "-").slice(0, 150);
  const provSlug = normalizeName(input.provider).replace(/ /g, "-").slice(0, 100) || "stake";
  const id = `manual/${provSlug}/${slug}`.slice(0, 191);
  await getPool().query(
    `INSERT INTO slot_catalog (id, slug, name, name_norm, provider, provider_slug, image_status, image_url, image_checked_at, on_stake, source, active)
     VALUES (?, ?, ?, ?, ?, ?, 'real', ?, UTC_TIMESTAMP(), 1, 'manual', 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), provider = VALUES(provider), image_url = VALUES(image_url), image_status = 'real', on_stake = 1, active = 1`,
    [id, slug, input.name, normalizeName(input.name), input.provider, provSlug, url.toString()]
  );
  cache = null;
  await backfillSlotArt(input.name, input.provider, url.toString());
  return id;
}

/**
 * After art is added for a slot, fill it in wherever that slot (same name,
 * normalised) is already used without an image: tournament players, hunt
 * bonuses, challenges. Returns how many rows got the image.
 */
export async function backfillSlotArt(name: string, provider: string, imageUrl: string): Promise<number> {
  const target = normalizeName(name);
  const pool = getPool();
  let updated = 0;
  const tables: [string, string, string, string][] = [
    ["ko_participants", "slot_name", "slot_image", "(slot_image = '' OR slot_image IS NULL)"],
    ["bonus_hunt_entries", "slot_name", "image_url", "(image_url IS NULL OR image_url = '')"],
    ["challenges", "slot_name", "image_url", "(image_url IS NULL OR image_url = '')"],
  ];
  for (const [table, nameCol, imgCol, missing] of tables) {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT id, ${nameCol} AS n FROM ${table} WHERE ${missing}`);
    const ids = rows.filter((r) => normalizeName(String(r.n)) === target).map((r) => r.id);
    if (!ids.length) continue;
    const provCol = table === "ko_participants" ? "slot_provider" : "provider";
    const [res] = await pool.query<import("mysql2").ResultSetHeader>(
      `UPDATE ${table} SET ${imgCol} = ?, ${provCol} = IF(${provCol} = '' OR ${provCol} IS NULL, ?, ${provCol}) WHERE id IN (?)`,
      [imageUrl, provider, ids]
    );
    updated += res.affectedRows;
  }
  return updated;
}

export async function getStakeSlots(limit = 500): Promise<{ id: string; name: string; provider: string; imageUrl: string | null; source: string }[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, name, provider, image_status, image_url, source FROM slot_catalog WHERE on_stake = 1 ORDER BY source DESC, name ASC LIMIT ?",
    [limit]
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), provider: String(r.provider), imageUrl: r.image_status === "real" ? String(r.image_url) : null, source: String(r.source) }));
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
 * The slot a viewer asked for. Catalogue match (exact, prefix, every word, or
 * a close typo) → its real name, provider and verified art; Stake-marked and
 * verified-art entries win ties. No match → the name as typed, without art or
 * provider (never a guessed game). Runs outside any transaction (may verify art).
 */
export async function findSlotByName(raw: string): Promise<ChosenSlot | null> {
  const typed = cleanSlotRequest(raw);
  if (!typed) return null;
  const q = normalizeName(typed);
  const rows = await loadCache();
  // Strict on purpose: below ~0.7 trigram similarity a "typo" can't be told
  // apart from a different game ("fist of demolition" ≈ "Fist of Destruction"),
  // so the name is kept as typed rather than swapped for another slot.
  const scored = rows.map((r) => ({ r, s: scoreName(q, r.norm) })).filter((x) => x.s >= 280);
  const top = scored.reduce((m, x) => Math.max(m, x.s), 0);
  // Near-equal strong matches ("wanted" → several "Wanted …" games): prefer
  // Stake-marked, then verified art, then the big streamer providers.
  const near = scored.filter((x) => x.s >= top - (top >= 500 ? 30 : 0));
  near.sort((a, b) =>
    Number(b.r.onStake) - Number(a.r.onStake) ||
    Number(b.r.status === "real") - Number(a.r.status === "real") ||
    providerRank(a.r.provider_slug) - providerRank(b.r.provider_slug) ||
    b.s - a.s);
  const best = near[0] ?? null;
  if (!best) return { id: `typed/${q.replace(/ /g, "-")}`.slice(0, 191), name: typed, provider: "", imageUrl: "", matched: false };
  let { r } = best;
  if (r.status === "unknown") {
    try {
      await verifyIds([{ id: r.id, slug: r.slug }], 3000);
      r = (await loadCache()).find((x) => x.id === r.id) ?? r;
    } catch { /* art host unreachable: no image this time */ }
  }
  return { id: r.id, name: r.name, provider: r.provider, imageUrl: r.status === "real" && r.image ? r.image : "", matched: true };
}
