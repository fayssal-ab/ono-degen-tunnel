import type { Metadata } from "next";
import { getFeaturedKo, getKoState, type KoState } from "@/lib/knockout";
import { KoOverlay, type OverlayPos } from "@/components/tournament/KoOverlay";

export const metadata: Metadata = { title: "Tournament overlay", robots: { index: false } };
export const dynamic = "force-dynamic";

// OBS browser source (1920×1080, transparent). Read-only: no controls, no
// admin data. Follows the admin dashboard by polling the public state.
// Compact card sized to its content, bottom-left by default (?pos=br|tl|tr);
// ?layout=full shows the big centred version instead.
export default async function TournamentOverlay({ searchParams }: { searchParams: Promise<{ layout?: string; pos?: string }> }) {
  const sp = await searchParams;
  const layout = sp.layout === "full" ? "full" : "compact";
  const pos: OverlayPos = sp.pos === "br" || sp.pos === "tl" || sp.pos === "tr" ? sp.pos : "bl";
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
