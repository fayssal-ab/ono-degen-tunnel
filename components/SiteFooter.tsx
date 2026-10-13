import Link from "next/link";
import {
  BRAND_NAME,
  KICK_URL,
  DISCORD_URL,
  RG_LINKS,
  AFFILIATE_DISCLOSURE,
  CASINOS,
  CASINO_CODE,
} from "@/lib/constants";
import { getHiddenHrefs } from "@/lib/pages";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";

const COLUMNS = [
  {
    title: "Compete",
    links: [
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "Races", href: "/races" },
      { label: "Tournaments", href: "/tournaments" },
    ],
  },
  {
    title: "Rewards",
    links: [
      { label: "VIP Club", href: "/vip" },
      { label: "Giveaways", href: "/giveaways" },
      { label: "Hall of Fame", href: "/hall-of-fame" },
    ],
  },
  {
    title: "Info",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Provably Fair", href: "/verify" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Responsible Gambling", href: "/responsible-gambling" },
    ],
  },
];

export async function SiteFooter() {
  const hidden = new Set(await getHiddenHrefs());
  const columns = COLUMNS.map((col) => ({
    ...col,
    links: col.links.filter((l) => !hidden.has(l.href)),
  })).filter((col) => col.links.length > 0);

  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line bg-bg-1">
      {/* giant faded brand watermark */}
      <span aria-hidden className="watermark watermark-cyan pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-[0.06]">
        {BRAND_NAME}
      </span>

      <div className="relative mx-auto w-full max-w-[var(--max-content)] px-4 py-14 md:px-6">
        {/* CTA strip */}
        <div className="surface gold-border flex flex-col items-center gap-5 p-7 text-center md:flex-row md:justify-between md:p-9 md:text-left">
          <div>
            <h2 className="font-bang text-gradient-gold text-2xl tracking-wide md:text-4xl">Ride the tunnel</h2>
            <p className="mt-1 text-sm text-text-1">
              Sign up with code <span className="font-mono font-semibold text-gold">{CASINO_CODE}</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {CASINOS.map((c) => (
              <a
                key={c.name}
                href={c.url}
                target="_blank"
                rel="noreferrer nofollow"
                className="press inline-flex h-11 items-center gap-2 rounded-xl bg-gold pl-2 pr-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi"
              >
                <BrandIcon brand={c.name.toLowerCase() as "stake" | "rainbet"} className="h-7 w-7 shrink-0" />
                Play at {c.name}
              </a>
            ))}
            <a href={KICK_URL} target="_blank" rel="noreferrer" aria-label="Kick" className="press grid h-11 w-11 place-items-center rounded-xl border border-line text-text-1 transition-colors hover:border-volt hover:text-volt hover:shadow-[0_0_22px_-6px_var(--color-volt)]">
              <BrandIcon brand="kick" className="h-5 w-5" />
            </a>
            <a href={DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Discord" className="press grid h-11 w-11 place-items-center rounded-xl border border-line text-text-1 transition-colors hover:border-plasma hover:text-plasma hover:shadow-[0_0_22px_-6px_var(--color-plasma)]">
              <BrandIcon brand="discord" className="h-5 w-5" />
            </a>
          </div>
        </div>

        {/* columns */}
        <div className="mt-12 grid gap-8 sm:grid-cols-2 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <p className="font-bang text-lg tracking-wide">{BRAND_NAME}</p>
            <p className="mt-2 max-w-xs text-sm text-text-2">Wager. Climb. Get paid.</p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="label pb-3">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-text-1 transition-colors hover:text-text-0">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* compliance (required) */}
        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-8">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-gold font-mono text-xs font-bold text-gold">18+</span>
            <p className="max-w-3xl text-xs leading-relaxed text-text-2">{AFFILIATE_DISCLOSURE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-2">
            <span>Gamble responsibly:</span>
            {RG_LINKS.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-text-0">
                {l.label}
              </a>
            ))}
            <a href="https://sharkz.gg" target="_blank" rel="noopener" className="underline decoration-line-strong underline-offset-2 hover:text-text-0">
              Slot data via sharkz.gg
            </a>
            <span className="ml-auto inline-flex items-center gap-1.5">
              <Icon name="Lock" className="h-3 w-3" /> © {new Date().getFullYear()} {BRAND_NAME}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
