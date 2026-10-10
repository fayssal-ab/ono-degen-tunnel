import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { getActivePeriod } from "@/lib/periods";
import { isLeaderboardEnabled } from "@/lib/settings";
import { isDemoMode } from "@/lib/providers";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { RelativeTime } from "@/components/ui/RelativeTime";

export const dynamic = "force-dynamic";

interface Stats {
  periods: number;
  closed: number;
  liveEntries: number;
  openGiveaways: number;
  lastSync: { status: string; error_code: string | null; fetched_at: string; provider: string } | null;
}

async function getStats(activePeriodId: number | null): Promise<Stats> {
  const pool = getPool();
  const one = async (sql: string, args: unknown[] = []) => {
    const [rows] = await pool.query<RowDataPacket[]>(sql, args);
    return (rows[0]?.n as number) ?? 0;
  };
  const [periods, closed, liveEntries, openGiveaways] = await Promise.all([
    one("SELECT COUNT(*) n FROM periods"),
    one("SELECT COUNT(*) n FROM periods WHERE status='closed'"),
    activePeriodId ? one("SELECT COUNT(*) n FROM live_entries WHERE period_id=?", [activePeriodId]) : Promise.resolve(0),
    one("SELECT COUNT(*) n FROM giveaways WHERE status='open'"),
  ]);
  const [syncRows] = await pool.query<RowDataPacket[]>(
    "SELECT status, error_code, fetched_at, provider FROM sync_log ORDER BY fetched_at DESC LIMIT 1"
  );
  return {
    periods,
    closed,
    liveEntries,
    openGiveaways,
    lastSync: (syncRows[0] as Stats["lastSync"]) ?? null,
  };
}

export default async function AdminDashboard() {
  const active = await getActivePeriod();
  const [stats, lbEnabled] = await Promise.all([getStats(active?.id ?? null), isLeaderboardEnabled()]);

  const tiles = [
    { label: "Periods", value: String(stats.periods), sub: `${stats.closed} closed` },
    { label: "Players on board", value: stats.liveEntries.toLocaleString(), sub: active ? active.title : "no live period" },
    { label: "Prize pool (live)", value: active ? formatMoney(active.prize_pool) : "—", sub: active ? "current period" : "" },
    { label: "Open giveaways", value: String(stats.openGiveaways), sub: "" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="label">Overview</p>
        <h1 className="mt-1 text-2xl">Dashboard</h1>
      </div>

      {/* health row */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface flex items-center gap-3 p-4">
          <Icon
            name={stats.lastSync?.status === "success" ? "CircleCheck" : stats.lastSync ? "AlertTriangle" : "CircleDashed"}
            className={`h-5 w-5 ${stats.lastSync?.status === "success" ? "text-volt" : stats.lastSync ? "text-danger" : "text-text-2"}`}
          />
          <div className="min-w-0">
            <p className="text-sm text-text-0">
              {stats.lastSync
                ? stats.lastSync.status === "success"
                  ? "Last sync succeeded"
                  : `Last sync failed · ${stats.lastSync.error_code}`
                : "No sync has run yet"}
            </p>
            {stats.lastSync && (
              <p className="text-xs text-text-2">
                {stats.lastSync.provider} ·{" "}
                <RelativeTime iso={stats.lastSync.fetched_at} />
              </p>
            )}
          </div>
          {isDemoMode() && <Badge tone="plasma" className="ml-auto">Demo</Badge>}
        </div>
        <div className="surface flex items-center gap-3 p-4">
          <Icon name={lbEnabled ? "Eye" : "EyeOff"} className={`h-5 w-5 ${lbEnabled ? "text-volt" : "text-text-2"}`} />
          <div>
            <p className="text-sm text-text-0">Leaderboard is {lbEnabled ? "visible" : "hidden (coming-soon state)"}</p>
            <p className="text-xs text-text-2">Toggle it in Settings</p>
          </div>
          <Link href="/admin/settings" className="ml-auto text-sm text-gold hover:underline">
            Settings →
          </Link>
        </div>
      </div>

      {/* stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="surface p-5">
            <p className="label">{t.label}</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{t.value}</p>
            {t.sub && <p className="mt-1 text-xs text-text-2">{t.sub}</p>}
          </div>
        ))}
      </div>

      <div className="surface p-5">
        <p className="text-sm text-text-1">
          More panels (periods, tournaments, guess-the-balance, giveaways, VIP, stream) are being
          built and will appear in the sidebar as each ships. Settings and the leaderboard toggle are
          live now.
        </p>
      </div>
    </div>
  );
}
