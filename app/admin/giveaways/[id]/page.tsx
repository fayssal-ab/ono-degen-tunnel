import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/admin";
import { kickConfigured } from "@/lib/kick";
import { getGiveaway, getEntries, getWinners } from "@/lib/giveaways";
import { Icon } from "@/components/ui/Icon";
import { GiveawayDashboard } from "@/components/admin/GiveawayDashboard";
import { KICK_CHANNEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function GiveawayControlPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) redirect("/login");
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) notFound();

  const g = await getGiveaway(giveawayId);
  if (!g) notFound();

  const [entries, winners] = await Promise.all([getEntries(giveawayId), getWinners(giveawayId)]);
  const eligible = entries.filter((e) => !e.excluded);

  const initial = {
    giveaway: {
      id: g.id,
      title: g.title,
      prize: g.prize,
      status: g.status,
      keyword: g.keyword,
      subscribersOnly: g.subscribers_only,
    },
    kickConfigured: kickConfigured(),
    entries: entries.map((e) => ({
      username: e.username,
      avatar: e.avatar,
      platform: "kick" as const,
      isSubscriber: e.is_subscriber,
      excluded: e.excluded,
      createdAt: e.created_at,
    })),
    eligibleCount: eligible.length,
    winners: winners.map((w) => ({ username: w.username, avatar: w.avatar })),
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/giveaways" className="inline-flex items-center gap-1 text-sm text-text-1 hover:text-text-0">
        <Icon name="ChevronLeft" className="h-4 w-4" /> All giveaways
      </Link>
      <GiveawayDashboard id={giveawayId} initial={initial} defaultChannel={KICK_CHANNEL} />
    </div>
  );
}
