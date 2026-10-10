import type { Metadata } from "next";
import { CASINO_CODE } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Rules", description: "How wagers are counted and prizes paid." };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-6">
      <h2 className="text-lg">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-text-1">{children}</div>
    </section>
  );
}

export default function RulesPage() {
  return (
    <div className="space-y-6">
      <PageHeader kicker="The fine print" title="Leaderboard rules" lead="Everything that decides where you land on the board and what you take home." />

      <Block title="Eligibility">
        <p>You must be signed up at a partner casino under code <span className="font-mono text-gold">{CASINO_CODE}</span>, and of legal gambling age in your country (18+ minimum). The streamer&rsquo;s own accounts and any disqualified accounts are removed before ranking.</p>
      </Block>

      <Block title="How wagers are counted">
        <p>Your ranking is your total <strong>wagered</strong> amount in the period — not profit or loss. Data is pulled from the casino&rsquo;s affiliate feed and refreshes about every 10 minutes, so there&rsquo;s a short delay between a bet and the board moving.</p>
        <p>Periods are whole days (the feed is date-based). The countdown shows the exact reset instant in your local time.</p>
      </Block>

      <Block title="Weighted wagering — read this">
        <div className="flex gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <Icon name="AlertTriangle" className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div className="space-y-2">
            <p className="text-text-0">Some casinos report a <strong>weighted</strong> wager, not the raw amount. Low-house-edge games (like blackjack) count for less than high-edge games (like slots).</p>
            <p>
              Worked example: with a 4% target edge, $100,000 wagered on blackjack (~0.5% edge → ~$500 of expected value) shows up as about{" "}
              <span className="font-mono text-gold">$12,500</span> on the board — because <span className="font-mono">500 ÷ (4 ÷ 100) = 12,500</span>.
            </p>
            <p className="text-text-2">This is why your casino account and the board can show different numbers. It&rsquo;s not a bug.</p>
          </div>
        </div>
      </Block>

      <Block title="Prizes & payouts">
        <p>The prize pool is split by rank using the distribution shown on the leaderboard. When a period ends, the standings are <strong>frozen</strong> — later refunds or corrections at the casino don&rsquo;t change a result once it&rsquo;s closed.</p>
        <p>Winners are contacted and paid by ONO. Link your casino username and reach a mod in Discord to arrange payout.</p>
      </Block>

      <Block title="Fair play">
        <p>Multi-accounting, collusion, bonus abuse or fraudulent wagering gets you removed and disqualified. ONO&rsquo;s decision on disputes is final.</p>
      </Block>
    </div>
  );
}
