# PLAN — ONO DEGEN TUNNEL

Build order follows prompt §11 (A→I). `npm run build` + `tsc --noEmit` must stay
green at the end of every phase. Nothing ships with TODOs, dead buttons, or
lorem ipsum; anything needing a real key works in `demo` mode and the README
says how to switch it on.

---

## Sitemap

```
/                      home — tunnel hero, prize strip, LB preview, stream, bento, how-it-works, FAQ
/leaderboard           core product — SSR, period tabs, podium, dense table, "find me", countdown
/leaderboard/[period]  immutable archive of a closed period (final_results)
/races                 24h / 7d races from snapshot diffs
/tournaments           8-slot slot-battle bracket
/challenges            "first to Nx on <slot>" challenge cards
/bonus-hunt            live bonus hunt + history archive
/guess-the-balance     Kick-chat !gb prediction game + history
/vip                   VIP ladder, per-tier badge/threshold/perks, progress bar
/store                 points store (redeem → admin queue)
/case                  daily free provably-fair case (reel)
/wheel                 daily free provably-fair wheel
/fair                  provably-fair verifier
/giveaways             active + past giveaways
/overlay/giveaway      transparent OBS browser-source roll
/me                    profile — points, ledger, VIP, redemptions, streak, casino link
/hall-of-fame          past champions / biggest hits / winners, filterable
/stream                Kick embed + chat + schedule + clips
/how-it-works /rules /faq /terms /privacy /responsible-gambling   static (real copy)
/admin/*               dashboard, periods, blacklist, races, tournaments, challenges,
                       bonus-hunt, guess-the-balance, giveaways, points, store,
                       redemptions, vip, users, stream, settings, audit

API
/api/cron/sync         wagers + rank snapshot + period rollover   (Bearer CRON_SECRET)
/api/cron/races        race recompute
/api/cron/kick-live    cached live status
/api/auth/kick/login   PKCE start
/api/auth/kick/callback
/api/auth/logout
/api/search            masked self-lookup (rate-limited)
/api/webhooks/kick/chat  signature-verified chat → points / !gb / giveaway entry
/api/case/open /api/wheel/spin   server-decided provably-fair outcome
/api/store/redeem
/api/admin/*           every mutation: Zod + auth + rate-limit + audit
/og                    dynamic OG image (current #1 + prize pool)
```

## Shell & shared components

AppShell (left sidebar, collapsible, localStorage), TopBar (search → Cmd+K
palette, Kick live pill, user menu + points), WinsTicker (marquee, pause on
hover), MobileTabBar + Drawer, SiteFooter (18+, RG links, affiliate disclosure,
"not a casino"). Primitives: Button, Card, Badge, LiveDot, Countdown, StatTile
(count-up, mono), DataTable, Tabs, Accordion, Toast, CopyChip, Podium,
EmptyState, Skeleton, Reel (shared by Case + WinnerPicker), Wheel, CommandPalette.
TunnelHero (lazy, client-only three.js) + static webp fallback.

## Schema (migrations in `db/migrations/NNNN_*.sql`, tracked in `schema_migrations`)

Ported: `periods`, `live_entries`, `final_results`, `sync_log`, `blacklist`,
`bonus_hunt`, `bonus_hunt_entries`, `tournament`, `tournament_slots`,
`guess_balance*`, `giveaway*`.
New: `users`(kick_user_id PK), `sessions`, `casino_links`, `rank_snapshots`,
`races`, `race_entries`, `challenges`, `points_ledger`, `store_items`,
`redemptions`, `case_openings`, `wheel_spins`, `vip_tiers`, `stream_schedule`,
`site_settings`(key/JSON), `audit_log`, `schema_migrations`.
Rules: money `DECIMAL(20,8)`; rank via SQL window funcs; `final_results`
immutable (`ON DELETE RESTRICT` + trigger); points balance = `SUM(points_ledger)`.
Seed (demo provider only): 12 monthly periods ahead, VIP tiers, demo store
items, demo leaderboard rows.

## Provider abstraction (`lib/providers/`)

`types.ts` `WagerProvider{ fetchWagers(start,end):Promise<WagerRow[]> }` ·
`rainbet.ts` (port) · `manual.ts` (admin CSV upsert) · `demo.ts` (deterministic)
· `index.ts` (picks from `CASINO_PROVIDER`). `WagerRow.wagered` is a decimal string.

## Build order (checkpoints)

- **A** scaffold · tokens · fonts · AppShell · footer · SVG placeholders + `ASSETS.md`  ← start
- **B** DB · migrations · migrate runner · providers · cron · leaderboard (demo)
- **C** home + tunnel hero
- **D** Kick login · points ledger · profile
- **E** bonus hunt · guess-the-balance · tournaments · challenges · races
- **F** daily case · wheel · provably-fair + `/fair` · store · redemptions · VIP
- **G** giveaways + OBS overlay
- **H** admin complete
- **I** static pages · SEO · tests (Vitest) · a11y + perf pass · final checklist

## Test targets (Vitest, phase I)

mask · decimal math · period rollover · provably-fair verify · points-ledger
balance · prize distribution.
