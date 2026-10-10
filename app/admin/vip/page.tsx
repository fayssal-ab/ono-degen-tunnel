import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { getPool } from "@/lib/db";
import { getVipTiers } from "@/lib/vip";
import { formatMoneyCompact } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

async function guard() {
  if (!(await isAdminSession())) redirect("/login");
}

async function saveTier(formData: FormData) {
  "use server";
  await guard();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!slug) return;
  const name = String(formData.get("name") ?? "").trim() || slug;
  const threshold = String(formData.get("threshold") ?? "0").replace(/[^0-9.]/g, "") || "0";
  const perks = String(formData.get("perks") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const position = Number(formData.get("position") ?? 0) || 0;
  await getPool().query(
    `INSERT INTO vip_tiers (slug, name, threshold_wagered, perks, position)
     VALUES (?, ?, ?, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), threshold_wagered = VALUES(threshold_wagered),
       perks = VALUES(perks), position = VALUES(position)`,
    [slug, name, threshold, JSON.stringify(perks), position]
  );
  await logAudit("admin", "vip.save", slug, { name, threshold, position });
  revalidatePath("/admin/vip");
  revalidatePath("/vip");
}

async function deleteTier(formData: FormData) {
  "use server";
  await guard();
  const slug = String(formData.get("slug"));
  await getPool().query("DELETE FROM vip_tiers WHERE slug = ?", [slug]);
  await logAudit("admin", "vip.delete", slug);
  revalidatePath("/admin/vip");
  revalidatePath("/vip");
}

const input = "h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none";

export default async function AdminVip() {
  await guard();
  const tiers = await getVipTiers();

  return (
    <div className="space-y-8">
      <div>
        <p className="label">Rewards</p>
        <h1 className="mt-1 text-2xl">VIP tiers</h1>
      </div>

      <form action={saveTier} className="surface grid gap-3 p-6 sm:grid-cols-2">
        <p className="label sm:col-span-2">Add or update a tier (same slug overwrites)</p>
        <label className="block"><span className="label">Slug</span><input name="slug" placeholder="gold" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">Name</span><input name="name" placeholder="Gold" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">Threshold wagered ($)</span><input name="threshold" placeholder="50000" className={`mt-1 ${input}`} /></label>
        <label className="block"><span className="label">Position (order)</span><input name="position" type="number" defaultValue={tiers.length} className={`mt-1 ${input}`} /></label>
        <label className="block sm:col-span-2"><span className="label">Perks (comma separated)</span><input name="perks" placeholder="Monthly bonus, +2 giveaway entries, Discord role" className={`mt-1 ${input}`} /></label>
        <div className="sm:col-span-2">
          <button type="submit" className="press inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi">
            <Icon name="Save" className="h-4 w-4" /> Save tier
          </button>
        </div>
      </form>

      {tiers.length === 0 ? (
        <p className="surface p-6 text-sm text-text-1">No tiers yet. Add the ladder above.</p>
      ) : (
        <div className="space-y-2">
          {tiers.map((t) => (
            <div key={t.slug} className="surface flex flex-wrap items-center gap-4 p-4">
              <div className="w-40">
                <p className="font-display font-bold text-gold">{t.name}</p>
                <p className="font-mono text-xs text-text-2">{t.slug} · pos {t.position}</p>
              </div>
              <p className="font-mono text-sm text-text-0">{formatMoneyCompact(t.threshold_wagered)}+</p>
              <p className="min-w-0 flex-1 truncate text-xs text-text-2">{t.perks.join(" · ")}</p>
              <form action={deleteTier}>
                <input type="hidden" name="slug" value={t.slug} />
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
