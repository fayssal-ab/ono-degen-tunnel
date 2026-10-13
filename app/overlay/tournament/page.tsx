import type { Metadata } from "next";
import { getFeaturedKo, getKoState, type KoState } from "@/lib/knockout";
import { KoOverlay, type OverlayPos } from "@/components/tournament/KoOverlay";

export const metadata: Metadata = { title: "Tournament overlay", robots: { index: false } };
export const dynamic = "force-dynamic";

// OBS browser source (1920×1080, transparent). Read-only: no controls, no
// admin data. Follows the admin dashboard by polling the public state.
// ?pos=bl|br|tl|tr picks the corner of the compact card; ?layout=full shows
// the big centred version instead.
export default async function TournamentOverlay({ searchParams }: { searchParams: Promise<{ pos?: string; layout?: string }> }) {
  const sp = await searchParams;
  const pos: OverlayPos = sp.pos === "br" || sp.pos === "tl" || sp.pos === "tr" ? sp.pos : "bl";
  const layout = sp.layout === "full" ? "full" : "compact";
  let initial: KoState | null = null;
  try {
    const t = await getFeaturedKo();
    initial = t ? await getKoState(t) : null;
  } catch { /* overlay polls and recovers */ }
  return (
    <>
      <style>{`html,body{background:transparent !important}`}</style>
      <KoOverlay initial={initial} layout={layout} pos={pos} />
    </>
  );
}
