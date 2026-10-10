import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { isAdminSession } from "@/lib/admin";
import { getPool } from "@/lib/db";
import { getPeriodById, closePeriod } from "@/lib/periods";
import { isLeaderboardEnabled } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

async function guard() {
  if (!(await isAdminSession())) redirect("/login");
}
function parseDist(csv: string) {
  const nums = csv.split(",").map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n) && n > 0);
  return nums.map((percentage, i) => ({ rank: i + 1, percentage }));
}

async function createPeriod(formData: FormData) {
  "use server";
  await guard();
  const title = String(formData.get("title") ?? "").trim() || "Monthly";
  const kind = ["monthly", "weekly", "custom"].includes(String(formData.get("kind"))) ? String(formData.get("kind")) : "monthly";
  const start = String(formData.get("start_at") ?? "").trim();
  const end = String(formData.get("end_at") ?? "").trim();
  const pool = String(formData.get("prize_pool") ?? "0").replace(/[^0-9.]/g, "") || "0";
  const dist = parseDist(String(formData.get("distribution") ?? "30,20,12,10,8,6,5,4,3,2"));
  if (!start || !end) return;
  await getPool().query(
    `INSERT INTO periods (title, kind, start_at, end_at, timezone, prize_pool, prize_distribution, status)
     VALUES (?, ?, ?, ?, 'UTC', ?, CAST(? AS JSON), 'upcoming')`,
    [title, kind, start, end, pool, JSON.stringify(dist)]
  );
  await logAudit("admin", "period.create", title, { start, end, pool });
  revalidatePath("/admin/periods");
}

async function activatePeriod(formData: FormData) {
  "use server";
  await guard();
  const id = Number(formData.get("id"));
  const pool = getPool();
  await pool.query("UPDATE periods SET status='upcoming' WHERE status='live'");
  await pool.query("UPDATE periods SET status='live' WHERE id=?", [id]);
  await logAudit("admin", "period.activate", String(id));
  revalidatePath("/admin/periods");
  revalidatePath("/leaderboard");
  revalidatePath("/");
}

async function closePeriodAction(formData: FormData) {
  "use server";
  await guard();
  const id = Number(formData.get("id"));
  const p = await getPeriodById(id);
  if (p) await closePeriod(p);
  await logAudit("admin", "period.close", String(id));
  revalidatePath("/admin/periods");
  revalidatePath("/leaderboard");
}

async function deletePeriodAction(formData: FormData) {
  "use server";
  await guard();
  const id = Number(formData.get("id"));
  try {
    await getPool().query("DELETE FROM periods WHERE id=?", [id]);
    await logAudit("admin", "period.delete", String(id));
  } catch {
    /* closed periods with frozen results can't be deleted (immutable) */
  }
  revalidatePath("/admin/periods");
}

interface Row extends RowDataPacket {
  id: number;
  title: string;
  kind: string;
  start_at: string;
  end_at: string;
  prize_pool: string;
  status: string;
  entrants: number;
}

const input = "h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none";

export default async function AdminPeriods() {
  await guard();
  const [[rows], lbEnabled] = await Promise.all([
    getPool().query<Row[]>(
      `SELECT p.id, p.title, p.kind, p.start_at, p.end_at, p.prize_pool, p.status,
              (SELECT COUNT(*) FROM live_entries le WHERE le.period_id=p.id) +
              (SELECT COUNT(*) FROM final_results fr WHERE fr.period_id=p.id) AS entrants
       FROM periods p ORDER BY p.start_at DESC LIMIT 60`
    ),
    isLeaderboardEnabled(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Compete</p>
          <h1 className="mt-1 text-2xl">Periods</h1>
        </div>
        <Link
          href="/admin/settings"
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${lbEnabled ? "border-volt/40 text-volt" : "border-line text-text-2"}`}
        >
          <Icon name={lbEnabled ? "Eye" : "EyeOff"} className="h-4 w-4" />
          Leaderboard {lbEnabled ? "visible" : "hidden"} · edit
        </Link>
      </div>

      {!lbEnabled && (
        <p className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-text-1">
          The leaderboard is hidden. Create + activate a period, then turn it on in Settings.
        </p>
      )}

      <form action={createPeriod} className="surface grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
        <p className="label sm:col-span-2 lg:col-span-3">New period</p>
        <label className="block"><span className="label">Title</span><input name="title" placeholder="October 2026" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">Kind</span>
          <select name="kind" className={`mt-1 ${input}`}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="block"><span className="label">Prize pool ($)</span><input name="prize_pool" placeholder="5000" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">Start date</span><input name="start_at" type="date" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">End date (inclusive)</span><input name="end_at" type="date" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">Split % by rank</span><input name="distribution" defaultValue="30,20,12,10,8,6,5,4,3,2" className={`mt-1 ${input}`} /></label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button type="submit" className="press inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi">
            <Icon name="Plus" className="h-4 w-4" /> Create period
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="surface p-6 text-sm text-text-1">No periods yet. Create one above.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="surface flex flex-wrap items-center gap-4 p-4">
              <span className="font-mono text-xs text-text-2">#{p.id}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-text-0">{p.title}</p>
                  <Badge tone={p.status === "live" ? "volt" : p.status === "closed" ? "neutral" : "gold"}>{p.status}</Badge>
                </div>
                <p className="font-mono text-xs text-text-2">{p.start_at} → {p.end_at} · {p.entrants} entrants</p>
              </div>
              <span className="font-mono text-sm text-gold">{formatMoney(p.prize_pool)}</span>
              <div className="flex items-center gap-2">
                {p.status !== "live" && p.status !== "closed" && (
                  <form action={activatePeriod}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="press inline-flex h-9 items-center gap-1.5 rounded-lg bg-volt px-3 text-sm font-semibold text-bg-0 hover:brightness-110">
                      <Icon name="Play" className="h-4 w-4" /> Activate
                    </button>
                  </form>
                )}
                {p.status === "live" && (
                  <form action={closePeriodAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="press inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm hover:border-gold hover:text-gold" title="Freeze final results">
                      <Icon name="Lock" className="h-4 w-4" /> Close
                    </button>
                  </form>
                )}
                {p.status !== "closed" && (
                  <form action={deletePeriodAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="press grid h-9 w-9 place-items-center rounded-lg border border-line text-text-2 hover:border-danger hover:text-danger" title="Delete">
                      <Icon name="Trash2" className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
