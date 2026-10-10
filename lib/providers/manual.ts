import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import type { WagerProvider, WagerFetchResult } from "./types";

// Manual provider: the admin uploads a CSV (username,id,wagered) which is
// validated and upserted into `manual_wagers` (see admin §5.15 / §6). This
// just returns the current contents — dates are ignored because a manual
// upload is already scoped to whatever window the admin pulled it for.
export const manualProvider: WagerProvider = {
  name: "manual",

  async fetchWagers(): Promise<WagerFetchResult> {
    try {
      const [rows] = await getPool().query<RowDataPacket[]>(
        "SELECT casino_id AS id, username, wagered, updated_at FROM manual_wagers ORDER BY wagered DESC"
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
