# Chrome Abyss: Glint — Path to a Proper App

A build roadmap: what still needs to be BUILT or ENHANCED to take the game from
this prototype to a shippable app. Process/launch tasks (store listings,
marketing, pricing) are out of scope — this is engineering and product surface.

Written 2026-07-03, against the state of the prototype at that date.

## What we already have working for us

Two early architectural calls carry straight through to the app and make
several items below unusually cheap:

- **The engine is pure and seedable.** Every run is reproducible from a seed +
  move list. This enables server-verified leaderboards (anti-cheat nearly for
  free) and daily challenges (one shared seed).
- **All content flows through one content model.** Copy, levels, tutorial
  script and log templates live in JSON edited by the CMS (`/admin.html`).
  Graduating to a content API, localization, and live tuning are extensions of
  this model, not rewrites.

Also in place: PWA manifest (installable), reduced-motion support, mobile-first
layout, shape-equals-value gems (colorblind-friendly by design), an endless
level supply via the CMS generator, and a boss finale.

---

## Phase 1 — Foundation (build first; everything else stands on it)

### 1.1 Backend + accounts
- Anonymous device identity at first launch, upgradeable to a real account
  (sign-in) without losing progress.
- Cloud save/sync: campaign frontier, per-level results, best scores, settings.
  Replaces localStorage as the source of truth (localStorage stays as cache).
- Score submission = seed + move list; the server REPLAYS the run with the
  same engine to verify the score before accepting it (deterministic engine =
  cheap anti-cheat).
- Unlocks: global / per-level / friends leaderboards.

### 1.2 Resume-in-progress
- Closing the tab currently loses the run. Serialize GameState (plain object +
  Maps → needs a small (de)serialization layer) after every committed move;
  offer "Continue run" on launch.
- Design a versioned save schema deliberately (migrations), instead of the
  current ad hoc localStorage keys.

## Phase 2 — Quick wins (cheap, high value, can be done anytime)

### 2.1 Service worker / true offline
- Manifest exists but there is NO service worker: the "installed" app dies
  without network. The game is fully client-side, so asset caching gives
  complete offline play. Mind the update flow (prompt-to-refresh on new deploy).

### 2.2 Telemetry
- Level design is currently tuned blind. Add analytics for: tutorial step
  completion, per-level attempts/fails/clears, bust causes, cash-out usage,
  where players stop playing.
- This turns the CMS into a tuning loop: spot the level that kills everyone,
  soften it in the CMS, publish.
- Crash/error reporting (e.g. Sentry) + React error boundaries + defensive
  parsing of all stored data.

### 2.3 Committed test suite + CI
- Today's tests are ad hoc scripts that never enter the repo. Commit an engine
  unit-test suite (the pure engine makes this trivial) + a small e2e smoke,
  run on CI so regressions can't reach the live site.

## Phase 3 — Launch infrastructure (when committing to release)

### 3.1 CMS graduation
- Replace the GitHub-PAT publish + password gate with a small content API and
  real auth.
- Serve content at runtime (not baked into the bundle): content updates
  without redeploys.
- Content versioning + rollback.
- A STAGING environment. Today every push and every CMS publish goes straight
  to production (one broken publish already stopped a build — it failed safe,
  but the risk is structural).

### 3.2 Store packaging
- Capacitor wrapper (keeps the codebase): iOS + Android builds.
- Native polish: haptics on bank/bust/singularity, splash/icons, iOS WebAudio
  unlock + safe-area audit on real devices.
- Low-end device performance pass (the board is animated SVG — fine on modern
  phones, unproven on cheap Androids).

### 3.3 Product surface
- Settings screen: separate music/SFX volumes (implies adding actual MUSIC — 
  today all audio is synthesized SFX with a single mute), restore progress,
  credits, privacy.
- Localization: extend content.json per locale (the copy pipeline already
  supports it structurally).
- Accessibility beyond reduced-motion: font scaling, contrast check, screen
  reader coverage for menus.
- Legal: privacy policy, terms, GDPR/consent flow (required once analytics or
  ads exist).

## Phase 4 — Retention & growth (after the foundation)

- **Daily challenge**: everyone plays the same seed; per-day leaderboard.
  Nearly free thanks to the seeded engine.
- Streaks / daily rewards, built on accounts.
- Social: friend leaderboards, share cards (score + level + seed so friends can
  replay the exact board).
- Monetization if desired (IAP/ads SDKs, remote config, A/B) — deliberately
  last; nothing above depends on it.

---

## Suggested order of attack

1. Phase 2 first is legitimate (service worker, telemetry, CI) — small,
   independent, immediately valuable while the game is still being tuned.
2. Phase 1 (backend + accounts + resume) is the real project; scope it as one
   coherent effort since save schema, identity and sync interlock.
3. Phase 3 when a release date exists; Phase 4 after launch.

Nothing in this plan invalidates the prototype: the pure engine, the
content-driven levels and the CMS all carry through unchanged.
