// Single source of truth for every image path (prompt §8). To swap an asset,
// drop the final file in public/assets/… and change only its value here.
// Placeholders are .svg (see ASSETS.md); finals may be .png/.webp — update the
// extension here when you replace one.

const A = "/assets";

export const ASSETS = {
  brand: {
    logo: `${A}/brand/logo.svg`,
    mark: `${A}/brand/logo-mark.svg`,
    wordmark: `${A}/brand/wordmark.svg`,
    favicon: `${A}/brand/favicon.svg`,
    ogFallback: `${A}/brand/og-image.svg`,
  },
  hero: {
    tunnelFallback: `${A}/hero/tunnel-fallback.svg`,
    onoCutout: `${A}/hero/ono-cutout.svg`,
  },
  casino: {
    logo: `${A}/casino/casino-logo.svg`,
    banner: `${A}/casino/casino-banner.svg`,
  },
  podium: {
    1: `${A}/podium/rank-1.svg`,
    2: `${A}/podium/rank-2.svg`,
    3: `${A}/podium/rank-3.svg`,
  } as Record<number, string>,
  vip: {
    bronze: `${A}/vip/tier-bronze.svg`,
    silver: `${A}/vip/tier-silver.svg`,
    gold: `${A}/vip/tier-gold.svg`,
    platinum: `${A}/vip/tier-platinum.svg`,
    diamond: `${A}/vip/tier-diamond.svg`,
    obsidian: `${A}/vip/tier-obsidian.svg`,
    tunnelGod: `${A}/vip/tier-tunnel-god.svg`,
  } as Record<string, string>,
  cases: {
    daily: `${A}/cases/daily-case.svg`,
    item: (n: number) => `${A}/cases/items/item-${n}.svg`,
  },
  store: {
    item: (n: number) => `${A}/store/item-${n}.svg`,
  },
  stream: {
    offline: `${A}/stream/offline.svg`,
    clip: (n: number) => `${A}/stream/clip-${n}.svg`,
  },
  empty: {
    leaderboardSoon: `${A}/empty/leaderboard-soon.svg`,
    noGiveaway: `${A}/empty/no-giveaway.svg`,
    noHunt: `${A}/empty/no-hunt.svg`,
  },
  overlay: {
    giveawayFrame: `${A}/overlay/giveaway-frame.svg`,
  },
} as const;
