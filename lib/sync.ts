import "server-only";
import { getWagerProvider } from "./providers";
import {
  getActivePeriod,
  activateNextPeriod,
  getBlacklistedIds,
  upsertLiveEntries,
  removeBlacklistedFromPeriod,
  recomputeLiveRanks,
  writeRankSnapshot,
  writeSyncLog,
  hasPeriodEnded,
  closePeriod,
} from "./periods";

export interface SyncSummary {
  ok: boolean;
  periodId: number | null;
  provider: string;
  rows?: number;
  errorCode?: string;
  closed?: boolean;
  activated?: boolean;
}

// The cron pipeline (prompt §7, JBALLIN cron logic). On a failed fetch we LOG
// and KEEP the last good data — never wipe the board (golden rule 4).
export async function runSync(): Promise<SyncSummary> {
  const provider = getWagerProvider();

  // make sure something is live before we try to sync
  await activateNextPeriod();
  const period = await getActivePeriod();
  if (!period) {
    await writeSyncLog({
      period_id: null,
      provider: provider.name,
      cache_updated_at: null,
      status: "failure",
      error_code: "er_no_active_period",
    });
    return { ok: false, periodId: null, provider: provider.name, errorCode: "er_no_active_period" };
  }

  const result = await provider.fetchWagers(period.start_at, period.end_at, period.id);

  if (!result.ok) {
    // keep last good data; just record the failure
    await writeSyncLog({
      period_id: period.id,
      provider: provider.name,
      cache_updated_at: null,
      status: "failure",
      error_code: result.errorCode,
    });
    return { ok: false, periodId: period.id, provider: provider.name, errorCode: result.errorCode };
  }

  const blacklist = await getBlacklistedIds();
  const rows = result.rows
    .filter((r) => !blacklist.has(r.id))
    .map((r) => ({ period_id: period!.id, casino_id: r.id, username: r.username, wagered: r.wagered }));

  await upsertLiveEntries(rows);
  await removeBlacklistedFromPeriod(period.id);
  await recomputeLiveRanks(period.id);
  await writeRankSnapshot(period.id);
  await writeSyncLog({
    period_id: period.id,
    provider: provider.name,
    cache_updated_at: result.cacheUpdatedAt,
    status: "success",
    error_code: null,
    row_count: rows.length,
  });

  // rollover if the period has ended
  let closed = false;
  let activated = false;
  if (hasPeriodEnded(period)) {
    await closePeriod(period);
    closed = true;
    await activateNextPeriod();
    const next = await getActivePeriod();
    activated = Boolean(next && next.id !== period.id);
  }

  return { ok: true, periodId: period.id, provider: provider.name, rows: rows.length, closed, activated };
}
