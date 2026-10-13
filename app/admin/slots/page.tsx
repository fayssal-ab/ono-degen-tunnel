import { adminAction, requireAdmin } from "@/lib/adminAction";
import { getCatalogStats, syncCatalog, POOL_TOP } from "@/lib/slotCatalog";
import { Icon } from "@/components/ui/Icon";
import { Flash, AdminHeader, Help, Utc, btnGold, type SearchParams } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";

export const dynamic = "force-dynamic";
const PATH = "/admin/slots";

async function syncAction() {
  "use server";
  await adminAction({ path: PATH, audit: "slots.sync" }, async () => await syncCatalog());
}

export default async function AdminSlots({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  let stats = null;
  try { stats = await getCatalogStats(); } catch { /* shown below */ }
  const tiles = stats ? [
    { label: "Stake slots", value: stats.total },
    { label: "Only on Stake", value: stats.onlyOnStake },
    { label: "With Stake art", value: stats.withArt },
    { label: "Providers", value: stats.providers },
    { label: `Tournament pool (top ${POOL_TOP})`, value: stats.pool },
  ] : [];

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Data" title="Slot catalogue" />
      <Flash searchParams={searchParams} />
      <Help>
        Stake&apos;s slot catalogue — names, providers, official Stake art and the “Only on Stake” flag — comes from the{" "}
        <a href="https://sharkz.gg" className="text-gold hover:underline" target="_blank" rel="noreferrer">sharkz.gg</a> feed (used with permission)
        and is re-synced automatically every day. Random tournament slots are drawn from Stake&apos;s {POOL_TOP} most played slots.
        Nothing to add by hand: a name that isn&apos;t a Stake slot just shows as a name tile.
      </Help>
      {!stats ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">Catalogue tables unavailable — run the migrations.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {tiles.map((t) => (
              <div key={t.label} className="surface p-4">
                <p className="label">{t.label}</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{t.value.toLocaleString("en-US")}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-text-2">Last sync <Utc value={stats.syncedAt} /></p>
        </>
      )}
      <form action={syncAction}><SubmitButton className={btnGold}><Icon name="RefreshCw" className="h-4 w-4" /> Sync Stake catalogue now</SubmitButton></form>
    </div>
  );
}
