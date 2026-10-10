// Generates branded SVG placeholders for every asset the site needs, plus
// ASSETS.md. Run: node scripts/gen-placeholders.mjs
// Placeholders are real SVGs (render in-browser). The designer replaces each
// with the final png/webp named in ASSETS.md and updates lib/assets.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "assets");

// [path under public/assets, W, H, label, finalFormat, where it appears, art note]
const MANIFEST = [
  ["brand/logo.svg", 320, 80, "LOGO — horizontal", "svg", "sidebar / header", "Wordmark + mark lockup, gold on dark."],
  ["brand/logo-mark.svg", 128, 128, "MARK — square", "svg", "favicon source / collapsed rail", "Concentric rounded-square tunnel rings."],
  ["brand/wordmark.svg", 480, 96, "WORDMARK", "svg", "hero / footer", "ONO DEGEN TUNNEL in Unbounded caps."],
  ["brand/favicon.svg", 512, 512, "FAVICON 512", "png", "browser tab", "Mark on bg-0, safe margins."],
  ["brand/og-image.svg", 1200, 630, "OG 1200×630", "png", "social share (static fallback)", "Dynamic /og route overrides this with live #1 + prize."],
  ["hero/tunnel-fallback.svg", 1920, 1080, "HERO FALLBACK 1920×1080", "webp", "reduced-motion / no-WebGL hero", "Still frame of the light tunnel, gold+plasma."],
  ["hero/ono-cutout.svg", 900, 1100, "ONO CUTOUT 900×1100", "png", "hero foreground", "Transparent PNG streamer cutout, rim light."],
  ["casino/casino-logo.svg", 320, 120, "CASINO LOGO", "svg", "sign-up CTAs / rules", "Swapped when partner casino is chosen."],
  ["casino/casino-banner.svg", 1600, 500, "CASINO BANNER 1600×500", "webp", "sign-up block", "Partner banner; dark, gold accents."],
  ["podium/rank-1.svg", 512, 512, "RANK 1", "png", "leaderboard podium", "Gold crown/plate."],
  ["podium/rank-2.svg", 512, 512, "RANK 2", "png", "leaderboard podium", "Silver plate."],
  ["podium/rank-3.svg", 512, 512, "RANK 3", "png", "leaderboard podium", "Bronze plate."],
  ["vip/tier-bronze.svg", 256, 256, "VIP BRONZE", "png", "VIP ladder", "Tier badge, bronze."],
  ["vip/tier-silver.svg", 256, 256, "VIP SILVER", "png", "VIP ladder", "Tier badge, silver."],
  ["vip/tier-gold.svg", 256, 256, "VIP GOLD", "png", "VIP ladder", "Tier badge, gold."],
  ["vip/tier-platinum.svg", 256, 256, "VIP PLATINUM", "png", "VIP ladder", "Tier badge, platinum."],
  ["vip/tier-diamond.svg", 256, 256, "VIP DIAMOND", "png", "VIP ladder", "Tier badge, diamond."],
  ["vip/tier-obsidian.svg", 256, 256, "VIP OBSIDIAN", "png", "VIP ladder", "Tier badge, obsidian."],
  ["vip/tier-tunnel-god.svg", 256, 256, "VIP TUNNEL GOD", "png", "VIP ladder", "Top tier, gold+plasma glow."],
  ["cases/daily-case.svg", 600, 600, "DAILY CASE 600", "png", "/case", "Closed case/crate, gold seams."],
  ...Array.from({ length: 8 }, (_, i) => [
    `cases/items/item-${i + 1}.svg`, 256, 256, `CASE ITEM ${i + 1}`, "png", "/case reel", "Points-reward chip/token art.",
  ]),
  ...Array.from({ length: 6 }, (_, i) => [
    `store/item-${i + 1}.svg`, 600, 600, `STORE ITEM ${i + 1}`, "webp", "/store grid", "Redeemable item product shot.",
  ]),
  ["stream/offline.svg", 1600, 900, "STREAM OFFLINE 1600×900", "webp", "/stream + home when offline", "Cinematic offline card."],
  ...Array.from({ length: 6 }, (_, i) => [
    `stream/clip-${i + 1}.svg`, 640, 360, `CLIP ${i + 1}`, "webp", "/stream clips grid", "16:9 clip thumbnail.",
  ]),
  ["empty/leaderboard-soon.svg", 400, 300, "EMPTY — LB SOON", "svg", "leaderboard coming-soon state", "Line-art empty state."],
  ["empty/no-giveaway.svg", 400, 300, "EMPTY — NO GIVEAWAY", "svg", "giveaways empty state", "Line-art empty state."],
  ["empty/no-hunt.svg", 400, 300, "EMPTY — NO HUNT", "svg", "bonus hunt empty state", "Line-art empty state."],
  ["overlay/giveaway-frame.svg", 1920, 1080, "OVERLAY FRAME 1920×1080", "png", "OBS /overlay/giveaway", "Transparent PNG frame around the roll."],
];

