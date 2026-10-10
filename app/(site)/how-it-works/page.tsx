import type { Metadata } from "next";
import { CASINOS, CASINO_CODE, STREAMER, DISCORD_URL } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "How it works", description: "Three steps to ride the tunnel." };

const STEPS = [
  { n: "01", icon: "UserPlus", title: "Sign up with the code", body: `Create an account at a partner casino (${CASINOS.map((c) => c.name).join(" or ")}) and enter code ${CASINO_CODE} so your play is credited to ${STREAMER}.` },
  { n: "02", icon: "Dices", title: "Play like you normally would", body: "No change to how you play. Your wagered amount is pulled in automatically every 10 minutes and pushes you up the leaderboard and races." },
  { n: "03", icon: "Trophy", title: "Climb & compete", body: "Top ranks split the prize pool when a season ends. Tournaments, bonus-hunt predictions and giveaways run live on stream on top of that." },
  { n: "04", icon: "Gift", title: "Collect", body: "Leaderboard prizes and VIP perks are paid out by ONO. Giveaways are drawn live. Link your casino username and claim in Discord." },
];

export default function HowItWorksPage() {
  return (
    <div className="space-y-10">
      <PageHeader kicker="Start here" title="How it works" lead="The whole thing in four steps. No deposits on this site — you play at the partner casinos, you compete here." />

      <div className="grid gap-4 md:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.n} className="surface flex gap-4 p-6">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-bg-3 text-gold">
              <Icon name={s.icon} className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-2">{s.n}</span>
                <h2 className="text-lg">{s.title}</h2>
              </div>
              <p className="mt-2 text-sm text-text-1">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="surface flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg">Ready?</h2>
          <p className="mt-1 text-sm text-text-1">Grab the code, sign up, and your wagers show up here within 10 minutes.</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/#play" variant="gold">Sign up &amp; play</ButtonLink>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="press inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-5 text-sm hover:border-plasma hover:text-plasma">
            <Icon name="MessageCircle" className="h-4 w-4" /> Discord
          </a>
        </div>
      </div>
    </div>
  );
}
