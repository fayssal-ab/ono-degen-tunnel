// Generates proper designed SVG art (not placeholders) for the image slots:
// VIP tier medallions, empty-state illustrations, podium discs, stream cards.
// Run: node scripts/gen-art.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets");
const write = (p, svg) => {
  const full = join(OUT, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, svg.trim() + "\n");
};

const BG = "#0B0B10";

function star(cx, cy, outer, inner, points = 5, rot = -90) {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i + (rot * Math.PI) / 180;
    d += (i === 0 ? "M" : "L") + (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * Math.sin(a)).toFixed(1) + " ";
  }
  return d + "Z";
}

// ── VIP medallions (256×256) ──
const TIERS = {
  bronze: { base: "#a66a2e", light: "#e6ad66", dark: "#5e3a16", label: "BRONZE" },
  silver: { base: "#9aa3b2", light: "#eef2f7", dark: "#596270", label: "SILVER" },
  gold: { base: "#d4a84a", light: "#f6e4a4", dark: "#7f601f", label: "GOLD" },
  platinum: { base: "#bcc8d1", light: "#f2f7fb", dark: "#6c7883", label: "PLATINUM" },
  diamond: { base: "#4fc5e0", light: "#d0f4ff", dark: "#1f6d80", label: "DIAMOND" },
  obsidian: { base: "#45456a", light: "#7d7da6", dark: "#191930", label: "OBSIDIAN" },
  "tunnel-god": { base: "#d4a84a", light: "#f6e4a4", dark: "#7b67ff", label: "TUNNEL GOD", special: true },
};

function medallion(slug, t) {
  const hex = "M128 26 L214 75 V173 L128 222 L42 173 V75 Z";
  const innerHex = "M128 50 L192 87 V161 L128 198 L64 161 V87 Z";
  const grad = t.special
    ? `<radialGradient id="g" cx="50%" cy="36%" r="70%"><stop offset="0%" stop-color="${t.light}"/><stop offset="50%" stop-color="${t.base}"/><stop offset="100%" stop-color="${t.dark}"/></radialGradient>`
    : `<radialGradient id="g" cx="50%" cy="34%" r="72%"><stop offset="0%" stop-color="${t.light}"/><stop offset="55%" stop-color="${t.base}"/><stop offset="100%" stop-color="${t.dark}"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="VIP ${t.label}">
  <defs>
    ${grad}
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".55"/><stop offset="42%" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="256" height="256" fill="${BG}"/>
  <circle cx="128" cy="118" r="96" fill="${t.base}" opacity="0.16"/>
  <path d="${hex}" fill="url(#g)" stroke="${t.light}" stroke-width="3"/>
  <path d="${hex}" fill="url(#shine)"/>
  <path d="${innerHex}" fill="none" stroke="${t.dark}" stroke-width="2" opacity="0.55"/>
  <path d="${star(128, 116, 40, 17)}" fill="#fff" opacity="0.92"/>
  <path d="${star(128, 116, 40, 17)}" fill="none" stroke="${t.dark}" stroke-width="1.5" opacity="0.4"/>
  <text x="128" y="246" text-anchor="middle" font-family="'Segoe UI',system-ui,sans-serif" font-size="17" font-weight="800" letter-spacing="1.5" fill="${t.light}">${t.label}</text>
</svg>`;
}
for (const [slug, t] of Object.entries(TIERS)) write(`vip/tier-${slug}.svg`, medallion(slug, t));

// ── Empty-state illustrations (400×300) ──
function emptyCard(label, inner, accent = "#d9b46a") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" role="img" aria-label="${label}">
  <rect width="400" height="300" fill="${BG}"/>
  <ellipse cx="200" cy="150" rx="150" ry="110" fill="${accent}" opacity="0.07"/>
  <g fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    ${inner}
  </g>
