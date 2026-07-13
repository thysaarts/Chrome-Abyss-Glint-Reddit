# Chrome Abyss: Glint — on Reddit

**Glint** is a push-your-luck gem puzzle built for Reddit communities. Every day, the whole
subreddit gets the **same board** — one shared seed, one leaderboard, one score that counts:
your best. Place gems, chain combos, and decide every turn whether to bank your points or
gamble on a bigger multiplier. Overreach and you **bust**. Survive two board collapses and the
run ends in the frantic **GLINT RUSH** final round.

Built with Reddit's Developer Platform (Devvit Web): the game runs in the post's web view, and
a serverless backend hands out the daily seed and keeps the community leaderboard in Redis.

---

## How to play

**Goal:** score as many points as you can before the run ends — then get on the community
leaderboard.

1. **Place gems.** Tap any empty cell to place the gem you're holding (shown in *NOW PLACING*).
   Six connected gems of matching kinds **activate** into a glowing combo.
2. **Bank or push.** Activated combos are worth points — bank them now, or keep placing to
   grow the cluster and multiply the value. The longer you wait, the more you risk.
3. **Don't bust.** If a placement overloads the board, you **bust** and lose a life. Three
   busts end the run.
4. **Watch the collapse.** As the board empties past a threshold, the Abyss **collapses** it to
   a smaller grid — twice. The final, tiny board is **GLINT RUSH**: every placement matters,
   and you can **CASH OUT** at any moment to bank the run.
5. **Special tiles.** Dross blocks your combos until cleared; overflow refines into
   **Nebulite** — a shape-shifting wild that also pays out as currency for the Shop.

The in-game **How to play** (the ? in the header) and the interactive tutorial cover the full
ruleset.

### The Community Daily

Open **Challenges → COMMUNITY DAILY** and hit **PLAY**. Everyone in the subreddit plays the
same board that day (it rolls over at midnight UTC). Your best score lands on the community
leaderboard — come back tomorrow for a fresh board and a clean slate.

Beyond the daily: a 60-level campaign (**The Ascent**), three date-seeded challenge objectives
per day, lifetime milestones, achievements, a sticker book, and a Shop where the Nebulite you
bank buys board themes and music.

---

## Structure (Devvit Web)

```
devvit.json          app config: entrypoints, server, menu, triggers, permissions
src/client/          the game (React + TypeScript) — game.html is the expanded view,
                     splash.html the lightweight inline feed view
src/server/          serverless backend (Hono): daily seed + Redis leaderboard
src/shared/          request/response types shared by both sides
public/              art, audio fonts, thumbnails (copied into the client bundle)
```

- `GET /api/daily` — today's UTC day, the shared board seed, top-10 leaderboard, and the
  caller's best/rank.
- `POST /api/daily/score` — records a finished daily run (best-only, per Reddit account).
- A moderator menu action ("Create a Glint post") and the install trigger create the playable
  post.

## Develop

```bash
npm install
npm run login      # authenticate the Devvit CLI (once)
npm run dev        # devvit playtest — live develop against your test subreddit
npm run build      # produce dist/client + dist/server
npm run typecheck  # client + server tsconfigs
npm test           # engine test suite (21 tests, seeded playthrough sweeps)
npm run deploy     # typecheck + devvit upload
```

## Provenance

Glint's solo engine predates this hackathon; this Reddit app is a substantial rework created
during the submission period: the Devvit Web port (client/server split, splash + expanded
entrypoints), the Community Daily with the shared-seed board and Redis leaderboard, and a
slimmed build (the experimental 3D scenery from the web version was removed entirely for the
Reddit bundle). The engine also received major gameplay updates during the period — collapse
animation guarantees, per-element settings, and the sticker/puzzle identity system.
