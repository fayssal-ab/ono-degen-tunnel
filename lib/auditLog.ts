import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  target: string;
  detail: unknown;
  created_at: string;
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT id, actor, action, target, detail, created_at FROM audit_log ORDER BY created_at DESC LIMIT ?",
      [limit]
    );
    return rows.map((r) => ({
      id: r.id as number,
      actor: String(r.actor),
      action: String(r.action),
      target: String(r.target),
      detail: typeof r.detail === "string" ? safeParse(r.detail) : r.detail,
      created_at: String(r.created_at),
    }));
  } catch {
    return [];
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
