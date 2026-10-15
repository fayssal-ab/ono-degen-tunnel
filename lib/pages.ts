import "server-only";
import { getSetting } from "./settings";

// Feature pages the admin can show/hide from Admin → Settings. Home and the
// legal/info pages are always on (compliance + core), so they aren't listed.
export const TOGGLEABLE_PAGES: { key: string; label: string }[] = [
  { key: "/leaderboard", label: "Leaderboard" },
  { key: "/races", label: "Races" },
  { key: "/tournaments", label: "Tournaments" },
  { key: "/challenges", label: "Challenges" },
  { key: "/bonus-hunt", label: "Bonus Hunt" },
  { key: "/guess-the-balance", label: "Guess the Balance" },
  { key: "/vip", label: "VIP Club" },
  { key: "/hall-of-fame", label: "Hall of Fame" },
  { key: "/prizes", label: "Prizes" },
  { key: "/stream", label: "Stream" },
];

export async function getPageVisibility(): Promise<Record<string, boolean>> {
  return getSetting("page_visibility");
}

/** A page is visible unless explicitly turned off (default on). */
export async function isPageEnabled(path: string): Promise<boolean> {
  const vis = await getPageVisibility();
  return vis[path] !== false;
}

/** Hrefs that are currently hidden — used to filter the nav. */
export async function getHiddenHrefs(): Promise<string[]> {
  const vis = await getPageVisibility();
  return TOGGLEABLE_PAGES.filter((p) => vis[p.key] === false).map((p) => p.key);
}
