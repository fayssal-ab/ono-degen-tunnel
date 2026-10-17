import type { Metadata } from "next";
import { getChallenges, type Challenge } from "@/lib/challenges";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArtCard } from "@/components/ui/ArtCard";
import { Icon } from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/Badge";
import { DISCORD_URL } from "@/lib/constants";
import { d } from "@/lib/money";
import { attempt, Unavailable, UtcTime } from "@/components/events/shared";

export const metadata: Metadata = {
  title: "Challenges",
  description: "First to hit the multiplier wins the prize.",
};
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

const STATUS: Record<Challenge["status"], { tone: "volt" | "gold" | "neutral"; label: string }> = {
  open: { tone: "volt", label: "Active" },
  claimed: { tone: "gold", label: "Claimed" },
  expired: { tone: "neutral", label: "Expired" },
};

export default async function ChallengesPage() {
  if (!(await isPageEnabled("/challenges"))) notFound();
  const result = await attempt(getChallenges);
  const header = <PageHeader kicker="Compete" title="Slot challenges" watermark="Challenges" lead="Hit the target multiplier on the slot first and the prize is yours. Claim your hit on Discord for verification." icon="Target" iconColor="magenta" />;
  if (!result.ok) return <div className="space-y-10">{header}<Unavailable what="Challenges" /></div>;
  const all = result.data;
  const live = all.filter((c) => c.status === "open");
  const past = all.filter((c) => c.status !== "open");

  return (
    <div className="space-y-10">
      {header}

      <section className="surface grid gap-4 p-6 text-sm text-text-1 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="label mb-2">How to claim</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Hit at least the target multiplier on that slot, with at least the minimum bet, before the challenge expires.</li>
            <li>Post your replay link, casino username, bet and multiplier in the <strong className="text-text-0">#challenges</strong> channel on Discord.</li>
            <li>The team checks the replay by hand. The first valid win is accepted and shown here — nothing is claimed until it&apos;s verified.</li>
          </ol>
        </div>
        <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="press inline-flex h-11 items-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi">
          <Icon name="MessageSquare" className="h-4 w-4" /> Claim on Discord
        </a>
      </section>

      {live.length === 0 ? (
        <EmptyState
          icon="Target"
          title="No challenges live"
          line="New challenges drop regularly. Follow on Kick and watch this space."
          cta={{ label: "Watch stream", href: "/stream" }}
        />
      ) : (
        <Cards challenges={live} />
      )}

      {past.length > 0 && (
        <section>
          <SectionHeading kicker="Archive" title="Claimed & expired" />
          <Cards challenges={past} />
        </section>
      )}
    </div>
  );
}

function Cards({ challenges }: { challenges: Challenge[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {challenges.map((c) => {
        const mult = `${d(c.required_multiplier).toString()}x`;
        return (
          <ArtCard key={c.id} tone={["#ff3d9a", "#5b1a6b"]} image={c.image_url} icon="Target" headline={mult}
            badge={{ label: STATUS[c.status].label, live: c.status === "open" }} dim={c.status === "expired"}
            title={`${c.slot_name} ${mult}`}
            sub={<><span className="font-semibold text-gold">{c.prize}</span> · min bet {formatMoney(c.min_bet)}</>}
            footer={c.status === "claimed" && c.claimedBy ? (
              <span className="inline-flex items-center gap-1 text-gold"><Icon name="Trophy" className="h-3.5 w-3.5" /> {c.claimedBy}
                {c.winning && <span className="text-text-2"> · hit {d(c.winning.multiplier).toString()}x on {formatMoney(c.winning.bet)}</span>}</span>
            ) : c.status === "open" ? (
              c.expires_at ? <>Expires <UtcTime value={c.expires_at} /></> : <span className="text-volt">Up for grabs</span>
            ) : "Closed"} />
        );
      })}
    </div>
  );
}
