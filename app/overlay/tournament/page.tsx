import type { Metadata } from "next";
import { getFeaturedKo, getKoState, type KoState } from "@/lib/knockout";
import { KoOverlay } from "@/components/tournament/KoOverlay";

export const metadata: Metadata = { title: "Tournament overlay", robots: { index: false } };
export const dynamic = "force-dynamic";

// OBS browser source (1920×1080, transparent). Read-only: no controls, no
// admin data. Follows the admin dashboard by polling the public state.
// The card fills the source window — size and place it in OBS. ?layout=full
// shows the big centred 1920×1080 version instead.
export default async function TournamentOverlay({ searchParams }: { searchParams: Promise<{ layout?: string }> }) {
  const sp = await searchParams;
  const layout = sp.layout === "full" ? "full" : "compact";
  let initial: KoState | null = null;
  try {
    const t = await getFeaturedKo();
    initial = t ? await getKoState(t) : null;
  } catch { /* overlay polls and recovers */ }
  return (
    <>
      <style>{`html,body{background:transparent !important}`}</style>
      <KoOverlay initial={initial} layout={layout} />
    </>
  );
}
