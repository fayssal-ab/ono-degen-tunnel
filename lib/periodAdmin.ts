import "server-only";
import { deleteTicketChannel } from "./discordTickets";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import Decimal from "decimal.js";
import { EventError, withTx, lockApp, DECIMAL_20_8, type DistEntry } from "./events/common";
import { closePeriod, getPeriodById } from "./periods";

// Admin period lifecycle. MVP rule: at most one live period (runSync handles
// one active period). upcoming → live → closed only; a closed period's
// final_results are immutable and it is never reopened. Weekly + monthly
// boards running side by side would need per-period sync and is out of scope.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
}

export interface PeriodInput {
  title: string;
  kind: "monthly" | "weekly" | "custom";
  start_at: string;
  end_at: string;
  prize_pool: string;
  distribution: DistEntry[];
}

export function checkPeriodInput(input: PeriodInput): void {
  if (!validDate(input.start_at) || !validDate(input.end_at)) throw new EventError("invalid_input", "dates must be valid YYYY-MM-DD");
  if (input.end_at < input.start_at) throw new EventError("invalid_input", "end date is before start date");
  const days = (Date.parse(`${input.end_at}T00:00:00Z`) - Date.parse(`${input.start_at}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > 123) throw new EventError("invalid_input", "a period can span at most 123 days (provider limit)");
  if (!DECIMAL_20_8.test(input.prize_pool)) throw new EventError("invalid_input", "prize pool must be a plain non-negative amount");
}

export async function createPeriod(input: PeriodInput): Promise<number> {
  checkPeriodInput(input);
  return withTx(async (conn) => {
    const [overlap] = await conn.query<RowDataPacket[]>(
      "SELECT id, title FROM periods WHERE status <> 'closed' AND start_at <= ? AND end_at >= ? LIMIT 1",
      [input.end_at, input.start_at]
    );
    if (overlap.length) throw new EventError("period_overlap", `overlaps #${overlap[0].id} ${overlap[0].title}`);
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO periods (title, kind, start_at, end_at, timezone, prize_pool, prize_distribution, status)
       VALUES (?, ?, ?, ?, 'UTC', ?, CAST(? AS JSON), 'upcoming')`,
      [input.title, input.kind, input.start_at, input.end_at, input.prize_pool, JSON.stringify(input.distribution)]
    );
    return res.insertId;
  });
}

/** Atomic: refuses while another period is live (close it first). */
export async function activatePeriod(id: number): Promise<void> {
  await withTx(async (conn) => {
    await lockApp(conn, "period");
    const [rows] = await conn.query<RowDataPacket[]>("SELECT status FROM periods WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) throw new EventError("period_not_found");
    if (rows[0].status !== "upcoming") throw new EventError("period_not_upcoming");
    const [live] = await conn.query<RowDataPacket[]>("SELECT id FROM periods WHERE status = 'live' LIMIT 1");
    if (live.length) throw new EventError("period_already_live", `close #${live[0].id} first`);
    await conn.query("UPDATE periods SET status = 'live' WHERE id = ?", [id]);
  });
}

export async function closePeriodAdmin(id: number): Promise<void> {
  const p = await getPeriodById(id);
  if (!p) throw new EventError("period_not_found");
  if (p.status !== "live") throw new EventError("period_not_live");
  await closePeriod(p);
}

/**
 * Delete an upcoming or live period: its board, snapshots and imports go with
 * it; races are detached (their history stays); unpaid leaderboard prizes go
 * (with their Discord ticket), paid ones stay in Admin → Prizes. Closed
 * periods are kept: their final results are immutable (golden rule 5, DB
 * trigger). Refused while an unfinished race reads this period.
 */
export async function deletePeriod(id: number): Promise<void> {
  const channels = await withTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT status FROM periods WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) throw new EventError("period_not_found");
    if (rows[0].status === "closed") throw new EventError("period_locked", "closed periods keep their final results for good");
    const [races] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM races WHERE period_id = ? AND status IN ('upcoming','live','finalizing')", [id]);
    if (Number(races[0].n) > 0) throw new EventError("period_has_races", "a race that hasn't finished uses this period — finish or delete it first");
    const [awards] = await conn.query<RowDataPacket[]>(
      "SELECT discord_channel_id FROM prize_awards WHERE source = 'leaderboard' AND source_ref LIKE ? AND status <> 'paid' FOR UPDATE", [`period:${id}:%`]);
    await conn.query("DELETE FROM prize_awards WHERE source = 'leaderboard' AND source_ref LIKE ? AND status <> 'paid'", [`period:${id}:%`]);
    await conn.query("DELETE FROM periods WHERE id = ?", [id]);
    return awards.map((a) => String(a.discord_channel_id ?? "")).filter(Boolean);
  });
  for (const c of channels) deleteTicketChannel(c);
}

