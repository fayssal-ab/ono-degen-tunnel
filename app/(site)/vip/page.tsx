import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVipTiers } from "@/lib/vip";
import { isPageEnabled } from "@/lib/pages";
import { formatMoneyCompact } from "@/lib/money";
import { CASINO_CODE, DISCORD_URL } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "VIP Club",
  description: "Climb the VIP ladder by wagering under the code. Bigger perks the deeper you go.",
};
export const dynamic = "force-dynamic";

// Tier look = CSS gradient + icon (no drawn image). Unknown slugs fall back.
const TIER: Record<string, { from: string; to: string; icon: string; ink: string }> = {
  bronze: { from: "#c9843d", to: "#6e441c", icon: "Shield", ink: "#2a1708" },
  silver: { from: "#e2e8f0", to: "#8894a6", icon: "Shield", ink: "#2a3340" },
  gold: { from: "#ffd97a", to: "#c08a2a", icon: "Star", ink: "#3a2a07" },
  platinum: { from: "#eef3f8", to: "#9fb0bf", icon: "Star", ink: "#2f3a44" },
  diamond: { from: "#8ff0ff", to: "#15a9c4", icon: "Gem", ink: "#06323b" },
  obsidian: { from: "#8a8ab0", to: "#20203a", icon: "Gem", ink: "#0b0b18" },
  "tunnel-god": { from: "#ffd97a", to: "#8b5cf6", icon: "Crown", ink: "#1c1433" },
};
const FALLBACK = { from: "#8a94a8", to: "#394150", icon: "Medal", ink: "#10151f" };

export default async function VipPage() {
  if (!(await isPageEnabled("/vip"))) notFound();
  const tiers = await getVipTiers();

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Rewards"
        title="VIP Club"
        accent="gold"
        lead={`Wager under code ${CASINO_CODE} and climb. Higher tiers, bigger perks.`}
      />

      {tiers.length === 0 ? (
        <EmptyState
          title="VIP tiers not set up yet"
          line="The VIP ladder will appear here once the tiers are configured. Ping a mod in Discord to ask what's coming."
          cta={{ label: "Join Discord", href: DISCORD_URL, external: true }}
        />
      ) : (
        <div className="space-y-4">
          {tiers.map((tier, i) => {
            const top = i === tiers.length - 1;
            const t = TIER[tier.slug] ?? FALLBACK;
            return (
              <div
                key={tier.slug}
                className={`surface relative flex flex-col gap-5 p-6 md:flex-row md:items-center ${top ? "gold-border" : ""}`}
              >
                <div className="flex items-center gap-4 md:w-64">
                  <span
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl"
                    style={{
                      background: `linear-gradient(140deg, ${t.from}, ${t.to})`,
                      boxShadow: `0 0 26px -10px ${t.from}`,
                      color: t.ink,
                    }}
                  >
                    <Icon name={t.icon} className="h-7 w-7" />
                  </span>
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
          <h2 className="text-lg">Perks are handled by ONO directly</h2>
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
