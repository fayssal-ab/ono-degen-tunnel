# MASTER BUILD PROMPT — ONO DEGEN TUNNEL

> Paste this whole file into your AI coding agent (Claude Code, Cursor, etc.),
> opened at the folder `SANDMAN/ONO DEGEN TUNNEL/`. The sibling folder
> `../JBALLIN/` is a working production site you must study and reuse.

---

## 0. Your role and the mission

You are a senior full-stack engineer **and** a senior product designer who has
shipped for crypto-casino brands. You build like a studio, not like a template
generator.

Build **ONO DEGEN TUNNEL** — the official rewards hub of the Kick streamer
**ONO** (`https://kick.com/onoefg`). It is a streamer-affiliate site: viewers
sign up on a partner crypto casino with ONO's code, wager there, and compete on
ONO's site for prizes, points, giveaways and games. **The site itself never
takes real money or runs real-money gambling.** Everything gambling-flavoured on
our site (cases, wheels, predictions) runs on free, non-purchasable points only.

The feel: **luxury crypto casino × futuristic tunnel** — the polish and density
of **Stake.com** and **Rainbet.com**, pushed into a darker, more cinematic,
more premium direction. It must look like a high-budget brand built by humans,
**never** like an AI-generated landing page.

Links (put these in one constants file, use them everywhere):

```ts
export const BRAND_NAME   = "ONO DEGEN TUNNEL";
export const STREAMER     = "ONO";
export const KICK_CHANNEL = "onoefg";
export const KICK_URL     = "https://kick.com/onoefg";
export const DISCORD_URL  = "https://discord.gg/x5gv6vwNvw";
// Partner casino is NOT decided yet — keep it configurable (see §6).
export const CASINO_NAME  = process.env.NEXT_PUBLIC_CASINO_NAME ?? "Partner Casino";
export const CASINO_CODE  = process.env.NEXT_PUBLIC_CASINO_CODE ?? "ONO";
export const CASINO_URL   = process.env.NEXT_PUBLIC_CASINO_URL ?? "#";
```

---

## 1. Study the reference project FIRST (mandatory)

Before writing a single file, read `../JBALLIN/` completely:

- `../JBALLIN/CLAUDE.md` — golden rules, Rainbet API spec, data model, cron
  logic, masking rule. **All of its golden rules apply to this project too.**
- `lib/` — `db.ts`, `rainbet.ts`, `mask.ts`, `periods.ts`, `kick.ts`,
  `admin.ts`, `bonusHunt.ts`, `prediction.ts`, `tournament.ts`,
  `giveawaySession.ts`, `slotSearch.ts`.
- `app/api/` — cron sync, Kick chat webhook, admin routes.
- `components/` — `WinnerPicker.tsx` (reel + wheel), `BonusHuntBoard.tsx`,
  `TournamentBoard.tsx`, `LeaderboardTable.tsx`, `Countdown.tsx`.
- `db/migrations/` — the SQL schema and how it evolved.
- `.github/workflows/cron-sync.yml` — how the sync is triggered.

Port the **logic** (it is battle-tested: decimal-safe money, immutable frozen
results, server-side masking, keep-last-good-data on failed sync, Kick webhook
signature verification, admin cookie). **Rebuild the UI from zero** — do not
copy JBALLIN's look (emerald accents, Bangers font, pill navbar). Then write a
short `NOTES-FROM-JBALLIN.md` listing what you reused and what you changed.

---

## 2. Stack — decided

- **Next.js 16 (App Router, TypeScript strict, React 19, Server Components by
  default)**
- **Tailwind CSS v4** with design tokens in `@theme`
- **MySQL 8** via `mysql2` pool (same as JBALLIN; Aiven-compatible TLS via
  `DB_SSL_CA_BASE64`). Raw SQL migrations in `db/migrations/NNNN_name.sql`
  plus a tiny `scripts/migrate.ts` runner that tracks applied files in a
  `schema_migrations` table.
