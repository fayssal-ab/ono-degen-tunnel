import Link from "next/link";
import {
  BRAND_NAME,
  STREAMER,
  KICK_URL,
  DISCORD_URL,
  RG_LINKS,
  AFFILIATE_DISCLOSURE,
  CASINOS,
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
      { label: "Challenges", href: "/challenges" },
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
      { label: "Rules", href: "/rules" },
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
    <footer className="relative mt-24 border-t border-line bg-bg-1">
      <div className="mx-auto w-full max-w-[var(--max-content)] px-4 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <p className="font-display text-base font-bold">{BRAND_NAME}</p>
            <p className="mt-3 max-w-xs text-sm text-text-2">
              {STREAMER}&rsquo;s rewards tunnel. Wager. Climb. Get paid.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {CASINOS.map((c) => (
                <a
                  key={c.name}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="press inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-text-1 hover:border-gold hover:text-gold"
                >
                  Play at {c.name}
                </a>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <a
                href={KICK_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Kick"
                className="press grid h-10 w-10 place-items-center rounded-xl border border-line text-text-1 hover:border-volt hover:text-volt"
              >
                <BrandIcon brand="kick" className="h-5 w-5" />
              </a>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Discord"
                className="press grid h-10 w-10 place-items-center rounded-xl border border-line text-text-1 hover:border-plasma hover:text-plasma"
              >
                <BrandIcon brand="discord" className="h-5 w-5" />
              </a>
            </div>
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

        {/* compliance block — required (prompt §4) */}
        <div className="mt-12 flex flex-col gap-5 border-t border-line pt-8">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-gold font-mono text-xs font-bold text-gold">
              18+
            </span>
            <p className="max-w-3xl text-xs leading-relaxed text-text-2">{AFFILIATE_DISCLOSURE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-2">
            <span>Gamble responsibly:</span>
            {RG_LINKS.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-text-0">
                {l.label}
              </a>
            ))}
            {/* dofollow attribution required by the slot.report autocomplete key */}
            <a href="https://slot.report" target="_blank" rel="noopener" className="underline decoration-line-strong underline-offset-2 hover:text-text-0">
              Slot data by slot.report
            </a>
            <span className="ml-auto">© {new Date().getFullYear()} {BRAND_NAME}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
