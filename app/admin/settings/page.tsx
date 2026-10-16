import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { getSetting, setSetting, type Announcement } from "@/lib/settings";
import { TOGGLEABLE_PAGES, getPageVisibility } from "@/lib/pages";
import { CASINOS } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

// Server Action: persists the settings this page edits. Re-checks admin (the
// layout guards the route, but actions are their own entry point) and audits.
async function saveSettings(formData: FormData) {
  "use server";
  if (!(await isAdminSession())) redirect("/login");

  const enabled = formData.get("leaderboard_enabled") === "on";
  const text = String(formData.get("announcement_text") ?? "").trim();
  const href = String(formData.get("announcement_href") ?? "").trim();
  const announcement: Announcement | null = text ? { text, href: href || undefined } : null;

  // page show/hide: unchecked checkboxes aren't submitted, so build the map
  // explicitly from the known page list.
  const visibility: Record<string, boolean> = {};
  for (const p of TOGGLEABLE_PAGES) visibility[p.key] = formData.get(`page:${p.key}`) === "on";

  await setSetting("leaderboard_enabled", enabled);
  await setSetting("announcement", announcement);
  await setSetting("page_visibility", visibility);
  await logAudit("admin", "settings.update", "site", { leaderboard_enabled: enabled, announcement, visibility });

  // revalidate the whole tree so hidden pages 404 and drop out of the nav
  revalidatePath("/", "layout");
}

export default async function AdminSettings() {
  const [enabled, announcement, visibility] = await Promise.all([
    getSetting("leaderboard_enabled"),
    getSetting("announcement"),
    getPageVisibility(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="label">Site</p>
        <h1 className="mt-1 text-2xl">Settings</h1>
      </div>

      <form action={saveSettings} className="space-y-6">
        {/* leaderboard toggle */}
        <div className="surface p-6">
          <div className="flex items-start gap-4">
            <Icon name="Trophy" className="mt-1 h-5 w-5 text-gold" />
            <div className="flex-1">
              <h2 className="text-lg">Leaderboard</h2>
              <p className="mt-1 text-sm text-text-2">
                When off, every leaderboard surface shows the designed “coming soon” state instead of
                data. Turn it off for months with no board running.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" name="leaderboard_enabled" defaultChecked={enabled} className="peer sr-only" />
              <span className="h-6 w-11 rounded-full bg-bg-3 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-text-1 after:transition-all peer-checked:bg-gold peer-checked:after:translate-x-5 peer-checked:after:bg-bg-0" />
            </label>
          </div>
        </div>

        {/* announcement banner */}
        <div className="surface p-6">
          <h2 className="text-lg">Announcement banner</h2>
          <p className="mt-1 text-sm text-text-2">Shown site-wide when set. Leave the text empty to hide it.</p>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="at" className="label">Text</label>
              <input
                id="at"
                name="announcement_text"
                defaultValue={announcement?.text ?? ""}
                placeholder="e.g. Double-points stream this Friday"
                className="mt-1.5 h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="ah" className="label">Link (optional)</label>
              <input
                id="ah"
                name="announcement_href"
                defaultValue={announcement?.href ?? ""}
                placeholder="/giveaways"
                className="mt-1.5 h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* page visibility */}
        <div className="surface p-6">
          <div className="flex items-start gap-4">
            <Icon name="Eye" className="mt-1 h-5 w-5 text-gold" />
            <div>
              <h2 className="text-lg">Pages</h2>
              <p className="mt-1 text-sm text-text-2">
                Turn any page on or off. A hidden page disappears from the menu and returns a 404 — the
                home, info and legal pages always stay on.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {TOGGLEABLE_PAGES.map((p) => {
              const on = visibility[p.key] !== false;
              return (
                <label key={p.key} className="flex items-center justify-between rounded-xl border border-line bg-bg-1 px-4 py-3">
                  <span className="text-sm text-text-0">{p.label}</span>
                  <span className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" name={`page:${p.key}`} defaultChecked={on} className="peer sr-only" />
                    <span className="h-6 w-11 rounded-full bg-bg-3 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-text-1 after:transition-all peer-checked:bg-gold peer-checked:after:translate-x-5 peer-checked:after:bg-bg-0" />
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          className="press inline-flex h-11 items-center gap-2 rounded-xl bg-gold px-6 text-sm font-semibold text-bg-0 hover:bg-gold-hi"
        >
          <Icon name="Save" className="h-4 w-4" /> Save settings
        </button>
      </form>

      {/* casino links are env-based (read-only here) */}
      <div className="surface p-6">
        <h2 className="text-lg">Partner casinos</h2>
        <p className="mt-1 text-sm text-text-2">
          Set via environment variables (NEXT_PUBLIC_STAKE_URL and NEXT_PUBLIC_STAKE_CODE). Shown here for reference.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CASINOS.map((c) => (
            <div key={c.name} className="rounded-xl border border-line p-4">
              <p className="font-semibold">{c.name}</p>
              <p className="mt-1 font-mono text-xs text-text-2">code {c.code}</p>
              <p className="mt-1 truncate font-mono text-xs text-text-2">{c.url}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
