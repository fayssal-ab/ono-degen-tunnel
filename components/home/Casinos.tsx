import { CASINOS, CASINO_CODE } from "@/lib/constants";
import { CopyChip } from "@/components/ui/CopyChip";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { SectionHeading } from "@/components/ui/Badge";

type CasinoBrand = "stake" | "rainbet";

// Partner-casino sign-up cards (Rainbet + Stake). Anchor target for the "Sign
// up & play" CTA (#play). This is where viewers leave to register with the code.
export function Casinos() {
  return (
    <section id="play" className="scroll-mt-24">
      <SectionHeading kicker="Step one" title="Sign up & play with the code" />
      <div className="grid gap-4 md:grid-cols-2">
        {CASINOS.map((c) => {
          const accent = c.accent === "gold" ? "text-gold" : "text-volt";
          const border = c.accent === "gold" ? "hover:border-gold" : "hover:border-volt";
          return (
            <a
              key={c.name}
              href={c.url}
              target="_blank"
              rel="noreferrer nofollow"
              className={`surface gold-border press group relative flex flex-col justify-between overflow-hidden p-6 transition-colors ${border}`}
            >
              <div className="tunnel-grid absolute inset-0 opacity-40" aria-hidden />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-3">
                    <BrandIcon brand={c.name.toLowerCase() as CasinoBrand} className="h-10 w-10 shrink-0" />
                    <span className={`font-display text-2xl font-bold ${accent}`}>{c.name}</span>
                  </span>
                  <Icon name="ArrowUpRight" className="h-5 w-5 text-text-2 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <p className="mt-2 text-sm text-text-1">{c.tagline}</p>
              </div>
              <div className="relative mt-8 flex items-center gap-3">
                <span className="text-sm text-text-2">Use code</span>
                <CopyChip value={c.code || CASINO_CODE} />
              </div>
            </a>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-text-2">
        18+ only. {CASINOS.map((c) => c.name).join(" & ")} are third-party casinos — play responsibly.
      </p>
    </section>
  );
}