</svg>`;
}
// trophy
write("empty/leaderboard-soon.svg", emptyCard("Leaderboard soon", `
    <path d="M150 95 H250 V140 a50 50 0 0 1 -100 0 Z"/>
    <path d="M150 105 H120 a22 22 0 0 0 44 10"/>
    <path d="M250 105 H280 a22 22 0 0 1 -44 10"/>
    <path d="M185 190 h30 v18 h-30 Z"/>
    <path d="M165 208 h70"/>
    <circle cx="200" cy="120" r="4" fill="${"#d9b46a"}" stroke="none"/>
  `));
// gift
write("empty/no-giveaway.svg", emptyCard("No giveaway", `
    <rect x="140" y="140" width="120" height="78" rx="8"/>
    <rect x="130" y="118" width="140" height="26" rx="6"/>
    <path d="M200 118 V218"/>
    <ellipse cx="182" cy="108" rx="18" ry="13"/>
    <ellipse cx="218" cy="108" rx="18" ry="13"/>
  `, "#7cff4f"));
// dice
write("empty/no-hunt.svg", emptyCard("No hunt", `
    <rect x="120" y="120" width="80" height="80" rx="14"/>
    <rect x="205" y="150" width="78" height="78" rx="14" transform="rotate(12 244 189)"/>
    <circle cx="145" cy="145" r="5" fill="#d9b46a" stroke="none"/>
    <circle cx="175" cy="175" r="5" fill="#d9b46a" stroke="none"/>
    <circle cx="160" cy="160" r="5" fill="#d9b46a" stroke="none"/>
  `));

// ── Podium discs (512×512) — decorative metal backdrop (number is overlaid in UI) ──
const PODIUM = {
  1: { base: "#d4a84a", light: "#f6e4a4", dark: "#7f601f" },
  2: { base: "#9aa3b2", light: "#eef2f7", dark: "#596270" },
  3: { base: "#a66a2e", light: "#e6ad66", dark: "#5e3a16" },
};
for (const [rank, t] of Object.entries(PODIUM)) {
  write(`podium/rank-${rank}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Rank ${rank}">
  <defs><radialGradient id="g" cx="50%" cy="38%" r="65%"><stop offset="0%" stop-color="${t.light}"/><stop offset="55%" stop-color="${t.base}"/><stop offset="100%" stop-color="${t.dark}"/></radialGradient></defs>
  <rect width="512" height="512" fill="${BG}"/>
  <circle cx="256" cy="256" r="180" fill="url(#g)"/>
  <circle cx="256" cy="256" r="180" fill="none" stroke="${t.light}" stroke-width="6"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="${t.dark}" stroke-width="3" opacity="0.5"/>
  <path d="${star(256, 150, 26, 11)}" fill="#fff" opacity="0.85"/>
</svg>`);
}

// ── Stream offline (1600×900) ──
write("stream/offline.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="Offline">
  <defs><radialGradient id="g" cx="50%" cy="42%" r="70%"><stop offset="0%" stop-color="#15151f"/><stop offset="100%" stop-color="#050507"/></radialGradient></defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <circle cx="800" cy="400" r="240" fill="#7cff4f" opacity="0.05"/>
  <g fill="none" stroke="#6c6a78" stroke-width="10" stroke-linecap="round">
    <path d="M700 430 a140 140 0 0 1 200 0"/>
    <path d="M740 470 a84 84 0 0 1 120 0"/>
    <path d="M782 510 a26 26 0 0 1 36 0"/>
  </g>
  <line x1="690" y1="300" x2="910" y2="520" stroke="#ff4d5e" stroke-width="12" stroke-linecap="round"/>
  <text x="800" y="620" text-anchor="middle" font-family="'Segoe UI',system-ui,sans-serif" font-size="56" font-weight="800" letter-spacing="3" fill="#f4f1ea">OFFLINE</text>
  <text x="800" y="662" text-anchor="middle" font-family="'Segoe UI',system-ui,sans-serif" font-size="24" letter-spacing="2" fill="#6c6a78">Follow on Kick to catch the next stream</text>
</svg>`);

// ── Stream clips (640×360) — gradient tiles with a play glyph ──
for (let i = 1; i <= 6; i++) {
  const hue = [["#d4a84a", "#7f601f"], ["#7cff4f", "#1f6d80"], ["#7b67ff", "#2a2252"], ["#2ee6c8", "#155", "#15635a"], ["#d4a84a", "#7b67ff"], ["#9aa3b2", "#2a2f38"]][i - 1];
  write(`stream/clip-${i}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="Clip ${i}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${hue[0]}" stop-opacity="0.35"/><stop offset="100%" stop-color="${hue[1]}" stop-opacity="0.15"/></linearGradient></defs>
  <rect width="640" height="360" fill="${BG}"/>
  <rect width="640" height="360" fill="url(#g)"/>
  <circle cx="320" cy="180" r="46" fill="#000" opacity="0.35"/>
  <circle cx="320" cy="180" r="46" fill="none" stroke="#f4f1ea" stroke-width="3"/>
  <path d="M308 158 L350 180 L308 202 Z" fill="#f4f1ea"/>
</svg>`);
}

console.log("Generated VIP medallions, empty states, podium discs, stream offline + clips.");
