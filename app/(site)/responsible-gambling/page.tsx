import type { Metadata } from "next";
import { RG_LINKS } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Responsible Gambling", description: "Play for fun. Know the signs. Get help." };

const SIGNS = [
  "Betting more than you can afford to lose",
  "Chasing losses to win them back",
  "Gambling to escape stress or low mood",
  "Hiding how much you play from people close to you",
  "Borrowing money or selling things to gamble",
];

export default function ResponsibleGamblingPage() {
  return (
    <div className="space-y-6">
      <PageHeader kicker="Stay in control" title="Responsible Gambling" lead="This is entertainment, not income. If it stops being fun, step away — and if you need help, it's there." />

      <section className="surface p-6">
        <h2 className="text-lg">A few ground rules</h2>
        <ul className="mt-3 space-y-2 text-sm text-text-1">
          {["Only play with money you can afford to lose.", "Set a budget and a time limit before you start.", "Never chase losses.", "Don't gamble under the influence or to cope with stress.", "Take regular breaks — use deposit and loss limits at the casino."].map((t) => (
            <li key={t} className="flex gap-2">
              <Icon name="Check" className="mt-0.5 h-4 w-4 shrink-0 text-volt" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="surface p-6">
        <h2 className="text-lg">Warning signs</h2>
        <ul className="mt-3 grid gap-2 text-sm text-text-1 sm:grid-cols-2">
          {SIGNS.map((s) => (
            <li key={s} className="flex gap-2">
              <Icon name="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              {s}
            </li>
          ))}
        </ul>
      </section>

      <section className="surface p-6">
        <h2 className="text-lg">Get help</h2>
        <p className="mt-2 text-sm text-text-1">Free, confidential support is available 24/7:</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {RG_LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="press inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-5 text-sm hover:border-gold hover:text-gold">
              <Icon name="ExternalLink" className="h-4 w-4" /> {l.label}
            </a>
          ))}
        </div>
        <p className="mt-4 text-xs text-text-2">18+ only. Gambling involves risk. Know your limits.</p>
      </section>
    </div>
  );
}