// ── manual CSV import ──

export interface CsvRow {
  line: number;
  casino_id: string;
  username: string;
  wagered: string;
}

export interface CsvParse {
  rows: CsvRow[];
  errors: { line: number; message: string }[];
  total: string;
}

export const MAX_IMPORT_ROWS = 20_000;

function splitCsvLine(line: string): string[] | null {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur === "") quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (quoted) return null;
  out.push(cur);
  return out.map((v) => v.trim());
}

/**
 * Header `casino_id,username,wagered` (any column order). Each row is a
 * player's cumulative wager for the chosen period. Invalid rows are reported
 * by line and the whole import is refused until the file is clean.
 */
export function parseWagerCsv(text: string): CsvParse {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const errors: CsvParse["errors"] = [];
  const rows: CsvRow[] = [];
  const header = splitCsvLine(lines[0] ?? "")?.map((h) => h.toLowerCase());
  const idx = { casino_id: header?.indexOf("casino_id") ?? -1, username: header?.indexOf("username") ?? -1, wagered: header?.indexOf("wagered") ?? -1 };
  if (!header || idx.casino_id < 0 || idx.username < 0 || idx.wagered < 0) {
    return { rows, errors: [{ line: 1, message: "header must contain casino_id, username, wagered" }], total: "0" };
  }
  const seen = new Map<string, number>();
  let total = new Decimal(0);
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    if (!lines[i].trim()) continue;
    if (rows.length + errors.length >= MAX_IMPORT_ROWS) {
      errors.push({ line: lineNo, message: `more than ${MAX_IMPORT_ROWS} rows` });
      break;
    }
    const cells = splitCsvLine(lines[i]);
    if (!cells || cells.length !== header.length) { errors.push({ line: lineNo, message: `expected ${header.length} columns` }); continue; }
    const casino_id = cells[idx.casino_id];
    const username = cells[idx.username];
    const wagered = cells[idx.wagered];
    if (!casino_id || casino_id.length > 191) { errors.push({ line: lineNo, message: "casino_id is empty or longer than 191" }); continue; }
    if (!username || username.length > 191) { errors.push({ line: lineNo, message: "username is empty or longer than 191" }); continue; }
    if (!DECIMAL_20_8.test(wagered)) { errors.push({ line: lineNo, message: `wagered "${wagered.slice(0, 30)}" is not a plain amount (≤12 digits, ≤8 decimals)` }); continue; }
    const dup = seen.get(casino_id);
    if (dup) { errors.push({ line: lineNo, message: `duplicate casino_id (first on line ${dup})` }); continue; }
    seen.set(casino_id, lineNo);
    total = total.plus(wagered);
    rows.push({ line: lineNo, casino_id, username, wagered });
  }
  return { rows, errors, total: total.toFixed(2) };
}

/** Replaces the period's manual rows with a clean file, atomically. */
export async function importManualWagers(periodId: number, text: string): Promise<{ rows: number }> {
  const parsed = parseWagerCsv(text);
  if (parsed.errors.length) throw new EventError("csv_invalid", `${parsed.errors.length} invalid line(s)`);
  if (!parsed.rows.length) throw new EventError("csv_invalid", "no rows");
  return withTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT status FROM periods WHERE id = ? FOR UPDATE", [periodId]);
    if (!rows[0]) throw new EventError("period_not_found");
    if (rows[0].status === "closed") throw new EventError("period_closed");
    const [res] = await conn.query<ResultSetHeader>("INSERT INTO manual_imports (period_id, row_count, total) VALUES (?, ?, ?)", [periodId, parsed.rows.length, parsed.total]);
    await conn.query("DELETE FROM manual_period_wagers WHERE period_id = ?", [periodId]);
    for (let i = 0; i < parsed.rows.length; i += 1000) {
      await conn.query(
        "INSERT INTO manual_period_wagers (period_id, casino_id, username, wagered, import_id) VALUES ?",
        [parsed.rows.slice(i, i + 1000).map((r) => [periodId, r.casino_id, r.username, r.wagered, res.insertId])]
      );
    }
    return { rows: parsed.rows.length };
  });
}