- **Zod** for validating every request body and every external API response
- **Motion** (`motion/react`) for UI animation; **three.js + @react-three/fiber
  + @react-three/drei** for the tunnel hero only (lazy-loaded, client-only)
- **Lenis** for smooth scroll (disabled under `prefers-reduced-motion`)
- **lucide-react** for icons (no emoji as icons, ever)
- **Vercel** hosting; **GitHub Actions** cron hitting protected routes
- Package name: `ono-degen-tunnel`. Use `npm`.

No other UI kit (no shadcn default look, no MUI, no Bootstrap). Components are
hand-built against our tokens.

---

## 3. Design direction — "The Tunnel"

### 3.1 Concept
The brand idea is a **tunnel of light you fly through**. The home hero is a
real-time WebGL tunnel: concentric rounded-square rings of thin light receding
into darkness, slowly rotating, with the camera pushing forward as the user
scrolls. Every page reuses that language: rings, perspective lines, depth,
light at the end of the tunnel = the prize.

### 3.2 Palette (tokens, no other colors allowed)
```
--bg-0:      #050507   (void — page background)
--bg-1:      #0B0B10   (surface)
--bg-2:      #12121A   (raised surface / cards)
--bg-3:      #1A1A25   (hover / inputs)
--line:      rgba(255,255,255,0.07)
--line-strong: rgba(255,255,255,0.14)
--text-0:    #F4F1EA   (warm white, not pure white)
--text-1:    #A9A6B3
--text-2:    #6C6A78
--gold:      #D9B46A   (champagne gold — luxury, primary accent)
--gold-hi:   #F3D898
--volt:      #7CFF4F   (electric volt green — "live", wins, positive)
--plasma:    #6B5CFF   (deep electric violet — used sparingly, tunnel glow only)
--danger:    #FF4D5E
```
Rule: gold = money/prizes/VIP. Volt = live/wins/online. Plasma = only inside
the tunnel/3D. Never put three accents in one component.

### 3.3 Typography
- Display: **"Unbounded"** (Google Fonts) — wide, futuristic, used in caps for
  headings and big numbers.
- UI/body: **"Inter Tight"**.
- Numbers (wagers, prizes, timers, ranks): **"JetBrains Mono"** with
  `font-variant-numeric: tabular-nums` so numbers never jitter.
- Strict type scale (12/14/16/20/28/40/64/96). Tight letter-spacing on display,
  generous tracking (`0.2em`) on small caps labels.

### 3.4 Surfaces & detail
- Cards: `--bg-2`, 1px `--line` border, 16px radius, a 1px inner top highlight
  (`inset 0 1px 0 rgba(255,255,255,0.04)`). No heavy glassmorphism, no blurry
  colored blobs.
- Gold elements get a subtle **animated conic-gradient border** on hover only.
- Fine **noise/grain overlay** (SVG turbulence, 3% opacity) over the whole page.
- Thin perspective grid lines in section backgrounds, fading into the dark.
- Micro-interactions: 150–250ms, custom easing `cubic-bezier(.2,.8,.2,1)`.
  Buttons press down 1px. Numbers count up when entering the viewport.
- Respect `prefers-reduced-motion` everywhere (static tunnel image fallback).

### 3.5 Anti-"AI look" rules (hard requirements)
- ❌ No purple-to-pink gradient hero, no generic blob backgrounds, no
  "glowing orb" clichés, no emoji icons, no stock 3D coins.
