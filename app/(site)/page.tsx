import type { Metadata } from "next";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { getActivePeriod } from "@/lib/periods";
import { getLiveBoard } from "@/lib/board";
import { isLeaderboardEnabled } from "@/lib/settings";
import { getHiddenHrefs } from "@/lib/pages";
import { KICK_URL, DISCORD_URL, CASINO_CODE } from "@/lib/constants";
import { TunnelHero } from "@/components/home/TunnelHero";
import { ParticleField } from "@/components/home/ParticleField";
import { Casinos } from "@/components/home/Casinos";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Badge, SectionHeading } from "@/components/ui/Badge";
import { FeatureIcon, FEATURE_ICONS } from "@/components/ui/FeatureIcon";
import { Podium } from "@/components/leaderboard/Podium";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal, RevealStagger, RevealItem } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  description: "Wager. Climb. Get paid. Sign up with code and ride the tunnel.",
};
export const dynamic = "force-dynamic";

async function getHomeStats() {
  try {
    const pool = getPool();
    const [[paid]] = await pool.query<RowDataPacket[]>("SELECT COALESCE(SUM(prize),0) AS n FROM final_results");
    const [[players]] = await pool.query<RowDataPacket[]>("SELECT COUNT(DISTINCT casino_id) AS n FROM live_entries");
    const [[gw]] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM giveaway_winners");
    return { paidOut: Number(paid.n), players: Number(players.n), giveaways: Number(gw.n) };
  } catch {
    return { paidOut: 0, players: 0, giveaways: 0 };
  }
}

const STEPS = [
  { n: "01", icon: "UserPlus", title: "Sign up", body: `Register with code ${CASINO_CODE}.` },
  { n: "02", icon: "Dices", title: "Wager & climb", body: "Play normal. Wagers sync every 10 min." },
  { n: "03", icon: "Trophy", title: "Get paid", body: "Top ranks split the pool." },
];

const FEATURES: { href: string; icon: string; title: string; body: string; tone: "gold" | "volt"; big?: boolean }[] = [
  { href: "/leaderboard", icon: "Trophy", title: "Leaderboard", body: "Climb the monthly board. Top ranks split the pool.", tone: "gold", big: true },
  { href: "/giveaways", icon: "Gift", title: "Giveaways", body: "Drawn live, provably fair.", tone: "volt" },
  { href: "/races", icon: "Flag", title: "Races", body: "24h & weekly sprints.", tone: "gold" },
  { href: "/tournaments", icon: "Swords", title: "Tournaments", body: "8-slot slot battles.", tone: "gold" },
  { href: "/bonus-hunt", icon: "Dices", title: "Bonus Hunt", body: "Live, to the dollar.", tone: "volt" },
  { href: "/vip", icon: "Crown", title: "VIP Club", body: "The deeper you go, the bigger the perks.", tone: "gold", big: true },
];


export default async function HomePage() {
  const [stats, enabled, active, hidden] = await Promise.all([
    getHomeStats(),
    isLeaderboardEnabled(),
    getActivePeriod(),
    getHiddenHrefs(),
  ]);
  const preview = enabled && active ? await getLiveBoard(active, 3) : [];
  const hiddenSet = new Set(hidden);
  const features = FEATURES.filter((f) => !hiddenSet.has(f.href));

  return (
    <div className="space-y-14 md:space-y-20">
      <ParticleField />
      <TunnelHero stats={stats} />

      {/* feature bento */}
      {features.length > 0 && (
        <section>
          <Reveal><SectionHeading kicker="Everything in the tunnel" title="What you get" watermark="Rewards" accent="cyan" /></Reveal>
          <RevealStagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {features.map((f) => (
              <RevealItem key={f.href} className={f.big ? "col-span-2" : ""}>
                <Link
                  href={f.href}
                  className="surface group relative flex h-full flex-col justify-between overflow-hidden p-5 transition-transform duration-200 hover:-translate-y-1"
                >
                  <div className="tunnel-grid absolute inset-0 opacity-30 transition-opacity group-hover:opacity-60" aria-hidden />
                  <div className="relative flex items-start justify-between">
                    <FeatureIcon
                      icon={FEATURE_ICONS[f.href]?.icon ?? f.icon}
                      color={FEATURE_ICONS[f.href]?.color ?? "cyan"}
                    />
                    <Icon name="ArrowUpRight" className="h-4 w-4 text-text-2 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <div className="relative mt-6">
                    <h3 className="text-lg">{f.title}</h3>
                    <p className="mt-1 text-sm text-text-2">{f.body}</p>
                  </div>
                </Link>
              </RevealItem>
            ))}
          </RevealStagger>
        </section>
      )}

      {/* leaderboard preview */}
      {!hiddenSet.has("/leaderboard") && (
        <section>
          <Reveal>
            <SectionHeading
              kicker="Compete"
              title="Leaderboard"
              watermark="Compete"
              align="right"
              accent="gold"
              action={
                <ButtonLink href="/leaderboard" variant="ghost" size="sm">
                  View board <Icon name="ArrowRight" className="h-4 w-4" />
                </ButtonLink>
              }
            />
          </Reveal>
          <Reveal delay={0.05}>
            {enabled && preview.length > 0 ? (
              <Podium rows={preview} />
            ) : (
              <EmptyState
                icon="Trophy"
                title="No board this month"
                line="There's no leaderboard running right now. Join the Discord to get pinged the moment the next season opens."
                cta={{ label: "Join Discord", href: DISCORD_URL, external: true }}
              />
            )}
          </Reveal>
        </section>
      )}

      <Reveal><Casinos /></Reveal>

      {/* how it works */}
      <section>
        <Reveal><SectionHeading kicker="The tunnel" title="How it works" watermark="The Tunnel" accent="cyan" /></Reveal>
        <RevealStagger className="grid gap-3 sm:gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <RevealItem key={s.n}>
              <div className="surface group relative h-full overflow-hidden p-6">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-bg-3 text-gold">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                  <span className="font-display text-5xl font-extrabold text-bg-3 transition-colors group-hover:text-line-strong">{s.n}</span>
                </div>
                <h3 className="mt-5 text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-text-1">{s.body}</p>
              </div>
            </RevealItem>
          ))}
        </RevealStagger>
      </section>

      {/* community banner */}
      <Reveal>
        <section className="surface relative overflow-hidden p-6 md:p-12">
          <div className="tunnel-grid absolute inset-0 opacity-50" aria-hidden />
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(124,255,79,0.12), transparent 70%)" }}
            aria-hidden
          />
          <div className="relative flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
            <div>
              <Badge tone="volt">Community</Badge>
              <h2 className="mt-3 text-2xl">Don&rsquo;t miss a drop</h2>
              <p className="mt-2 max-w-md text-text-1">It all happens live.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <a href={KICK_URL} target="_blank" rel="noreferrer" className="press inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-volt px-6 text-sm font-semibold text-bg-0 hover:brightness-110">
                <Icon name="Radio" className="h-4 w-4" /> Follow on Kick
              </a>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="press inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong px-6 text-sm hover:border-plasma hover:text-plasma">
                <Icon name="MessageCircle" className="h-4 w-4" /> Discord
              </a>
            </div>
          </div>
        </section>
      </Reveal>

    </div>
  );
}
