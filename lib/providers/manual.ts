import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import type { WagerProvider, WagerFetchResult } from "./types";

// Manual provider: the admin imports a validated CSV for one specific period
// (Admin → Periods → Manual import), stored in `manual_period_wagers`. Rows of
// other periods are never mixed in. An import is the admin's file, not a
// provider guarantee, so absent players are not assumed to be at zero.
export const manualProvider: WagerProvider = {
  name: "manual",
  listsAllWagerers: false,

  async fetchWagers(_startAt, _endAt, periodId): Promise<WagerFetchResult> {
    try {
      const [rows] = await getPool().query<RowDataPacket[]>(
        "SELECT casino_id AS id, username, wagered, updated_at FROM manual_period_wagers WHERE period_id = ? ORDER BY wagered DESC",
        [periodId]
      );
      const latest = rows.reduce<string | null>(
        (max, r) => (!max || String(r.updated_at) > max ? String(r.updated_at) : max),
        null
      );
      return {
        ok: true,
        rows: rows.map((r) => ({
          id: String(r.id),
          username: String(r.username),
          wagered: String(r.wagered),
        })),
        cacheUpdatedAt: latest,
      };
    } catch {
      return { ok: false, errorCode: "er_manual_read_failed", status: 500 };
    }
  },
};
