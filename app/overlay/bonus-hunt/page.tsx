import type { Metadata } from "next";
import { getFeaturedHuntState, type HuntOverlayState } from "@/lib/bonusHunt";
import { HuntOverlay } from "@/components/overlay/HuntOverlay";

export const metadata: Metadata = { title: "Bonus hunt overlay", robots: { index: false } };
export const dynamic = "force-dynamic";

// OBS browser source (transparent). Shows the current hunt's bonus list and
// stats; updates by itself as payouts are entered in Admin → Bonus Hunt.
// Fills the source window: size it in OBS (taller window → more rows).
export default async function BonusHuntOverlay() {
  let initial: HuntOverlayState | null = null;
  try { initial = await getFeaturedHuntState(); } catch { /* the overlay polls and recovers */ }
  return (
    <>
      <style>{`html,body{background:transparent !important}`}</style>
      <HuntOverlay initial={initial} />
    </>
  );
}
