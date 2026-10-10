import "server-only";
import { getPool } from "./db";

// Records an admin mutation (prompt §7.8). Never throws — an audit write must
// not fail the action it is logging.
export async function logAudit(
  actor: string,
  action: string,
  target = "",
  detail?: unknown
): Promise<void> {
  try {
    await getPool().query(
      "INSERT INTO audit_log (actor, action, target, detail) VALUES (?, ?, ?, ?)",
      [actor, action, target, detail != null ? JSON.stringify(detail) : null]
    );
  } catch {
    /* best-effort */
  }
}
