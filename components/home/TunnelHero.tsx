import { ButtonLink } from "@/components/ui/Button";
import { CopyChip } from "@/components/ui/CopyChip";
import { Magnetic } from "@/components/ui/Magnetic";
import { Icon } from "@/components/ui/Icon";
import { formatMoneyCompact } from "@/lib/money";
import { BRAND_NAME, STREAMER, KICK_URL, CASINO_CODE } from "@/lib/constants";

// Hero reworked into an asymmetric "event banner" (structure inspired by the
// GameVerse Mega-prize banner): the CSS tunnel rings drift behind on the right,
// a left-aligned content column carries the kicker → huge title → lead → action
// row → an inline real-stats strip. Colours stay 100% ONO tokens.
const RINGS = 9;

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hero-stat">
      <p className="font-mono text-2xl font-bold tabular-nums text-text-0">{value}</p>
      <p className="label mt-0.5">{label}</p>
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
      {/* rings fly toward the viewer, biased to the right so the copy stays clear */}
      <div className="tunnel-stage pointer-events-none absolute inset-0 left-auto w-[75%] translate-x-[18%]" aria-hidden>
        {Array.from({ length: RINGS }).map((_, i) => (
          <span
            key={i}
            className="tunnel-ring"
            style={
              {
                animationDelay: `${(7 / RINGS) * i}s`,
                "--ring-scale": `${0.2 + i * 0.16}`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
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
          src="/LOGO/LOGO.png"
          alt={BRAND_NAME}
          width={320}
          height={292}
          className="mt-3 w-60 drop-shadow-[0_0_40px_rgba(245,196,81,0.25)] md:w-80"
        />

        <p className="mt-5 max-w-md text-lg text-text-1">
          Wager. Climb. Get paid. Sign up with the code and ride the tunnel.
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
            <HeroStat label="Paid out all-time" value={formatMoneyCompact(stats!.paidOut)} />
            <HeroStat label="Players on the board" value={stats!.players.toLocaleString()} />
            <HeroStat label="Giveaways run" value={stats!.giveaways.toLocaleString()} />
          </div>
        )}
      </div>
    </section>
  );
}
