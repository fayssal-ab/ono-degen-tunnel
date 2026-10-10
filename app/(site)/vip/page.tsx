import type { Metadata } from "next";
import Image from "next/image";
import { getVipTiers } from "@/lib/vip";
import { formatMoneyCompact } from "@/lib/money";
import { CASINO_CODE, DISCORD_URL } from "@/lib/constants";
import { ASSETS } from "@/lib/assets";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "VIP Club",
  description: "Climb the VIP ladder by wagering under the code. Bigger perks the deeper you go.",
};
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

const TIER_ASSET: Record<string, string> = {
  bronze: ASSETS.vip.bronze,
  silver: ASSETS.vip.silver,
  gold: ASSETS.vip.gold,
  platinum: ASSETS.vip.platinum,
  diamond: ASSETS.vip.diamond,
  obsidian: ASSETS.vip.obsidian,
  "tunnel-god": ASSETS.vip.tunnelGod,
};

export default async function VipPage() {
  if (!(await isPageEnabled("/vip"))) notFound();
  const tiers = await getVipTiers();

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Rewards"
        title="VIP Club"
        lead={`Every dollar you wager under code ${CASINO_CODE} moves you up the tunnel. Higher tiers mean bigger giveaway entries, monthly bonuses and a louder voice in Discord.`}
      />

      {tiers.length === 0 ? (
        <EmptyState
          image={ASSETS.empty.leaderboardSoon}
          title="VIP tiers not set up yet"
          line="The VIP ladder will appear here once the tiers are configured. Ping a mod in Discord to ask what's coming."
          cta={{ label: "Join Discord", href: DISCORD_URL, external: true }}
        />
      ) : (
        <div className="space-y-4">
          {tiers.map((tier, i) => {
            const top = i === tiers.length - 1;
            return (
              <div
                key={tier.slug}
                className={`surface relative flex flex-col gap-5 p-6 md:flex-row md:items-center ${top ? "gold-border" : ""}`}
              >
                <div className="flex items-center gap-4 md:w-64">
                  <div className="relative h-16 w-16 shrink-0">
                    <Image src={TIER_ASSET[tier.slug] ?? ASSETS.vip.bronze} alt="" fill unoptimized className="object-contain" />
                  </div>
                  <div>
                    <p className="label">Tier {i + 1}</p>
                    <p className={`font-display text-xl font-bold ${top ? "text-gold" : "text-text-0"}`}>{tier.name}</p>
                  </div>
                </div>

                <div className="md:w-40">
                  <p className="label">Wagered</p>
                  <p className="mt-1 font-mono text-lg tabular-nums text-text-0">
                    {formatMoneyCompact(tier.threshold_wagered)}+
                  </p>
                </div>

                <ul className="flex flex-1 flex-wrap gap-2">
                  {tier.perks.map((perk) => (
                    <li key={perk} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-1 px-3 py-1.5 text-xs text-text-1">
                      <Icon name="Check" className="h-3.5 w-3.5 text-volt" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="surface flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg">Perks are handled by {`ONO`} directly</h2>
          <p className="mt-1 text-sm text-text-1">
            Link your casino username and ping a mod in Discord once you hit a tier to claim your rewards.
          </p>
        </div>
        <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="press inline-flex h-11 items-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi">
          <Icon name="MessageCircle" className="h-4 w-4" /> Claim in Discord
        </a>
      </div>
    </div>
  );
}