- ❌ No filler copy: banned words — "unlock", "elevate", "seamless",
  "revolutionize", "next-level", "unleash", "journey", "cutting-edge",
  "in today's world". Copy is short, confident, degen-native ("Wager. Climb.
  Get paid.", "The tunnel resets in", "Top 10 eat.").
- ❌ No three identical feature cards in a row as the main section. Use
  asymmetric bento grids, varied card sizes, real data in cards.
- ❌ No centered-everything layout. Mix left-aligned editorial blocks, data
  tables, marquee tickers, split layouts.
- ✅ Real content density like Stake: sidebar, tickers, tables, tabs, badges,
  live indicators, timestamps.
- ✅ Every empty state is designed (illustration placeholder + one line +
  CTA), never a blank box or `$0.00`.
- ✅ Consistent 8px spacing grid, 1280px max content width, 24px gutters
  (16px on mobile).

---

## 4. Layout shell (Stake/Rainbet-style app shell)

- **Left sidebar** (desktop ≥1024px, collapsible to icon rail, state saved in
  localStorage): logo, nav groups — *Compete* (Leaderboard, Races,
  Tournaments, Challenges), *Play* (Bonus Hunt, Guess the Balance, Daily Case,
  Wheel), *Rewards* (VIP Club, Points Store, Giveaways), *Community* (Stream,
  Hall of Fame, Discord). Bottom: Kick live status pill + Discord button.
- **Top bar**: search (Cmd/Ctrl+K command palette to jump to any page or look
  up your own leaderboard rank), "LIVE on Kick" indicator with viewer count
  when live, Kick login button / user menu with points balance.
- **Live wins ticker** under the top bar (marquee): latest bonus-hunt hits,
  giveaway winners, leaderboard rank changes. Pauses on hover.
- **Mobile**: bottom tab bar (Home, Leaderboard, Play, Rewards, Menu) + full
  screen drawer. Must be flawless at 360px width.
- **Footer**: 18+ badge, responsible-gambling links (BeGambleAware,
  gamblingtherapy.org), affiliate disclosure ("ONO earns commission…"), "not a
  casino" disclaimer, socials, legal pages.

---

## 5. Pages & features

### 5.1 Home `/`
1. **Tunnel hero** (WebGL): headline "ONO DEGEN TUNNEL", sub-line with the
   casino code chip (click to copy, toast "Code copied"), two CTAs
   ("Enter the Tunnel" → leaderboard, "Sign up with code ONO" → casino).
   Live countdown to the current leaderboard reset under the CTAs.
2. **Prize stat strip**: total prize pool this period, total paid out all-time,
   players on board, days left — animated count-up, mono numbers.
3. **Leaderboard preview**: top-3 podium + ranks 4–10, "View full board".
   If no leaderboard is active → designed "Leaderboard dropping soon" state
   with a Discord notify CTA.
4. **Live stream block**: Kick player embed (`https://player.kick.com/onoefg`)
   when live; when offline, a cinematic offline card with the next scheduled
   stream time (from admin schedule) and "Follow on Kick".
5. **Bento grid of features**: Bonus Hunt (live stats), Guess the Balance
   (active round), Daily Case, VIP tier preview, latest giveaway winner.
6. **How it works**: 3 steps, horizontal, numbered like tunnel rings.
7. **Discord + Kick community banner**.
8. **FAQ** accordion.

### 5.2 Leaderboard `/leaderboard` — the core product
The leaderboard **does not exist yet** (no casino partner/API key). Build it
fully, provider-agnostic, and fully working with seeded demo data in dev:
- SSR from our DB only (golden rule 1 from JBALLIN).
- Period switcher tabs: **Monthly / Weekly / Previous periods**.
- Podium (1st/2nd/3rd) with distinct gold/silver/bronze ring treatments and
  prize amounts; then a dense table (rank, masked user, wagered, prize, rank
  change ▲▼ since last sync).
- **"Find me" search**: user types full username → server returns only their
  masked row + rank + "you need $X more to reach rank N". Rate-limited.
- Countdown with reset time labelled in the visitor's timezone.
- "Last updated X min ago" from `cache_updated_at`.
- Prize distribution table and rules link.
- Archive pages for closed periods, read from immutable `final_results`.
- Admin can toggle `LEADERBOARD_ENABLED`; when off, show the designed
  "coming soon" state on every leaderboard surface.

### 5.3 Races `/races`
Stake-style short races (24h / 7d) computed from the same wager data
(difference between snapshots). Mini podium, prize per rank, timer.

### 5.4 Tournaments `/tournaments`
Port JBALLIN's 8-slot bracket (slot battles) and redesign it: animated
bracket lines, winner path glows gold, prize display.

### 5.5 Challenges `/challenges`
Stake-style challenges: "First to hit 1000x on [slot] wins $X". Cards with slot
image, required multiplier, min bet, prize, status (open / claimed / expired),
claimed-by masked username. Admin-managed.

### 5.6 Bonus Hunt `/bonus-hunt`
Port JBALLIN's bonus hunt: start balance, list of bonuses (slot, provider,
bet, payout, multiplier), live stats (total cost, current win, required
average X to break even, best/worst hit), progress bar. Slot autocomplete in
admin (port `slotSearch.ts`). Hunt history archive.

