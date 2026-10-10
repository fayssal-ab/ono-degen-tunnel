import type { Metadata } from "next";
import { STREAMER, CASINO_CODE } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Accordion } from "@/components/ui/Accordion";

export const metadata: Metadata = { title: "FAQ", description: "Common questions about the tunnel." };

const FAQ = [
  { q: "Is this a casino? Can I deposit money here?", a: `No. ${STREAMER}'s site takes no money and runs no real-money games. You play at the partner casinos; this site is the leaderboard, giveaways and rewards hub.` },
  { q: "How do I get my wagers to count?", a: `Sign up at a partner casino with code ${CASINO_CODE}. That links your play to ${STREAMER}. Wagers then pull in automatically every ~10 minutes once a board is live.` },
  { q: "Why is my casino balance different from the board?", a: "Some casinos report a weighted wager based on game house-edge, so slots count more than low-edge games. See the Rules page for a worked example." },
  { q: "When does the leaderboard reset?", a: "Boards run in seasons (usually monthly). The countdown on the leaderboard shows the exact reset time in your timezone. When no board is live you'll see a coming-soon notice." },
  { q: "How do giveaways work?", a: "Most run live on stream — you enter by typing the keyword in Kick chat while the giveaway is open. Winners are drawn live and posted on the Giveaways page." },
  { q: "What is Guess the Balance?", a: "During a bonus hunt you type !gb <amount> in chat to guess the final balance. Closest guess when the hunt finishes wins the prize. One guess per person — your latest counts." },
  { q: "How do I claim a prize or VIP perk?", a: "Link your casino username, then message a mod in Discord. Leaderboard prizes and VIP rewards are paid out by ONO directly." },
  { q: "Do I need an account on this site?", a: "No accounts here. Everything is public — just sign up at the casino with the code and compete." },
];

export default function FaqPage() {
  return (
    <div className="space-y-8">
      <PageHeader kicker="Questions" title="FAQ" lead="Everything people usually ask, in one place." />
      <Accordion items={FAQ} />
    </div>
  );
}
