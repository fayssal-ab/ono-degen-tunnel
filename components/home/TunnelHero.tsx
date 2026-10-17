import Link from "next/link";
import { Universe } from "./Universe";
import { ButtonLink } from "@/components/ui/Button";
import { CopyChip } from "@/components/ui/CopyChip";
import { Magnetic } from "@/components/ui/Magnetic";
import { Icon } from "@/components/ui/Icon";
import { CountUp } from "@/components/ui/CountUp";
import { BRAND_NAME, STREAMER, KICK_URL, CASINO_CODE } from "@/lib/constants";

// Hero reworked into an asymmetric "event banner" (structure inspired by the
// GameVerse Mega-prize banner): the CSS tunnel rings drift behind on the right,
// a left-aligned content column carries the kicker → huge title → lead → action
// row → an inline real-stats strip. Colours stay 100% ONO tokens.


function HeroStat({ label, value, money = false, tone = "text-text-0" }: { label: string; value: number; money?: boolean; tone?: string }) {
  return (
    <div className="hero-stat">
      <p className={`font-bang text-[clamp(1.6rem,2.4vw,2.4rem)] leading-none tracking-wide tabular-nums ${tone}`}><CountUp value={value} money={money} /></p>
      <p className="label mt-1">{label}</p>
    </div>
  );
}

export function TunnelHero({
  stats,
}: {
  stats?: { paidOut: number; players: number; giveaways: number };
}) {
  const hasStats = !!stats && stats.paidOut + stats.players + stats.giveaways > 0;

  return (
    <section className="surface relative isolate overflow-hidden px-6 py-16 md:px-12 md:py-24 lg:py-28">
      <Universe />
      {/* readability washes: darken the left column + soften the ring edges */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(90deg, var(--color-bg-1) 0%, color-mix(in srgb, var(--color-bg-1) 40%, transparent) 42%, transparent 70%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(75% 75% at 72% 50%, transparent 38%, var(--color-bg-1) 100%)" }}
        aria-hidden
      />

      <div className="relative z-10 max-w-2xl">
        <span className="label inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-volt" />
          </span>
          {STREAMER}&rsquo;s rewards tunnel
        </span>

        <h1 className="sr-only">{BRAND_NAME}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/LOGO/logo-640.webp"
          srcSet="/LOGO/logo-320.webp 320w, /LOGO/logo-640.webp 640w"
          sizes="(min-width: 768px) 320px, 240px"
          alt={BRAND_NAME}
          width={320}
          height={292}
          fetchPriority="high"
          decoding="async"
          className="hero-float mt-3 w-44 drop-shadow-[0_0_40px_rgba(245,196,81,0.3)] md:w-60"
        />

        <p className="font-bang mt-6 text-[clamp(2.4rem,6vw,4.6rem)] leading-[0.92] tracking-wide text-text-0">
          Wager. Climb.<br /><span className="text-shimmer">Get paid.</span>
        </p>
        <p className="mt-4 max-w-md text-lg text-text-1">
          Sign up on Stake with the code, play like you always do, and take a cut of every board, race and giveaway on stream.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Magnetic>
            <ButtonLink href="/#play" variant="gold" size="lg">
              <Icon name="Zap" className="h-4 w-4" /> Sign up &amp; play
            </ButtonLink>
          </Magnetic>
          <Magnetic>
            <a
              href={KICK_URL}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex h-13 items-center gap-2 rounded-xl border border-line-strong px-7 text-base text-text-0 hover:border-volt hover:text-volt"
            >
              <Icon name="Radio" className="h-4 w-4" /> Watch live
            </a>
          </Magnetic>
          <div className="flex items-center gap-2 pl-1">
            <span className="text-sm text-text-2">Code</span>
            <CopyChip value={CASINO_CODE} />
          </div>
        </div>

        {hasStats && (
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5 border-t border-line pt-6">
            <Link href="/prizes" className="rounded-lg transition-opacity hover:opacity-80" aria-label="See all prizes awarded">
              <HeroStat label="Prizes awarded →" value={stats!.paidOut} money tone="text-gold" />
            </Link>
            <HeroStat label="Players on the board" value={stats!.players} />
            <HeroStat label="Giveaway winners" value={stats!.giveaways} />
          </div>
        )}
      </div>
    </section>
  );
}
