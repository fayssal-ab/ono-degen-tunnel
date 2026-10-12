import { adminAction, requireAdmin } from "@/lib/adminAction";
import { getCatalogStats, syncCatalog, verifyBatch } from "@/lib/slotCatalog";
import { Icon } from "@/components/ui/Icon";
import { Flash, AdminHeader, Help, Utc, btnGold, btnGhost, type SearchParams } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";

export const dynamic = "force-dynamic";
const PATH = "/admin/slots";

async function syncAction() {
  "use server";
  await adminAction({ path: PATH, audit: "slots.sync" }, async () => await syncCatalog());
}

async function verifyAction() {
  "use server";
  await adminAction({ path: PATH, audit: "slots.verify" }, async () => await verifyBatch(400));
}

export default async function AdminSlots({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  let stats = null;
  try { stats = await getCatalogStats(); } catch { /* shown below */ }
  const tiles = stats ? [
    { label: "Slots in catalogue", value: stats.total },
    { label: "Verified real art", value: stats.real },
    { label: "No official art", value: stats.missing },
    { label: "Not checked yet", value: stats.unknown },
    { label: "Disputed provider", value: stats.ambiguous },
    { label: "Tournament pool", value: stats.pool },
  ] : [];

  return (
    <div className="space-y-8">
      <AdminHeader kicker="Data" title="Slot catalogue" />
      <Flash searchParams={searchParams} />
      <Help>
        Slot names, providers and ids come from <a href="https://slot.report" className="text-gold hover:underline" target="_blank" rel="noreferrer">slot.report</a> (synced daily by the cron).
        slot.report returns a branded placeholder for slots it has no art for, so every thumbnail is downloaded and checked before it is shown; slots without real art appear as a name tile.
        The tournament pool = slots with verified art and an undisputed provider. There is no public Stake game API, so Stake availability itself is not verified.
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
      <div className="flex flex-wrap gap-2">
        <form action={syncAction}><SubmitButton className={btnGold}><Icon name="RefreshCw" className="h-4 w-4" /> Sync catalogue now</SubmitButton></form>
        <form action={verifyAction}><SubmitButton className={btnGhost}><Icon name="ImageUp" className="h-4 w-4" /> Check next 400 thumbnails</SubmitButton></form>
      </div>
    </div>
  );
}
