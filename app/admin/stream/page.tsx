import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { getPool } from "@/lib/db";
import { getStreamSchedule, WEEKDAYS } from "@/lib/stream";
import { logAudit } from "@/lib/audit";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

async function guard() {
  if (!(await isAdminSession())) redirect("/login");
}

async function addSlot(formData: FormData) {
  "use server";
  await guard();
  const weekday = Math.max(0, Math.min(6, Number(formData.get("weekday") ?? 0)));
  const start = String(formData.get("start_time") ?? "").trim() || "19:00";
  const tz = String(formData.get("timezone") ?? "UTC").trim() || "UTC";
  const title = String(formData.get("title") ?? "").trim();
  await getPool().query(
    "INSERT INTO stream_schedule (weekday, start_time, timezone, title) VALUES (?, ?, ?, ?)",
    [weekday, start, tz, title]
  );
  await logAudit("admin", "stream.add_slot", "", { weekday, start, tz, title });
  revalidatePath("/admin/stream");
  revalidatePath("/stream");
}

async function deleteSlot(formData: FormData) {
  "use server";
  await guard();
  const id = Number(formData.get("id"));
  await getPool().query("DELETE FROM stream_schedule WHERE id = ?", [id]);
  await logAudit("admin", "stream.delete_slot", String(id));
  revalidatePath("/admin/stream");
  revalidatePath("/stream");
}

const input = "h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none";

export default async function AdminStream() {
  await guard();
  const slots = await getStreamSchedule();

  return (
    <div className="space-y-8">
      <div>
        <p className="label">Community</p>
        <h1 className="mt-1 text-2xl">Stream schedule</h1>
      </div>

      <form action={addSlot} className="surface grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="label">Day</span>
          <select name="weekday" className={`mt-1 ${input}`}>
            {WEEKDAYS.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </label>
        <label className="block"><span className="label">Start (HH:MM)</span><input name="start_time" defaultValue="19:00" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">Timezone</span><input name="timezone" defaultValue="UTC" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">Title</span><input name="title" placeholder="Slots & bonus hunt" className={`mt-1 ${input}`} /></label>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" className="press inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi">
            <Icon name="Plus" className="h-4 w-4" /> Add slot
          </button>
        </div>
      </form>

      {slots.length === 0 ? (
        <p className="surface p-6 text-sm text-text-1">No schedule slots yet.</p>
      ) : (
        <div className="space-y-2">
          {slots.map((s) => (
            <div key={s.id} className="surface flex items-center gap-4 p-4">
              <span className="grid h-10 w-12 shrink-0 place-items-center rounded-lg bg-bg-3 font-mono text-xs font-bold text-gold">
                {WEEKDAYS[s.weekday]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-text-0">{s.start_time} · {s.timezone}</p>
                <p className="truncate text-xs text-text-2">{s.title || "Stream"}</p>
              </div>
              <form action={deleteSlot}>
                <input type="hidden" name="id" value={s.id} />
                <button className="press grid h-9 w-9 place-items-center rounded-lg border border-line text-text-2 hover:border-danger hover:text-danger" title="Delete">
                  <Icon name="Trash2" className="h-4 w-4" />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
