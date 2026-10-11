import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { MobileNav } from "./MobileNav";
import { StarField } from "./StarField";
import { CustomCursor } from "./CustomCursor";
import { AnnouncementBar } from "./AnnouncementBar";
import { SiteFooter } from "@/components/SiteFooter";
import { getSetting } from "@/lib/settings";
import { getHiddenHrefs } from "@/lib/pages";

// Server component. Reads the cached Kick live status (refreshed by
// /api/cron/kick-live); getSetting degrades to offline if the DB isn't ready,
// so the shell never crashes. No user accounts — the admin reaches /login by
// URL, so there is no login button in the chrome.
async function getShellData(): Promise<{ live: boolean; viewers: number | null }> {
  const kick = await getSetting("kick_live");
  return { live: kick.live, viewers: kick.viewers };
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [{ live, viewers }, hidden] = await Promise.all([getShellData(), getHiddenHrefs()]);

  return (
    <>
      <StarField />
      <CustomCursor />
      <Sidebar live={live} hidden={hidden} />
      <TopBar live={live} viewers={viewers} />
      <CommandPalette hidden={hidden} />

      <div className="app-main min-h-dvh">
        <AnnouncementBar />
        <main className="relative z-[1] mx-auto w-full max-w-[var(--max-content)] px-4 pb-24 pt-6 md:px-6 lg:pb-12">
          {children}
        </main>
        <SiteFooter />
      </div>

      <MobileNav hidden={hidden} />
    </>
  );
}