### 5.7 Guess the Balance `/guess-the-balance`
Port JBALLIN's prediction game: viewers type `!gb <amount>` in Kick chat
(webhook), live list of guesses, closest wins once the hunt is finished,
history of past rounds and winners.

### 5.8 VIP Club `/vip`
Rainbet/Stake-style VIP ladder **based on wagered amount under code ONO**:
tiers Bronze → Silver → Gold → Platinum → Diamond → Obsidian → Tunnel God,
each with a designed badge (placeholder image), threshold, and perks
(handled manually by ONO: bigger giveaway entries, Discord role, monthly
bonus). Show a progress bar to next tier for logged-in users who linked
their casino username (admin-verified link, see §5.11).

### 5.9 Points system (free, non-purchasable)
- Users **log in with Kick** (OAuth 2.1 + PKCE via `id.kick.com`, scopes:
  `user:read`). Session = signed httpOnly cookie, sessions table.
- Points earned by: chatting in ONO's Kick chat while live (webhook, capped per
  minute to stop spam), daily login streak, winning stream games, admin grants.
- Points ledger table — balance is always `SUM(ledger)`, never a mutable
  column. Every change has a reason.
- **Points Store `/store`**: items redeemable with points (casino bonus codes,
  Discord roles, merch, giveaway entries). Redemptions go to an admin queue
  (pending → fulfilled / rejected with automatic refund ledger entry).
- **Daily Case `/case`**: once per 24h, free, CS-style horizontal reel opening
  (reuse the reel mechanics from `WinnerPicker.tsx`) awarding points.
  Outcome decided **server-side** with a provably-fair commit/reveal
  (server seed hash shown before, seed revealed after, client seed + nonce;
  verification page `/fair`).
- **Wheel `/wheel`**: same idea, free daily spin, points rewards.

### 5.10 Giveaways `/giveaways`
- Port JBALLIN's Winner Picker (manual list or Kick chat keyword auto-entry,
  active-chatter threshold, reel + wheel modes, confetti, roll sound).
- Public page: active giveaways with entry conditions, countdown, entrant
  count; past winners with avatars.
- Stream overlay route `/overlay/giveaway` (transparent background, for OBS
  browser source) showing the roll live on stream.

### 5.11 Profile `/me`
Kick avatar + name, points balance & ledger history, VIP tier, redemptions,
daily streak, field to submit casino username for verification (admin
approves; stored server-side, never shown unmasked publicly).

### 5.12 Hall of Fame `/hall-of-fame`
Past leaderboard champions, biggest bonus-hunt multipliers, giveaway winners,
challenge winners — filterable.

### 5.13 Stream `/stream`
Kick embed + chat embed, weekly schedule (admin-editable), latest clips grid
(placeholder thumbnails), live status from Kick API (cached 60s server-side).

### 5.14 Static pages
`/how-it-works`, `/rules` (leaderboard rules + worked example of weighted
wager if the provider uses it), `/faq`, `/fair`, `/terms`, `/privacy`,
`/responsible-gambling`. Real copy, not lorem ipsum.

