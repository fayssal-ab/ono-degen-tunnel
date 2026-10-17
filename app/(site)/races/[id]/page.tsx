import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRaceById, getRaceEntries, countRaceEntries } from "@/lib/races";
import { isPageEnabled } from "@/lib/pages";
import { Icon } from "@/components/ui/Icon";
import { RaceHeader, RaceRules, RaceTable, RaceTop, toPublicEntries } from "@/components/events/RaceParts";
import { attempt, Unavailable, Pager, pageParam } from "@/components/events/shared";

export const dynamic = "force-dynamic";
const PAGE = 50;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Race #${id}` };
}

export default async function RaceDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isPageEnabled("/races"))) notFound();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const page = pageParam((await searchParams).page);

  const result = await attempt(async () => {
    const race = await getRaceById(id);
    if (!race || race.status === "upcoming") return null;
    const [rows, total] = await Promise.all([getRaceEntries(id, PAGE, (page - 1) * PAGE), countRaceEntries(id)]);
    return { race, entries: toPublicEntries(rows), total };
  });
  if (result.ok && !result.data) notFound();

  return (
    <div className="space-y-8">
      <Link href="/races" className="inline-flex items-center gap-1 text-sm text-text-1 hover:text-text-0">
        <Icon name="ChevronLeft" className="h-4 w-4" /> All races
      </Link>
      {!result.ok ? <Unavailable what="This race" /> : (() => {
        const { race, entries, total } = result.data!;
        return (
          <div className="surface space-y-5 p-6">
            <RaceHeader race={race} />
            <RaceRules race={race} />
            {entries.length === 0 ? <p className="text-sm text-text-1">No qualifying wagers.</p> : <div className="space-y-3"><RaceTop entries={entries} /><RaceTable entries={entries.filter((e) => e.rank > 3)} /></div>}
            <p className="text-xs text-text-2">{total} ranked player(s){race.status === "closed" ? " · final, frozen results" : ""}</p>
            <Pager base={`/races/${race.id}`} page={page} pages={Math.ceil(total / PAGE)} />
          </div>
        );
      })()}
    </div>
  );
}
