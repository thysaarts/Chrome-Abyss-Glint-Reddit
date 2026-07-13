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

1. **Place gems.** On every turn you hold one visible gem (*NOW PLACING*). Place it to
   **cover a gem** already on the board (that gem joins your hand) or to **fill an empty
   gap**. A placement is only legal if it forms or extends a combo.
2. **Build combos.** One placement **activates** a whole combo by absorbing the connected
   matching gems around it — matched sets (a pair of 2s or 6s, three/four/five/six of a
   kind) or straights of consecutive values (four, five or all six). Activated combos glow
   and stay in play; you can build several.
3. **Bank at six.** When a connected glowing cluster reaches **6+ gems it banks
   automatically** — and the gem your finishing placement covered becomes the
   **multiplier** (finish on a 6 for ×6; finish into a gap for no multiplier). Chaining
   combos into the bank adds bonus points. A timed **BANK** button also lets you bank a
   small cluster early, three times per game, at base value.
4. **Don't bust.** If your gem can't form or extend any combo, you **bust**: everything
   glowing is lost unbanked and you spend one of three lives. Three busts end the run.
5. **The Abyss collapses — twice.** As the board empties it contracts to a smaller
   hexagon, then contracts again into **GLINT RUSH**: the final round where ANY completed
   combo banks instantly, your whole hand is revealed, and you may **CASH OUT** at any
   moment to convert unspent lives, free banks and hand gems into points.
6. **Specials.** Dross is a booby-trap that can only be placed as a bust — isolate it to
   clear it. The Nebulite pays +500 when covered, acts as a joker, and is also the
   **currency**: banked Nebulite fills your wallet (doubled if you clear the board) and
   buys board themes and music in the Shop. Bank 7+ of the same gem and the overflow
   returns to your hand — every six overflow gems **refine into a new Nebulite**.

The in-game **How to play** (the ? in the header) and the interactive tutorial teach the
full ruleset.

### The Community Daily

Open **Challenges → COMMUNITY DAILY** and hit **PLAY**. Everyone in the subreddit plays the
same board that day (it rolls over at midnight UTC). Your best score lands on the community
leaderboard — come back tomorrow for a fresh board and a clean slate.

Beyond the daily: a 101-level campaign (**The Ascent**), three date-seeded challenge objectives
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
