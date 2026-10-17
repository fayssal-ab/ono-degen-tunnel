import Link from "next/link";
import { getActivePeriod } from "@/lib/periods";
import { getActiveRaces } from "@/lib/races";
import { getFeaturedRound, countRoundGuesses } from "@/lib/guessBalance";
import { getChallenges } from "@/lib/challenges";
import { getFeaturedKo } from "@/lib/knockout";
import { getPublicAwards } from "@/lib/prizes";
import { formatMoney } from "@/lib/money";
import { PERIOD_RESET_TIME_UTC } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";
import { Countdown } from "@/components/ui/Countdown";
import { formatMoneyCompact } from "@/lib/money";

// Home: what's on right now (each card in its section's colours, live dot,
// one number that matters) and a ticker of recent wins. Every source is read
// on its own; one failing never hides the others.

interface LiveCard { href: string; tone: [string, string]; icon: string; kicker: string; value: string; line: string; until?: string; live: boolean }

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try { return await p; } catch { return null; }
}
const iso = (db: string) => `${db.replace(" ", "T")}Z`;

async function liveCards(): Promise<LiveCard[]> {
  const [period, races, round, challenges, ko] = await Promise.all([
    safe(getActivePeriod()), safe(getActiveRaces()), safe(getFeaturedRound()), safe(getChallenges()), safe(getFeaturedKo()),
  ]);
  const cards: LiveCard[] = [];
  if (period) {
    cards.push({ href: "/leaderboard", tone: ["#f5c451", "#c08a2a"], icon: "Trophy", kicker: period.title || "Leaderboard", live: true,
      value: formatMoneyCompact(period.prize_pool), line: "monthly prize pool", until: `${period.end_at}T${PERIOD_RESET_TIME_UTC}Z` });
  }
  const race = races?.find((r) => r.status === "live") ?? races?.find((r) => r.status === "upcoming");
  if (race) {
    cards.push({ href: "/races", tone: ["#ff8a3d", "#b4441c"], icon: "Flag", kicker: race.name, live: race.status === "live",
      value: formatMoneyCompact(race.prize_pool), line: race.status === "live" ? "race pool · live" : "race starting soon",
      until: iso(race.status === "live" ? race.end_at : race.start_at) });
  }
  if (round && round.status === "open") {
    const guesses = await safe(countRoundGuesses(round.id));
    cards.push({ href: "/guess-the-balance", tone: ["#22d3ee", "#0ea5e9"], icon: "Gauge", kicker: round.title || "Guess the Balance", live: true,
      value: round.prize || "Guess", line: `${guesses ?? 0} guesses in · type !gb`, until: round.deadline_at ? iso(round.deadline_at) : undefined });
  }
  const open = challenges?.filter((c) => c.status === "open") ?? [];
  if (open.length) {
    const top = open.reduce((a, b) => (Number(b.required_multiplier) > Number(a.required_multiplier) ? b : a));
    cards.push({ href: "/challenges", tone: ["#ff3d9a", "#e879f9"], icon: "Target", kicker: `${open.length} slot challenge${open.length > 1 ? "s" : ""}`, live: true,
      value: `${Number(top.required_multiplier)}x`, line: `${top.slot_name} · ${top.prize}` });
  }
  if (ko && (ko.status === "open" || ko.status === "closed")) {
    cards.push({ href: "/tournaments", tone: ["#a78bfa", "#e879f9"], icon: "Swords", kicker: ko.title, live: true,
      value: ko.status === "open" ? "!join" : "Live", line: ko.status === "open" ? "registration open — type !join <slot>" : "bracket in progress" });
  }
  return cards;
}

export async function LiveNow() {
  const cards = await liveCards();
  if (!cards.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-volt" /></span>
        <p className="font-bang text-2xl tracking-wide md:text-3xl">Live now</p>
      </div>
      <div className={`grid gap-3 sm:grid-cols-2 ${cards.length >= 3 ? "lg:grid-cols-3" : ""} ${cards.length >= 4 ? "xl:grid-cols-4" : ""}`}>
        {cards.map((c) => (
          <Link key={c.href} href={c.href}
            className="live-card group relative overflow-hidden rounded-[22px] border p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-1"
            style={{ borderColor: `color-mix(in srgb, ${c.tone[0]} 35%, transparent)`, background: `linear-gradient(150deg, color-mix(in srgb, ${c.tone[0]} 16%, var(--color-bg-1)), var(--color-bg-1) 70%)`,
              ["--glow" as string]: c.tone[0] }}>
            <Icon name={c.icon} strokeWidth={1.3} aria-hidden className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 rotate-[-12deg] opacity-[0.12] transition-transform duration-500 group-hover:rotate-0 group-hover:scale-110" style={{ color: c.tone[0] }} />
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: c.tone[0] }}>
              {c.live && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: c.tone[0] }} />}
              <span className="truncate">{c.kicker}</span>
            </p>
            <p className="font-bang mt-3 truncate text-[clamp(1.7rem,2.6vw,2.5rem)] leading-none tracking-wide text-text-0">{c.value}</p>
            <p className="mt-1 truncate text-sm text-text-1">{c.line}</p>
            {c.until && <div className="mt-3 text-xs text-text-2">{c.href === "/races" && !c.live ? "starts" : "ends"} <Countdown target={c.until} compact /></div>}
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold transition-transform group-hover:translate-x-1" style={{ color: c.tone[0] }}>
              Open <Icon name="ArrowRight" className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Endless band of the latest paid prizes. */
export async function WinsTicker() {
  const data = await safe(getPublicAwards(16));
  const wins = data?.awards ?? [];
  if (wins.length < 3) return null;
  const SOURCE: Record<string, string> = { tournament: "Tournament", giveaway: "Giveaway", race: "Race", leaderboard: "Leaderboard", gb: "Guess the Balance", challenge: "Challenge", manual: "Stream" };
  const row = (copy: number) => wins.map((w) => (
    <span key={`${copy}-${w.id}`} aria-hidden={copy > 0 || undefined} className="mx-3 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-bg-1/80 px-4 py-2 text-sm">
      <Icon name="Trophy" className="h-4 w-4 text-gold" />
      <span className="font-mono font-semibold text-text-0">{w.winner}</span>
      <span className="text-text-2">won</span>
      <span className="font-mono font-bold text-gold">{w.amount != null ? formatMoney(w.amount) : w.prize_label}</span>
      <span className="text-text-2">· {SOURCE[w.source] ?? w.source}</span>
    </span>
  ));
  return (
    <div className="marquee relative -mx-4 overflow-hidden py-1 md:-mx-6 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]" aria-label="Recent wins">
      <div className="marquee-track">{row(0)}{row(1)}</div>
    </div>
  );
}
