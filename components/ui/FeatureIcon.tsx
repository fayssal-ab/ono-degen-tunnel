import { Icon } from "./Icon";

// Branded feature-icon system: each feature gets its own gradient badge + glow
// + lucide glyph, so VIP / Giveaway / Tournament / Race / etc. read as a set
// instead of identical gray squares. Colours stay within the ONO token palette.
type Palette = { from: string; to: string; ink: string; glow: string };

const PALETTES: Record<string, Palette> = {
  gold: { from: "#ffd97a", to: "#c08a2a", ink: "#3a2a07", glow: "var(--color-gold)" },
  volt: { from: "#6ee7b7", to: "#0b7a52", ink: "#042a1f", glow: "var(--color-volt)" },
  cyan: { from: "#8ff0ff", to: "#15a9c4", ink: "#06323b", glow: "var(--color-cyan)" },
  plasma: { from: "#c4b5fd", to: "#6d28d9", ink: "#1c1033", glow: "var(--color-plasma)" },
  magenta: { from: "#f9a8d4", to: "#a21caf", ink: "#2a0a24", glow: "var(--color-magenta)" },
  electric: { from: "#93c5fd", to: "#1d4ed8", ink: "#0a1b40", glow: "var(--color-electric)" },
};

export type FeatureColor = keyof typeof PALETTES;

// canonical icon + colour per feature (so every surface uses the same mapping)
export const FEATURE_ICONS: Record<string, { icon: string; color: FeatureColor }> = {
  "/leaderboard": { icon: "Trophy", color: "cyan" },
  "/giveaways": { icon: "Gift", color: "volt" },
  "/races": { icon: "Flag", color: "electric" },
  "/tournaments": { icon: "Swords", color: "plasma" },
  "/bonus-hunt": { icon: "Dices", color: "magenta" },
  "/guess-the-balance": { icon: "Gauge", color: "cyan" },
  "/vip": { icon: "Crown", color: "gold" },
  "/hall-of-fame": { icon: "Medal", color: "gold" },
};

export function FeatureIcon({
  icon,
  color = "cyan",
  size = "md",
  className = "",
}: {
  icon: string;
  color?: FeatureColor;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const p = PALETTES[color] ?? PALETTES.cyan;
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : size === "sm" ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl";
  const glyph = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={`relative grid shrink-0 place-items-center ${box} ${className}`}
      style={{
        background: `linear-gradient(140deg, ${p.from}, ${p.to})`,
        color: p.ink,
        boxShadow: `0 0 26px -8px ${p.glow}, inset 0 1px 0 rgba(255,255,255,.35)`,
      }}
    >
      <Icon name={icon} className={glyph} />
    </span>
  );
}