### 5.15 Admin `/admin` (port + extend JBALLIN's admin)
Password from `ADMIN_PASSWORD` (JBALLIN cookie pattern) **plus** optional
allow-list of Kick user IDs (`ADMIN_KICK_IDS`). Sidebar sections:
Dashboard (sync health, last error, users, points issued), Periods (create,
edit prize pool & distribution, seed 12 months ahead), Blacklist, Races,
Tournaments, Challenges, Bonus Hunt, Guess the Balance, Giveaways / Winner
Picker, Points (grant/deduct with reason), Store items & Redemption queue,
VIP tiers, Users & casino-username verification, Stream schedule, Site
settings (casino name/code/url, leaderboard on/off, announcement banner),
Audit log (every admin action recorded).

---

## 6. Casino provider abstraction (partner not chosen yet)

Create `lib/providers/`:
```
types.ts        interface WagerProvider { fetchWagers(start, end): Promise<WagerRow[]> }
rainbet.ts      port of JBALLIN lib/rainbet.ts (exact error-code handling)
manual.ts       admin uploads a CSV (username,id,wagered) → validated → upserted
demo.ts         deterministic fake data for local dev & previews
index.ts        picks provider from env CASINO_PROVIDER = rainbet | manual | demo
```
Adding another casino later (e.g. a Stake-style API) = one new file.
`WagerRow.wagered` is a **decimal string**; never parse money into JS floats —
use DECIMAL in MySQL and a decimal library (`decimal.js`) in TS.

---

## 7. Backend rules (from JBALLIN, non-negotiable)

1. The browser never calls the casino API. Only server cron routes do.
2. Secrets never in `NEXT_PUBLIC_*` or client bundles. Use `import "server-only"`.
3. Usernames masked on the server before any payload leaves (JBALLIN mask rule).
4. Failed sync → log it, keep last good data. Never show an empty board.
5. `final_results` immutable (DB triggers, `ON DELETE RESTRICT`).
6. Rank in SQL (window functions), not JS.
7. All money in `DECIMAL(20,8)`.
8. Every mutation route: Zod validation, admin/auth check, rate limit
   (DB-backed or Upstash if `UPSTASH_*` env present), audit log entry.
9. Kick webhook: verify signature (port `lib/kick.ts`), dedupe by message id.
10. Points/case/wheel outcomes are server-decided; client only animates the
    result it receives.
11. Security headers (CSP allowing `player.kick.com`, `kick.com`), CSRF-safe
    (SameSite=Lax cookies + origin check on POST).

Cron (GitHub Actions, every 10 min, `Authorization: Bearer CRON_SECRET`):
`/api/cron/sync` (wagers + rank-change snapshot + period rollover),
`/api/cron/races`, `/api/cron/kick-live` (live status cache).

---

## 8. Images & assets — placeholders I will replace

I don't have final art yet. For **every** image the site needs, generate a
**branded SVG placeholder** (dark background, gold 1px frame, the exact pixel
size and purpose written in the middle, e.g. `HERO FALLBACK — 1920×1080`) and
save it in `public/assets/...` with the final file name I'll overwrite later.
All image paths must come from **one file** `lib/assets.ts`, so replacing an
image = dropping a file with the same name. Then generate `ASSETS.md`: a table
of every asset with path, size, format to use (png/webp/svg), where it appears,
and a short art-direction note for the designer.

