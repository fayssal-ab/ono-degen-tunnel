import type { Metadata } from "next";
import { getFeaturedHuntState, type HuntOverlayState } from "@/lib/bonusHunt";
import { HuntOverlay } from "@/components/overlay/HuntOverlay";

export const metadata: Metadata = { title: "Bonus hunt overlay", robots: { index: false } };
export const dynamic = "force-dynamic";

// OBS browser source (transparent). Shows the current hunt's bonus list and
// stats; updates by itself as payouts are entered in Admin → Bonus Hunt.
// Options: ?side=right (anchor right), ?rows=N (visible rows, default 10).
export default async function BonusHuntOverlay({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  let initial: HuntOverlayState | null = null;
  try { initial = await getFeaturedHuntState(); } catch { /* the overlay polls and recovers */ }
  const rows = Math.min(20, Math.max(4, Number(sp.rows) || 10));
  return (
    <>
      <style>{`html,body{background:transparent !important}`}</style>
      <HuntOverlay initial={initial} rows={rows} side={sp.side === "right" ? "right" : "left"} />
    </>
  );
}