function svg(w, h, label) {
  const unit = Math.min(w, h);
  const fs = Math.max(11, Math.round(unit / 16));
  const sub = Math.max(9, Math.round(fs * 0.62));
  const cx = w / 2;
  const cy = h / 2;
  // concentric rounded-square tunnel rings as the brand motif
  const rings = [0.82, 0.6, 0.4, 0.22]
    .map((s, i) => {
      const rw = w * s;
      const rh = h * s;
      return `<rect x="${(w - rw) / 2}" y="${(h - rh) / 2}" width="${rw}" height="${rh}" rx="${Math.min(rw, rh) * 0.14}" fill="none" stroke="#D9B46A" stroke-opacity="${0.16 - i * 0.03}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label} placeholder">
  <rect width="${w}" height="${h}" fill="#0B0B10"/>
  ${rings}
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#D9B46A" stroke-opacity="0.5"/>
  <text x="${cx}" y="${cy - sub * 0.2}" fill="#F4F1EA" font-family="monospace" font-size="${fs}" font-weight="700" text-anchor="middle" letter-spacing="1">${label}</text>
  <text x="${cx}" y="${cy + fs}" fill="#6C6A78" font-family="monospace" font-size="${sub}" text-anchor="middle" letter-spacing="1">${w}×${h} · placeholder</text>
</svg>`;
}

let rows = "| Logical key | Path | Final format | Size | Appears | Art direction |\n|---|---|---|---|---|---|\n";
for (const [path, w, h, label, fmt, where, note] of MANIFEST) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, svg(w, h, label));
  const key = path.replace(/\.svg$/, "").replace(/[\/-]/g, (m) => (m === "/" ? "." : "_"));
  rows += `| \`${key}\` | \`public/assets/${path}\` | ${fmt.toUpperCase()} | ${w}×${h} | ${where} | ${note} |\n`;
}

const md = `# ASSETS

Every image on the site resolves through **one file**: [\`lib/assets.ts\`](lib/assets.ts).
Replacing an asset = drop the final file in \`public/assets/…\` and point its
line in \`lib/assets.ts\` at the new filename (the placeholders are \`.svg\`;
most finals are \`.png\`/\`.webp\`, so the extension changes — that one edit is
the only code change needed).

Placeholders were generated by \`scripts/gen-placeholders.mjs\` (re-run any time).
They are branded SVGs (dark bg, gold frame, concentric tunnel rings, size +
purpose printed in the middle) so they render correctly in-browser instead of
shipping an \`.svg\` disguised as a \`.png\`.

The dynamic Open Graph image is generated at runtime by the \`/og\` route
(current #1 + prize pool); \`brand/og-image\` is only the static fallback.

${rows}
`;

writeFileSync(join(ROOT, "ASSETS.md"), md);
console.log(`Wrote ${MANIFEST.length} placeholders + ASSETS.md`);
