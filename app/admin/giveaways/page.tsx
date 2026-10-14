import { entryEligible, collectionOpen } from "@/lib/giveawayRules";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { kickConfigured } from "@/lib/kick";
import { getAllGiveaways, getEntries, getWinners } from "@/lib/giveaways";
import { GiveawayAdminBar } from "@/components/admin/GiveawayAdminBar";
import { GiveawayDashboard } from "@/components/admin/GiveawayDashboard";
import { KICK_CHANNEL } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

// Primary view IS the Control Vault for the selected giveaway. The switcher
// picks which one; "New giveaway" is a modal (GiveawayAdminBar). No form+list.
export default async function AdminGiveaways({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  if (!(await isAdminSession())) redirect("/login");
  const sp = await searchParams;

  const giveaways = await getAllGiveaways();
  const opts = giveaways.map((g) => ({ id: g.id, title: g.title, status: g.status, entrants: g.entrants }));

  // selection: ?g= if valid, else newest open, else newest
  const wanted = Number(sp.g);
  const selected =
    (Number.isInteger(wanted) && giveaways.find((g) => g.id === wanted)) ||
    giveaways.find((g) => g.status === "open") ||
    giveaways[0] ||
    null;

  if (!selected) {
    return (
      <div className="space-y-6">
        <GiveawayAdminBar giveaways={opts} selectedId={null} />
        <EmptyState
          icon="Gift"
          title="No giveaways yet"
          line="Create your first giveaway to open the control vault. Entries come live from Kick chat."
        />
      </div>
    );
  }

  const [entries, winners] = await Promise.all([getEntries(selected.id), getWinners(selected.id)]);
  const eligible = entries.filter((e) => entryEligible(e, selected));

  const initial = {
    giveaway: {
      id: selected.id,
      title: selected.title,
      prize: selected.prize,
      status: selected.status,
      keyword: selected.keyword,
      subscribersOnly: selected.subscribers_only,
      minMessages: selected.min_messages, acceptingEntries: collectionOpen(selected), poolLocked: winners.length > 0 || selected.needs_reset,
    },
    kickConfigured: kickConfigured(),
    entries: entries.map((e) => ({
      username: e.username,
      avatar: e.avatar,
      platform: "kick" as const,
      isSubscriber: e.is_subscriber,
      excluded: e.excluded, eligible: entryEligible(e, selected),
      createdAt: e.created_at,
    })),
    eligibleCount: eligible.length,
    winners: winners.map((w) => ({ username: w.username, avatar: w.avatar, nonce: w.nonce, response: w.response })),
  };

  return (
    <div className="space-y-5">
      <GiveawayAdminBar giveaways={opts} selectedId={selected.id} />
      {/* key forces a fresh dashboard (and poll) when switching giveaways */}
      <GiveawayDashboard key={selected.id} id={selected.id} initial={initial} defaultChannel={KICK_CHANNEL} guildId={process.env.DISCORD_GUILD_ID ?? null} />
    </div>
  );
}
