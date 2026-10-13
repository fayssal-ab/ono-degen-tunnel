// Single source of truth for public navigation (sidebar, mobile drawer,
// command palette all read this). Icon names are lucide-react export names.
// No user accounts / points / store — admin manages everything behind /login.

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  keywords?: string[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Compete",
    items: [
      { label: "Leaderboard", href: "/leaderboard", icon: "Trophy", keywords: ["board", "ranks", "wager"] },
      { label: "Races", href: "/races", icon: "Flag", keywords: ["sprint", "24h"] },
      { label: "Tournaments", href: "/tournaments", icon: "Swords", keywords: ["bracket", "slot battle"] },
      { label: "Challenges", href: "/challenges", icon: "Target", keywords: ["multiplier", "first to"] },
    ],
  },
  {
    title: "Watch",
    items: [
      { label: "Bonus Hunt", href: "/bonus-hunt", icon: "Dices", keywords: ["hunt", "bonuses"] },
      { label: "Guess the Balance", href: "/guess-the-balance", icon: "Gauge", keywords: ["gb", "predict"] },
      { label: "Stream", href: "/stream", icon: "Radio", keywords: ["kick", "live", "clips"] },
    ],
  },
  {
    title: "Rewards",
    items: [
      { label: "VIP Club", href: "/vip", icon: "Crown", keywords: ["tier", "ladder"] },
      { label: "Giveaways", href: "/giveaways", icon: "Gift", keywords: ["raffle", "winner"] },
      { label: "Hall of Fame", href: "/hall-of-fame", icon: "Medal", keywords: ["champions", "history"] },
      { label: "Prizes awarded", href: "/prizes", icon: "BadgeDollarSign", keywords: ["paid", "winners", "payouts"] },
    ],
  },
];

// Extra destinations the command palette can jump to beyond the sidebar.
export const EXTRA_DESTINATIONS: NavItem[] = [
  { label: "Home", href: "/", icon: "Home" },
  { label: "How it works", href: "/how-it-works", icon: "CircleHelp" },
  { label: "Rules", href: "/rules", icon: "ScrollText" },
  { label: "Provably Fair", href: "/verify", icon: "ShieldCheck", keywords: ["verify", "giveaway", "seed"] },
  { label: "FAQ", href: "/faq", icon: "MessagesSquare" },
];

export const ALL_DESTINATIONS: NavItem[] = [
  ...EXTRA_DESTINATIONS,
  ...NAV_GROUPS.flatMap((g) => g.items),
];
