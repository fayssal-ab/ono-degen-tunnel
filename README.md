# ONO DEGEN TUNNEL

The rewards hub for the Kick streamer **ONO** — leaderboards, races, tournaments,
bonus hunts, a provably-fair giveaway tool, VIP ladder and more. Viewers sign up
at a partner crypto casino with ONO's code, wager there, and compete here.

**This site is not a casino.** It takes no deposits and runs no real-money games.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript strict)
- **Tailwind CSS v4** (design tokens in `@theme`) + **motion** for animation
- **MySQL 8** via `mysql2` (raw SQL migrations + a tracked runner)
- **Zod** validation · server-only secrets · `decimal.js` for money
- Vercel-ready; GitHub Actions cron hits protected routes

## Getting started

**MySQL 8 is required.** The `demo` provider only replaces the casino wager
feed; every page (leaderboards, events, admin) reads MySQL. Without a reachable,
migrated database the event pages show a “temporarily unavailable” state.

```bash
cp .env.example .env.local      # fill in DB_* (MySQL 8) + ADMIN_* + CRON_SECRET
npm install
npm run migrate                 # creates the DB if allowed + applies db/migrations/* (incremental)
npm run seed                    # safe defaults only (no fake content)
npm run dev                     # http://localhost:3000
```

Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `migrate` (`-- --fresh`
DROPS the database — never on production), `seed`, `test`.

Tests: `npm test` runs unit tests. Integration tests against a real, disposable
MySQL run when `TEST_DB_NAME` is set (the name must contain `test`; the suite
drops and recreates it):

```bash
TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3306 TEST_DB_USER=root TEST_DB_PASSWORD= \
TEST_DB_NAME=ono_events_test npm test
```

## Admin

Reach the control panel by visiting **`/login`** directly (no login button in the
public UI). Credentials come from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in env.
From there: Periods (incl. manual CSV import), Races, Tournaments, Challenges,
Bonus Hunt, Guess the Balance, Giveaways, VIP tiers, Stream schedule, Settings
(show/hide any page, leaderboard on/off), Audit log. Every admin mutation is a
Server Action that re-checks the session and is written to the audit log.

## Events (how results are decided)

- **Races** — score = growth of each player's cumulative period wager between
  the baseline sync (≤ 20 min before start, else first sync after start) and
  the last sync before the end; accuracy is one sync interval (~10 min). A
  player missing from the baseline is only scored from 0 if the provider
  guarantees complete listings (`demo` yes; `rainbet` only with
  `RAINBET_LISTS_ALL_WAGERERS=true` after confirming with Rainbet; `manual`
  no). A race freezes after a sync newer than its end; stale final data needs an
  explicit admin “finalise”. Unallocated shares are not paid.
- **Tournaments** — 8 seeds, QF 1v8/4v5/2v7/3v6; higher multiplier advances;
  ties must be replayed; corrections are refused once the next round is scored.
- **Bonus Hunt** — one active hunt; final balance = sum of payouts; the first
  payout locks the bonus list and closes a linked GB round atomically.
- **Guess the Balance** — `!gb <amount>` via the signed Kick webhook; one guess
  per Kick user id, latest *sent* wins; messages after the deadline/close are
  ignored; winner = smallest distance, then earliest final guess, then id.
- **Challenges** — proof is sent on Discord and recorded/reviewed by an admin;
  one accepted claim per challenge.

## Casino provider

`CASINO_PROVIDER` = `rainbet` | `manual` | `demo` (see `lib/providers/`). The
browser never calls the casino API — only the cron route does. Usernames are
masked server-side; money is `DECIMAL(20,8)`; `final_results` is immutable.

## Giveaways (Kick)

Entries come from **Kick chat**, read live in the browser via Kick's public chat
socket (unofficial — Kick publishes no chat API). The winner is chosen
server-side (HMAC over a committed seed); repeated wins are allowed. The first
draw locks the eligible entrants. Use **Finish & reveal results** after the last
reroll to publish the seed on `/verify/{id}`. **Clear** starts a new round with a
fresh seed and clears the previous entries/results. Subscriber and Active
(at least two matching chat messages) filters are editable before the first draw. Set `KICK_CHATROOM_ID` for your channel (find it at
`kick.com/api/v2/channels/<slug>` → `chatroom.id`).

## Kick webhook (Guess the Balance, chat entries)

`/api/webhooks/kick/chat` verifies Kick's RSA signature over the raw body and
de-duplicates by `Kick-Event-Message-Id`. Configure:

- `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` — app from kick.com/settings/developer,
  with the webhook URL `https://<site>/api/webhooks/kick/chat` and the
  `chat.message.sent` event subscribed for ONO's channel.
- `KICK_BROADCASTER_USER_ID` — ONO's numeric Kick user id. Events from any other
  broadcaster are ignored. If unset, the channel slug/username is compared to
  `KICK_CHANNEL` instead (weaker).

Admin → Guess the Balance shows whether credentials are set and when the last
webhook event arrived.

## Notes

- Branded SVG asset placeholders live in `public/assets/` — see `ASSETS.md`.
- Golden rules and what was reused from the sibling project are in
  `NOTES-FROM-JBALLIN.md`; the build plan is in `PLAN.md`.
