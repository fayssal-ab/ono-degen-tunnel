import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFeaturedKo, getKoById, getKoState, getKoArchive } from "@/lib/knockout";
import { isPageEnabled } from "@/lib/pages";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { attempt, Unavailable, UtcTime } from "@/components/events/shared";
import { KoPublic } from "@/components/tournament/KoPublic";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "16-player slot knockout — join from Kick chat with !join.",
};
export const dynamic = "force-dynamic";

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isPageEnabled("/tournaments"))) notFound();
  const idParam = Number((await searchParams).id);
  const requested = Number.isInteger(idParam) && idParam > 0 ? idParam : null;
  const result = await attempt(async () => {
    const t = requested ? await getKoById(requested) : await getFeaturedKo();
    const state = t && t.status !== "cancelled" ? await getKoState(t) : null;
    return { state, archive: await getKoArchive(12) };
  });
  const header = <PageHeader kicker="Compete" title="Tournaments" lead="16 players from chat. One slot each. Single elimination until a champion stands." />;
  if (!result.ok) return <div className="space-y-10">{header}<Unavailable what="Tournaments" /></div>;
  const { state, archive } = result.data;
  if (requested && !state) notFound();

  return (
    <div className="space-y-10">
      {header}
      {requested && <Link href="/tournaments" className="inline-flex items-center gap-1 text-sm text-text-1 hover:text-text-0"><Icon name="ChevronLeft" className="h-4 w-4" /> Current tournament</Link>}
      {state ? <KoPublic initial={state} id={requested ?? undefined} /> : (
        <EmptyState icon="Swords" title="No tournament yet" line="When registration opens on stream, type !join in Kick chat to grab one of 16 spots." cta={{ label: "Watch stream", href: "/stream" }} />
      )}
      {archive.length > 0 && (
        <section>
          <SectionHeading kicker="Archive" title="Past champions" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archive.map((a) => (
              <Link key={a.id} href={`/tournaments?id=${a.id}`} className="surface block p-5 hover:border-gold/40">
                <p className="text-sm text-text-0">{a.title || "Knockout"}</p>
                <p className="mt-1 text-xs text-text-2"><UtcTime value={a.finished_at} /></p>
                <p className="mt-3 text-sm">👑 <span className="text-gold">{a.champion ?? "—"}</span>{a.champion_slot && <span className="text-text-2"> · {a.champion_slot}</span>}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
