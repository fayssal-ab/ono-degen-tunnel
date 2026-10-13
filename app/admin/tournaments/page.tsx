import Link from "next/link";
import { requireAdmin } from "@/lib/adminAction";
import { getFeaturedKo, getKoState, type KoState } from "@/lib/knockout";
import { getCatalogStats } from "@/lib/slotCatalog";
import { SITE_URL } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader, Help, btnGhost } from "@/components/admin/ui";
import { KoDashboard } from "@/components/tournament/KoDashboard";

export const dynamic = "force-dynamic";

export default async function AdminTournaments() {
  await requireAdmin();
  let initial: KoState | null = null;
  let pool: number | null = null;
  try {
    const t = await getFeaturedKo();
    initial = t ? await getKoState(t) : null;
    pool = (await getCatalogStats()).pool;
  } catch { /* the dashboard shows the live error state */ }

  return (
    <div className="space-y-6">
      <AdminHeader kicker="Compete" title="Knockout tournament">
        <div className="flex gap-2">
          <Link href="/overlay/tournament" target="_blank" className={btnGhost}><Icon name="MonitorPlay" className="h-4 w-4" /> OBS overlay</Link>
          <Link href="/tournaments" className={btnGhost}><Icon name="ExternalLink" className="h-4 w-4" /> Public page</Link>
        </div>
      </AdminHeader>
      <Help>
        Open registration → viewers type <code className="text-gold">!join &lt;slot name&gt;</code> in Kick chat (connect Kick chat below so the site receives chat by itself; otherwise keep this page open and active) → they enter with that slot
        (catalogue art + provider when the name is found, otherwise the name as typed). Plain <code className="text-gold">!join</code> gives a random slot. Typing it again changes only
        their slot until they are rolled into the bracket. 16 players close registration automatically.
        Roll 2 players → confirm → start → enter each bonus cost and payout: the higher multiplier wins automatically (exact tie = replay). Rolled positions and slots lock; losers are eliminated for good; winners follow the fixed bracket.
        With fewer than 16, close registration and remaining slots become byes.
      </Help>
      {pool === 0 && (
        <p role="alert" className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm">
          The Stake slot catalogue isn&apos;t loaded yet. <Link href="/admin/slots" className="text-gold underline">Sync the slot catalogue</Link> before opening registration.
        </p>
      )}
      <KoDashboard initial={initial} overlayUrl={`${SITE_URL.replace(/\/$/, "")}/overlay/tournament`} />
    </div>
  );
}
