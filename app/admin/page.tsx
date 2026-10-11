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
import { getJobRuns, type JobRun } from "@/lib/events/common";

export const dynamic = "force-dynamic";

interface Stats {
  periods: number;
  closed: number;
  liveEntries: number;
  openGiveaways: number;
  liveRaces: number;
  finalizingRaces: number;
  liveTournament: { id: number; title: string } | null;
  activeHunt: { id: number; title: string; opened: number; total: number } | null;
  openRound: { id: number; title: string; status: string; guesses: number } | null;
  openChallenges: number;
  pendingClaims: number;
  jobs: JobRun[];
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
  const [[raceRows], [tRows], [huntRows], [gbRows], [chRows], jobs] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT SUM(status='live') AS live, SUM(status='finalizing') AS fin FROM races"),
    pool.query<RowDataPacket[]>("SELECT id, title FROM tournament WHERE status='live' LIMIT 1"),
    pool.query<RowDataPacket[]>("SELECT h.id, h.title, COUNT(e.id) AS total, SUM(e.payout IS NOT NULL) AS opened FROM bonus_hunt h LEFT JOIN bonus_hunt_entries e ON e.hunt_id=h.id WHERE h.status='active' GROUP BY h.id LIMIT 1"),
    pool.query<RowDataPacket[]>("SELECT r.id, r.title, r.status, (SELECT COUNT(*) FROM gb_guesses g WHERE g.round_id=r.id) AS guesses FROM gb_rounds r WHERE r.status IN ('open','closed') ORDER BY FIELD(r.status,'open','closed') LIMIT 1"),
    pool.query<RowDataPacket[]>("SELECT (SELECT COUNT(*) FROM challenges WHERE status='open' AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())) AS open_c, (SELECT COUNT(*) FROM challenge_claims WHERE status='pending') AS pending"),
    getJobRuns(),
  ]);
  return {
    periods,
    closed,
    liveEntries,
    openGiveaways,
    liveRaces: Number(raceRows[0]?.live ?? 0),
    finalizingRaces: Number(raceRows[0]?.fin ?? 0),
    liveTournament: tRows[0] ? { id: Number(tRows[0].id), title: String(tRows[0].title) } : null,
    activeHunt: huntRows[0] ? { id: Number(huntRows[0].id), title: String(huntRows[0].title), opened: Number(huntRows[0].opened ?? 0), total: Number(huntRows[0].total) } : null,
    openRound: gbRows[0] ? { id: Number(gbRows[0].id), title: String(gbRows[0].title), status: String(gbRows[0].status), guesses: Number(gbRows[0].guesses) } : null,
    openChallenges: Number(chRows[0]?.open_c ?? 0),
    pendingClaims: Number(chRows[0]?.pending ?? 0),
    jobs,
    lastSync: (syncRows[0] as Stats["lastSync"]) ?? null,
  };
}

export default async function AdminDashboard() {
  const active = await getActivePeriod();
  let stats: Stats;
  try {
    stats = await getStats(active?.id ?? null);
  } catch (err) {
    console.error("admin dashboard stats failed", err instanceof Error ? err.message : "unknown");
    return (
      <div className="space-y-6">
        <div><p className="label">Overview</p><h1 className="mt-1 text-2xl">Dashboard</h1></div>
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-5 text-sm text-text-0">
          The database could not be reached or is not fully migrated (run <code>npm run migrate</code>). Event pages will show “temporarily unavailable” rather than empty states until this is fixed.
        </div>
      </div>
    );
  }
  const lbEnabled = await isLeaderboardEnabled();

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
            <p className="mt-2 break-all font-mono text-xl font-bold tabular-nums xl:text-2xl">{t.value}</p>
            {t.sub && <p className="mt-1 text-xs text-text-2">{t.sub}</p>}
          </div>
        ))}
      </div>

      {/* events */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { href: "/admin/races", icon: "Flag", title: "Races", line: `${stats.liveRaces} live${stats.finalizingRaces ? ` · ${stats.finalizingRaces} awaiting final data` : ""}`, alert: stats.finalizingRaces > 0 },
          { href: "/admin/tournaments", icon: "Swords", title: "Tournaments", line: stats.liveTournament ? `Live: ${stats.liveTournament.title}` : "None live" },
          { href: "/admin/bonus-hunt", icon: "Dices", title: "Bonus Hunt", line: stats.activeHunt ? `${stats.activeHunt.title} · ${stats.activeHunt.opened}/${stats.activeHunt.total} opened` : "No active hunt" },
          { href: "/admin/guess-the-balance", icon: "Gauge", title: "Guess the Balance", line: stats.openRound ? `${stats.openRound.title} · ${stats.openRound.status} · ${stats.openRound.guesses} guesses` : "No open round", alert: stats.openRound?.status === "closed" },
          { href: "/admin/challenges", icon: "Target", title: "Challenges", line: `${stats.openChallenges} open${stats.pendingClaims ? ` · ${stats.pendingClaims} claim(s) to review` : ""}`, alert: stats.pendingClaims > 0 },
          { href: "/admin/giveaways", icon: "Gift", title: "Giveaways", line: `${stats.openGiveaways} open` },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="surface flex items-start gap-3 p-4 hover:border-gold/40">
            <Icon name={c.icon} className={`mt-0.5 h-5 w-5 ${c.alert ? "text-gold" : "text-text-2"}`} />
            <div className="min-w-0">
              <p className="text-sm text-text-0">{c.title}</p>
              <p className={`truncate text-xs ${c.alert ? "text-gold" : "text-text-2"}`}>{c.line}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* scheduler */}
      <div className="surface p-5">
        <p className="label mb-2">Scheduled jobs (GitHub Actions, every ~10 min: sync → races → kick-live)</p>
        {stats.jobs.length === 0 ? (
          <p className="text-sm text-text-2">No cron run recorded yet. Check the workflow secrets SITE_URL and CRON_SECRET.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {stats.jobs.map((j) => {
              const failing = j.last_error_at && (!j.last_success_at || j.last_error_at > j.last_success_at);
              return (
                <li key={j.name} className="flex flex-wrap items-center gap-2">
                  <Icon name={failing ? "AlertTriangle" : "CircleCheck"} className={`h-4 w-4 ${failing ? "text-danger" : "text-volt"}`} />
                  <span className="font-mono">{j.name}</span>
                  <span className="text-text-2">last success {j.last_success_at ? <RelativeTime iso={j.last_success_at} /> : "never"}</span>
                  {failing && <span className="text-danger">· failing: {j.last_error}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