Minimum list:
- `brand/logo.svg`, `brand/logo-mark.svg` (square), `brand/wordmark.svg`
- `brand/favicon.png` 512×512, `brand/og-image.png` 1200×630 (also generate a
  dynamic OG image route with the current #1 and prize pool)
- `hero/tunnel-fallback.webp` 1920×1080 (reduced-motion / no-WebGL)
- `hero/ono-cutout.png` 900×1100 (streamer cutout over the tunnel)
- `casino/casino-logo.svg`, `casino/casino-banner.webp` 1600×500
- `podium/rank-1.png`, `rank-2.png`, `rank-3.png` 512×512
- `vip/tier-bronze.png` … `vip/tier-tunnel-god.png` 256×256 (7 badges)
- `cases/daily-case.png` 600×600, `cases/items/*.png` 256×256 (8 items)
- `store/*.webp` 600×600 (6 items)
- `stream/offline.webp` 1600×900, `stream/clip-1..6.webp` 640×360
- `empty/leaderboard-soon.svg`, `empty/no-giveaway.svg`, `empty/no-hunt.svg`
- `social/kick.svg`, `social/discord.svg` (real brand icons, simple-icons)
- `overlay/giveaway-frame.png` 1920×1080 transparent

---

## 9. Database (write as migrations)

Reuse JBALLIN tables: `periods`, `live_entries`, `final_results`,
`sync_log`, `blacklist`, `bonus_hunt*`, `tournament*`, `guess_balance*`,
`giveaway*`. Add:
`users` (kick_user_id PK, username, avatar, created_at, banned),
`sessions`, `casino_links` (user, casino_username, status),
`rank_snapshots` (for ▲▼), `races`, `race_entries`,
`challenges`, `points_ledger`, `store_items`, `redemptions`,
`case_openings` / `wheel_spins` (server_seed_hash, server_seed, client_seed,
nonce, result), `vip_tiers`, `stream_schedule`, `site_settings` (key/value
JSON), `audit_log`, `schema_migrations`.
Seed script: 12 monthly periods ahead, VIP tiers, demo store items, demo
leaderboard data (only when `CASINO_PROVIDER=demo`).

---

## 10. Quality bar

- Lighthouse ≥ 90 on mobile for Performance, Accessibility, Best Practices,
  SEO. WebGL hero lazy-loaded after first paint; LCP is the headline text.
- WCAG AA contrast, keyboard navigable, focus rings in gold, `aria-live` on
  countdowns/tickers only where useful.
- Fully responsive 360px → 2560px. Test every page at 360, 768, 1280, 1920.
- `loading.tsx` skeletons that match the real layout, `error.tsx` and a
  designed `not-found.tsx` ("Lost in the tunnel").
- SEO: metadata per page, sitemap, robots, JSON-LD Organization.
- `npm run build`, `npm run lint`, `tsc --noEmit` pass with zero errors.
- Unit tests (Vitest) for: mask, decimal math, period rollover, provably-fair
  verification, points ledger balance, prize distribution.
- `.env.example` documenting every variable; `.env.local` in `.gitignore`.
- `README.md`: setup, migrations, env, cron setup, Kick app setup (OAuth +
  webhook URL), how to swap casino provider, how to replace assets.

Env vars:
```
DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME DB_SSL_CA_BASE64
CRON_SECRET ADMIN_PASSWORD ADMIN_KICK_IDS SESSION_SECRET
CASINO_PROVIDER RAINBET_API_KEY
NEXT_PUBLIC_CASINO_NAME NEXT_PUBLIC_CASINO_CODE NEXT_PUBLIC_CASINO_URL
KICK_CLIENT_ID KICK_CLIENT_SECRET KICK_REDIRECT_URI
SLOT_REPORT_API_KEY NEXT_PUBLIC_SITE_URL
UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN (optional)
```

---

## 11. How to work

1. Read `../JBALLIN/` (§1). Write `NOTES-FROM-JBALLIN.md`.
2. Write `PLAN.md`: sitemap, component list, schema, build order. Then start.
3. Build in this order, checking `npm run build` after each phase:
   **A** scaffold, tokens, fonts, app shell, footer, assets + `ASSETS.md` →
   **B** DB, migrations, providers, cron, leaderboard (demo data) →
   **C** home + tunnel hero →
   **D** Kick login, points ledger, profile →
   **E** bonus hunt, guess the balance, tournaments, challenges, races →
   **F** daily case, wheel, provably fair, store, redemptions, VIP →
   **G** giveaways + OBS overlay →
   **H** admin panel complete →
   **I** static pages, SEO, tests, accessibility & performance pass.
4. Never leave TODOs, mock buttons that do nothing, or lorem ipsum. If
   something needs a real key, it works in demo mode and the README says how
   to switch it on.
5. At the end, run the app, click through every page at mobile and desktop
   width, fix what looks off, and give me a final checklist of what's done and
   which files/assets I need to provide.

Start now with step 1.
