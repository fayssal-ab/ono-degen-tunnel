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

```bash
cp .env.example .env.local      # fill in DB creds (runs fully on demo/manual with none)
npm install
npm run migrate                 # creates the DB + applies db/migrations/*
npm run seed                    # safe defaults only (no fake content)
npm run dev                     # http://localhost:3000
```

Scripts: `dev`, `build`, `start`, `typecheck`, `migrate` (`-- --fresh` to reset),
`seed`, `test`.

## Admin

Reach the control panel by visiting **`/login`** directly (no login button in the
public UI). Credentials come from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in env.
From there: Periods (run the leaderboard), Giveaways, VIP tiers, Stream schedule,
Settings (show/hide any page, leaderboard on/off), Audit log.

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

## Notes

- Branded SVG asset placeholders live in `public/assets/` — see `ASSETS.md`.
- Golden rules and what was reused from the sibling project are in
  `NOTES-FROM-JBALLIN.md`; the build plan is in `PLAN.md`.
