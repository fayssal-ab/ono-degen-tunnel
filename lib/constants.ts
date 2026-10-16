// Brand + external links. Used everywhere — never hard-code these inline.
// (prompt §0)

export const BRAND_NAME = "ONO DEGEN TUNNEL";
export const STREAMER = "ONO";
export const KICK_CHANNEL = "onoefg";
export const KICK_URL = "https://kick.com/onoefg";
export const KICK_PLAYER_URL = "https://player.kick.com/onoefg";
export const KICK_CHAT_URL = "https://kick.com/onoefg/chatroom";
export const DISCORD_URL = "https://discord.gg/x5gv6vwNvw";

// Partner casino — viewers sign up on Stake with ONO's code and play there.
// All NEXT_PUBLIC (branding/links only, never a secret).
export const CASINO_CODE = process.env.NEXT_PUBLIC_STAKE_CODE ?? process.env.NEXT_PUBLIC_CASINO_CODE ?? "ONO";

export interface Casino {
  name: string;
  code: string;
  url: string;
  tagline: string;
  accent: "gold" | "volt";
}

export const CASINOS: Casino[] = [
  {
    name: "Stake",
    code: CASINO_CODE,
    url: process.env.NEXT_PUBLIC_STAKE_URL ?? "https://stake.com/?c=ONO",
    tagline: "The original crypto casino",
    accent: "gold",
  },
];

/** The casino the leaderboard / races are about (Stake). */
export const CASINO_NAME = CASINOS[0].name;
export const CASINO_URL = CASINOS[0].url;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Responsible-gambling + disclosure (footer, prompt §4).
export const RG_LINKS = [
  { label: "BeGambleAware", href: "https://www.begambleaware.org" },
  { label: "GamblingTherapy", href: "https://www.gamblingtherapy.org" },
] as const;

export const AFFILIATE_DISCLOSURE =
  `${STREAMER} earns commission when you sign up and play at our partner casinos ` +
  `(${CASINOS.map((c) => c.name).join(" & ")}) with code ${CASINO_CODE}. ${BRAND_NAME} ` +
  `is not a casino, takes no deposits, and runs no real-money games on this site.`;

// Periods reset at 01:49 UTC (pattern ported from JBALLIN — the casino API is
// date-only, this is only the instant used for the countdown / "has ended").
export const PERIOD_RESET_TIME_UTC = "01:49:00";
