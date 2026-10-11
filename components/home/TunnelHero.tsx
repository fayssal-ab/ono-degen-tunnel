import { ButtonLink } from "@/components/ui/Button";
import { CopyChip } from "@/components/ui/CopyChip";
import { Icon } from "@/components/ui/Icon";
import { BRAND_NAME, STREAMER, KICK_URL, CASINO_CODE } from "@/lib/constants";

// CSS/3D tunnel hero: concentric rounded-square rings flying toward the viewer
// (prompt §3.1). Pure CSS — no WebGL dependency — so it's light and the
// headline is the LCP. Reduced-motion shows a static ring field (globals.css).
const RINGS = 9;

export function TunnelHero() {
  return (
    <section className="surface relative isolate overflow-hidden px-6 py-20 md:px-14 md:py-28">
      {/* animated rings */}
      <div className="tunnel-stage pointer-events-none absolute inset-0" aria-hidden>
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
      {/* plasma vignette + grain-friendly darkening at the edges */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 55% at 50% 45%, transparent 40%, var(--color-bg-1) 100%)" }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <span className="label inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-volt" />
          {STREAMER}&rsquo;s rewards tunnel
        </span>
        <h1 className="font-bang text-gradient-gold mt-4 text-balance text-5xl tracking-wide md:text-[clamp(3.5rem,8vw,7rem)]">
          {BRAND_NAME}
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg text-text-1">
          Wager. Climb. Get paid. Sign up with code and ride the tunnel — leaderboards, races,
          giveaways and the prize at the end of the light.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="text-sm text-text-2">Code</span>
          <CopyChip value={CASINO_CODE} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/#play" variant="gold" size="lg">
            <Icon name="Zap" className="h-4 w-4" /> Sign up &amp; play
          </ButtonLink>
          <a
            href={KICK_URL}
            target="_blank"
            rel="noreferrer"
            className="press inline-flex h-13 items-center gap-2 rounded-xl border border-line-strong px-7 text-base text-text-0 hover:border-volt hover:text-volt"
          >
            <Icon name="Radio" className="h-4 w-4" /> Watch live
          </a>
        </div>
      </div>
    </section>
  );
}
