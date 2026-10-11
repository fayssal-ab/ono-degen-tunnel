import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import Decimal from "decimal.js";
import { getPool } from "../db";

// Shared plumbing for the event lifecycles (races, tournaments, hunts, GB,
// challenges): a typed business error the admin UI can explain, a transaction
// helper, app-level mutexes, and input schemas bounded to the DB column types.

export class EventError extends Error {
  constructor(public code: string, public detail?: string) {
    super(code);
  }
}

export async function withTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Serialises "only one active X" checks (rows seeded by migration 0007). */
export async function lockApp(conn: PoolConnection, name: "period" | "hunt" | "gb" | "tournament" | "race"): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT name FROM app_locks WHERE name = ? FOR UPDATE", [name]);
  if (!rows[0]) throw new EventError("migration_missing");
}

// DECIMAL(20,8): at most 12 integer digits and 8 decimals. Plain notation only
// — no exponent, sign, Infinity or suffix.
export const DECIMAL_20_8 = /^\d{1,12}(\.\d{1,8})?$/;
export const DECIMAL_20_2 = /^\d{1,18}(\.\d{1,2})?$/;

const trimmed = (max: number) => z.string().trim().max(max);
export const zText = (max: number) => trimmed(max);
export const zRequiredText = (max: number) => trimmed(max).min(1);
export const zId = z.coerce.number().int().positive().max(2_147_483_647);
export const zMoney = z.string().trim().regex(DECIMAL_20_8, "invalid_amount");
export const zPositiveMoney = zMoney.refine((v) => new Decimal(v).gt(0), "must_be_positive");
export const zMultiplier = z.string().trim().regex(DECIMAL_20_2, "invalid_multiplier").refine((v) => new Decimal(v).gt(0), "must_be_positive");
export const zUrl = z.union([z.literal(""), z.string().trim().max(512).url().refine((u) => /^https?:\/\//i.test(u), "invalid_url")]);

/** `<input type="datetime-local">` value interpreted as UTC → "YYYY-MM-DD HH:MM:SS". */
export const zUtcDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "invalid_datetime")
  .transform((v, ctx) => {
    const iso = v.length === 16 ? `${v}:00` : v;
    const date = new Date(`${iso}Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 19) !== iso) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_datetime" });
      return z.NEVER;
    }
    return iso.replace("T", " ");
  });

export const zOptionalUtcDateTime = z.union([z.literal("").transform(() => null), zUtcDateTime]);

/** Parse FormData against a schema; any failure becomes an EventError. */
export function parseForm<S extends z.ZodTypeAny>(schema: S, formData: FormData | Record<string, unknown>): z.infer<S> {
  const raw = formData instanceof FormData ? Object.fromEntries(formData.entries()) : formData;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new EventError("invalid_input", `${issue.path.join(".") || "form"}: ${issue.message}`);
  }
  return parsed.data;
}

/** DB "YYYY-MM-DD HH:MM:SS" (UTC) → ISO string for the client. */
export function utcIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value);
  return new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`).toISOString();
}

/** DB timestamp → value for a datetime-local input (UTC). */
export function toInputValue(value: string | null | undefined): string {
  return value ? String(value).replace(" ", "T").slice(0, 16) : "";
}

// ── prize distributions ──

export interface DistEntry {
  rank: number;
  percentage: number;
}

/** "50,30,20" → ranks 1..n. Each share > 0, at most 2 decimals, total ≤ 100. */
export function parseDistribution(csv: string): DistEntry[] {
  const parts = csv.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new EventError("invalid_distribution", "at least one paid rank is required");
  if (parts.length > 100) throw new EventError("invalid_distribution", "at most 100 paid ranks");
  let total = new Decimal(0);
  const dist = parts.map((p, i) => {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(p) || new Decimal(p).lte(0)) throw new EventError("invalid_distribution", `rank ${i + 1}: "${p}"`);
    total = total.plus(p);
    return { rank: i + 1, percentage: Number(p) };
  });
  if (total.gt(100)) throw new EventError("invalid_distribution", `shares total ${total.toString()}% (max 100%)`);
  return dist;
}

export function distributionTotal(dist: DistEntry[]): string {
  return dist.reduce((s, e) => s.plus(e.percentage), new Decimal(0)).toString();
}

// ── cron job bookkeeping ──

export async function recordJob(name: string, outcome: { ok: true; detail?: unknown } | { ok: false; error: string }): Promise<void> {
  try {
    if (outcome.ok) {
      await getPool().query(
        `INSERT INTO job_runs (name, last_started_at, last_success_at, detail) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?)
         ON DUPLICATE KEY UPDATE last_success_at = UTC_TIMESTAMP(), detail = VALUES(detail)`,
        [name, JSON.stringify(outcome.detail ?? null)]
      );
    } else {
      await getPool().query(
        `INSERT INTO job_runs (name, last_error_at, last_error) VALUES (?, UTC_TIMESTAMP(), ?)
         ON DUPLICATE KEY UPDATE last_error_at = UTC_TIMESTAMP(), last_error = VALUES(last_error)`,
        [name, outcome.error.slice(0, 191)]
      );
    }
  } catch {
    /* bookkeeping must not fail the job */
  }
}

export interface JobRun {
  name: string;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
}

export async function getJobRuns(): Promise<JobRun[]> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT name, last_success_at, last_error_at, last_error FROM job_runs ORDER BY name");
  return rows as JobRun[];
}
