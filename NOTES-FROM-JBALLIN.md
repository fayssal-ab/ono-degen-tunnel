# NOTES FROM JBALLIN

What I studied in `../JBALLIN/` and how it maps into **ONO DEGEN TUNNEL**.
JBALLIN is a shipped Next.js 16 / MySQL 8 wager-leaderboard site for a Kick
streamer on Rainbet. Its logic is battle-tested; its look is not reused.

---

## Reused logic (ported, sometimes generalised)

| JBALLIN source | What it does | How it lands here |
|---|---|---|
| `lib/db.ts` | Lazy `mysql2` pool; `decimalNumbers:false`, `dateStrings:true`; Aiven TLS via `DB_SSL_CA_BASE64` | Ported verbatim. Lazy build is essential — Next evaluates route modules at build time before runtime env exists. |
| `lib/mask.ts` | Server-only username masking (the 2–3 char leak case handled) | Ported verbatim. Golden rule 3. |
| `lib/rainbet.ts` | Server-only Rainbet client, every `er_*` code handled explicitly, 123-day guard | Moved under `lib/providers/rainbet.ts` behind a `WagerProvider` interface (prompt §6). Error handling preserved exactly. |
| `lib/periods.ts` | Active-period lookup, live entries, closed archive, rollover via stored procs, keep-last-good-data | Ported; ranking stays in SQL (window funcs / procs), money stays a decimal string end-to-end. |
| `lib/kick.ts` | App-token client-credentials grant, channel lookup, webhook subscribe, **RSA-SHA256 webhook signature verify over `{id}.{ts}.{rawBody}`** | Ported verbatim. Raw-body verification is the subtle part — never re-serialize. Extended with user OAuth (PKCE) for login (prompt §5.9). |
| `lib/admin.ts` | Cookie = `sha256(ADMIN_PASSWORD)`, timing-safe compare, rotating the password invalidates cookies | Ported; extended with optional `ADMIN_KICK_IDS` allow-list (prompt §5.15). |
| `lib/slotSearch.ts` | slot.report full-list fetch cached 24h, graceful degrade to no suggestions, predictable thumb URL | Ported verbatim for bonus-hunt admin autocomplete. |
| `lib/constants.ts` | Brand links + `PERIOD_RESET_TIME_UTC` | Rewritten for ONO brand + configurable casino env (prompt §0). Reset-time pattern kept. |
| `db/migrations/*` + `scripts` | Raw SQL migrations, stored procs `recompute_live_ranks` / `close_period` / `activate_next_period` | Schema ported and extended; `schema_migrations`-tracked `scripts/migrate.ts` runner added (JBALLIN applied by hand; prompt §2 wants the runner). The three stored procs are **reimplemented in `lib/periods.ts`** as window-function SQL issued from TS (ranking still in SQL, golden rule 6) — this keeps the migrate runner free of `DELIMITER` handling. `final_results` immutability stays a DB trigger. |
| `components/WinnerPicker.tsx` | Reel + wheel winner picker, confetti, roll sound, Kick keyword auto-entry | Logic reused for giveaways **and** the Daily Case reel (prompt §5.9/§5.10). UI rebuilt on new tokens. |
| `components/BonusHuntBoard.tsx`, `TournamentBoard.tsx`, `LeaderboardTable.tsx`, `Countdown.tsx` | Live stats math, bracket, masked table, timezone countdown | Logic/shape reused, re-skinned. |

## Golden rules carried over (JBALLIN `CLAUDE.md`, non-negotiable — prompt §7)

1. Browser never calls the casino API; only server cron routes do.
2. Casino API key is server-only — never `NEXT_PUBLIC_*`, never in a browser-built URL (Rainbet takes the key as a **query param**, so a client fetch leaks it).
3. Masking happens on the server, before any payload leaves.
4. Failed sync → log + keep last good data. Never an empty board.
5. `final_results` immutable once frozen.
6. Rank computed in SQL, not JS.
7. All money `DECIMAL(20,8)` in MySQL, `decimal.js` in TS — never a JS float.

Plus Rainbet spec facts that shape the schema: `id` stable / `username` not
(PK on casino id, refresh username each sync); date-granularity is days only;
`target_edge` weighting is a documented UX trap (rules page needs a worked
example); past-period amounts can change retroactively → that's *why* we freeze.

---

## Deliberately NOT reused (rebuild from zero — prompt §1)

- **The entire look.** JBALLIN uses emerald accents, Bangers display font, a
  pill navbar, floating particles. ONO is champagne-gold / volt-green / plasma
  on near-black, Unbounded + Inter Tight + JetBrains Mono, a left app-shell
  sidebar (Stake/Rainbet density), and a WebGL tunnel hero. No visual carry-over.
- **Rainbet hard-coding.** JBALLIN calls Rainbet directly. Here the provider is
  abstracted (`rainbet` / `manual` / `demo`) because the partner casino is not
  chosen yet; dev runs on deterministic `demo` data.
- **Shopify/Printful merch stack.** Replaced by a free, non-purchasable
  **points store** with an admin redemption queue. No real money anywhere.
- **Hand-applied migrations.** Replaced with a tracked migrate runner.
- **Single-password admin only.** Extended with a Kick-ID allow-list and a full
  audit log.

---

## New ground (no JBALLIN equivalent — built fresh)

Kick user OAuth login (PKCE) + sessions, points ledger (balance = SUM(ledger)),
provably-fair daily case & wheel (commit/reveal + `/fair` verifier), VIP ladder,
races (snapshot diffs), challenges, casino-username verification, the WebGL
tunnel hero, the command palette, the OBS giveaway overlay, and branded SVG
asset placeholders with `lib/assets.ts` + `ASSETS.md`.
