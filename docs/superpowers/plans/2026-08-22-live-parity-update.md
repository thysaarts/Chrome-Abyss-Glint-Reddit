# Glint_reddit Live-Parity Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the competition freeze and bring the Reddit/Devvit build in line with the live web game — all rules, scoring, economy, campaign, characters, and the Broker duel — while excluding the heavy web-only surfaces (3D Ascent/DECOR, video cutscenes, Supabase accounts, online realtime, paywall, admin CMS).

**Architecture:** Glint_reddit is a hand-ported sibling repo (no shared git history). The port unit is the FILE: for each shared module, diff web (`/Users/thysaarts/Projects/nebulite-prototype/src/...`) against Reddit (`/Users/thysaarts/Projects/Glint_reddit/src/client/...`), port the web version, and re-apply the Reddit-only couplings listed in Global Constraints. Engine rules port test-first: the web test file is the spec — port it, watch it fail, then port the code.

**Tech Stack:** React 18 + Vite webview client, Hono server on `@devvit/web` (Redis), vitest. No new runtime dependencies are permitted by this plan.

**Spec:** This plan is its own spec; the source of truth for each port is the named web file/commit. Key commits: `ab35f4f` (Zenith wager), `a61284d` (forfeit + scope-aware dailies), `e05c47e` (daily refine rig), `e55bca2` (daily type wheel), `8552068`..`04a75a2` (YOU VS THE HOUSE + duel rulings), `72e3f55`..`b9f15c7` (faction packs + Themes tab), `656834b`..`3d4520c` (daily characters).

## Progress

- **2026-08-22 — Phase 1 COMPLETE + Task 10 pulled forward.** Task 1 `c23d3b5` (Zenith wager), Task 2 `2805265` (coreLocks), Tasks 3+5(engine)+6 `439c483` (Dross cap, tutorial rig, extraGems, runConfig pulled forward from Task 20), Task 4 `10fa144` (parity batch), Task 7 `40efa46` (daily economy; Task 5's UI/content half still open), Task 8 `e594c6e` (full forfeit — deviation: no server `forfeit` flag, enforcement lands with Task 20 replay), Tasks 9+10 `a8e6d6d` (save envelope v2 with NO-REMAP adaptation — this build was born post-renumbering; never-lose-ground saveSync merge; levels.json synced). Suite 112 green. Companion web fix `00c81d1`: Reddit imports stamped v2 (the v1 remap was shifting imported frontiers +1). NEXT: Phase 2 Tasks 11–12 (content.json merge, collection/factions — fold web's `resolveDailyReward` owned-reward display fix into Task 12), then Phase 3.

- **2026-08-22 — Phase 2 COMPLETE.** Task 11 `9f9c37c` (content.json merged from live — 31 sections, 10-type bank armed, Reddit-only content preserved, cashedOut kept over community; isolatedBanked engine log call ported; extraGems + tutorialRig run wiring closed out Task 5; refined-daily rig applied in startDaily). Task 12 `5d4eed7` (collection/music/sfx synced wholesale; faction packs in Shop + Collection with FactionCarousel/FactionDetail; extra-gem bar + duels-only LIFETIME row; resolveDailyReward on daily cards; ItemDetail/useSlideSwipe/PopupCard/CloseButton ported; faction-thumbs + avatars assets, 568K). Suite 112 green, build clean (dist 18M pre-Task-19 trim). NEXT: Phase 3 — Task 13 versus engine merge (tests first), then Broker AI, duel UI, daily characters.

- **2026-08-22 — Phase 3 COMPLETE.** Task 13 `0fd14be` (versus/co-op engine synced WHOLESALE — after Phases 1–2 aligned the solo systems the remaining diff was the multiplayer delta; hex squareTall, theme SEAT_COLORS, four web test files as spec). Task 14 `cf2726b` (brokerAI verbatim + self-play ladder). Task 15 foundation `0e1e6a0` (useNebuliteGame/trace/bankCeremony/Board/Panels wholesale; net/moves+seats ported; netMatch exists as the MatchMode type only). Task 15 `e75f37f` (duel UI, stakes, HER FACE, rulings, end-card versus table, promo card sans video; friends copy section RESTORED to content for the versus UI; Playwright smoke-tested — the Broker plays). Task 16 `a4b4b68` (DailyDetailPopup, DAILY CLEARED slides in both solo + duel settle paths, DailyChallengePopup sans paywall gate, broom glyph). Suite 178 green. NEXT: Phase 4 — Task 17 Settings›Themes, Task 18 small utils, Task 19 bundle trim, Task 20 (recommended) server replay verification, Task 21 release.

- **2026-08-22 — Phase 4 COMPLETE; v0.1.0 UPLOADED (publish pending playtest).** Task 17 `cbc1ab1` (Settings›Themes + in-game region/anthem swaps). Task 18 `158647a` (quick-play tips + web AcademyTips w/ Broker tutor, special-gems rows + GemDetail, StarField; DEVIATIONS: share.ts and ContinueGamePopup not ported — both are friends/online-only consumers). Task 19 `48da6db` (decor assets deleted, source maps stripped post-build; dist 18→12MB, under the 13MB baseline). Task 20 `de6a591` (game/daily.ts shared pure module pinned to the server's seed/rotation; daily now EXACT mode — closes a pre-update fairness gap where boards varied by difficulty/ability gems; server/verifyDaily.ts replays submitted move streams natively, forfeit enforced server-side, legacy plain scores still range-checked; DEVIATION: the all-time board stays range-checked — verifying campaign runs needs the RunSpec-path client refactor, a future project). Task 21 `7b57890`: v0.1.0, README note, final gate 181 green, `devvit upload` DONE. REMAINING: Thys playtests on chrome_abyss_glin_dev per the Task 21 checklist, then `npm run launch` to publish.

## Global Constraints

- **SKIP LIST (do not port):** three.js/3D Ascent/Book scenes + `public/models3d`; DECOR as a feature (Reddit keeps `decorRaw = []`); `IntroVideo`/`broker_cutscene.mp4`/`public/intro` (14 MB video); Supabase accounts/auth/humanGate; friends graph, inbox, `OnlineLobby`, `netMatch` realtime (Devvit fetch sandbox has no WebSockets); paywall/`tier.ts`/entitlements; `src/admin/*`; telemetry.
- **REDDIT-ONLY CODE TO PRESERVE on every port** (breaking any of these is a task failure):
  - `src/client/game/storage.ts` calls `scheduleSavePush()` directly in `writeStored`, `removeStored`, `writeVersioned`. The web build inverted this into `setSaveWriteHook(cb)` and dropped the push on `removeStored`. Porting web `storage.ts` verbatim silently kills Reddit save sync — keep Reddit's coupling (or port the hook pattern AND register it in `main.tsx` AND re-add the `removeStored` push).
  - `src/client/game/saveSync.ts` (`hydrateSave()` before app import in `main.tsx`; debounced `scheduleSavePush`; `visibilitychange` flush) and `src/client/game/redditDaily.ts` (community daily + Redis leaderboards).
  - `src/client/levels/levels.ts`: `levelScoreLabel` / `displayScoreLabel` + `levels/score-label.test.ts`.
  - `src/client/theme/theme.ts`: the `MineralShape` export.
  - `content.json` Reddit-only keys: the `academyIntro` section; `settingsScreen` export-code block (`advancedTitle, exportTitle, exportDesc, exportButton, exportBusy, exportCopy, exportCopied, exportError, noDecor, resetDecorSettings`); `collection` decor/shop label keys; `startScreen.footer` version string.
  - `devvit.json` HTTP allowlist stays exactly `kszcacyzyveytvjlrohk.supabase.co`.
- **Terminology:** Nebulite (never Core), Dross, DECOR, gem (web's tile→gem sweep). Player-facing strings live in `content.json` only — never hardcode.
- **Bundle budget:** new binary assets ≤ ~800 KB total (`avatars` 356 KB + broker portraits ~160 KB + `faction-thumbs` 212 KB); Task 19 reclaims 3.2 MB by deleting the shipped-but-disabled `public/decor`. No new npm runtime deps.
- **Green gate before every commit:** `npx vitest run` and `npm run typecheck` (both tsconfigs) in Glint_reddit.
- **Deploy flow:** `npm run build` → `npm run deploy` (typecheck + `devvit upload`) → `npm run dev` playtest on `chrome_abyss_glin_dev` → `npm run launch` (publish) only after the Task 21 checklist.
- **Push policy:** every commit is pushed to `origin/main` of `Chrome-Abyss-Glint-Reddit` immediately.
- **Achievements adaptation:** web's `community` achievement (live friend list) has no Reddit equivalent — Reddit KEEPS its `cashedOut` achievement; do not port `community` or `loadFriends`.
- **Milestones adaptation:** web's LIFETIME bottom row is duels/online-versus/co-op; Reddit shows **duels won only** (no online versus, no co-op in this plan).

---

## Phase 1 — Rules & scoring parity (lifting the freeze)

### Task 1: The Zenith wager (+3,000 played / +6,000 carried)

**Files:**
- Modify: `src/client/game/combos.ts` (add `ZENITH_PLAYED_BONUS = 3000` beside `ZENITH_BONUS = 6000`)
- Modify: `src/client/game/engine.ts` (`bankCluster` awards `ZENITH_PLAYED_BONUS` for a spent Zenith; `planZenithWild` re-ranked)
- Modify: `src/client/content/content.json` (`logTexts.zenithDealt` — copy the web string stating both numbers)
- Test: create `src/client/game/zenith-picker.test.ts` (port of web `src/game/zenith-picker.test.ts`)

**Interfaces:**
- Consumes: existing `place(state, ..., {preview})` engine API.
- Produces: `ZENITH_PLAYED_BONUS` export (Task 13's `versusClearShares`/bust-gift valuation reads it via `ZENITH_BONUS` semantics; Task 11 copy references the numbers).

- [ ] **Step 1:** Copy web `src/game/zenith-picker.test.ts` → `src/client/game/zenith-picker.test.ts`; fix import paths (`./engine`, `./combos` are same-relative). Run `npx vitest run src/client/game/zenith-picker.test.ts` — expect FAIL (single-bonus behaviour, flat `wildScore` ranking).
- [ ] **Step 2:** Port web's `planZenithWild` from `nebulite-prototype/src/game/engine.ts` — the full dry-run ranking: each banking candidate is scored via `place(..., {preview: true, zenithValue})`, keyed `1_000_000_000 + Δscore*1000 + tilesCleared`, memoised in a `WeakMap`; non-banking ties break on `totalTiles`. Port the `bankCluster` change awarding `ZENITH_PLAYED_BONUS` when the Zenith was spent into the combo and `ZENITH_BONUS` when carried unspent.
- [ ] **Step 3:** Update `logTexts.zenithDealt` in `content.json` to the web copy ("ZENITH dealt — a 'joker' gem worth +3000 to complete any combo. Unused +6000.").
- [ ] **Step 4:** `npx vitest run` (full suite — the ledger/end-tally tests must still pass) + `npm run typecheck`. Expect PASS.
- [ ] **Step 5:** Commit `port: the Zenith wager — +3,000 played, +6,000 carried (web ab35f4f)`; push.

### Task 2: Nebulite hand-joker coreLocks (bug046)

**Files:**
- Modify: `src/client/game/engine.ts` (state gains `coreLocks: Record<string, number>`; `lockedCoreValues` prefers `s.coreLocks[k] ?? val`; a hand-placed Nebulite records the exact value `planWild` chose; respawn clears the stale lock)
- Test: create `src/client/game/nebulite-drift.test.ts` (port of web file)

**Interfaces:** Produces the `coreLocks` state field — Task 13's versus merge and Task 9's save shape must carry it through serialization untouched (it lives in engine state, not storage).

- [ ] **Step 1:** Port web `src/game/nebulite-drift.test.ts` → run → expect FAIL (Drift completion locks to arbitrary first mineral).
- [ ] **Step 2:** Port the `coreLocks` mechanism from web `engine.ts` (search `coreLocks` — declaration, write on hand placement, read in `lockedCoreValues`, clear on respawn).
- [ ] **Step 3:** Full `npx vitest run` + typecheck → PASS. Commit `port: hand Nebulite locks the exact planned value — Drift fix (bug046)`; push.

### Task 3: Dross cluster cap (MAX_DROSS_CLUSTER = 2)

**Files:**
- Modify: `src/client/game/engine.ts` (initial seeding `drossClusterFits` walk — skipped cells fall to Nebulites; reshuffle board-drift may not settle a Dross into a blob of 3)
- Modify: `src/client/game/shrink.ts` (`capDrossClusters` — deterministic nudge to nearest legal free cell; new `drossValue`/`maxDrossCluster` inputs)
- Test: create `src/client/game/dross-cluster.test.ts` (port of web file — includes the long seeded-playthrough invariant)

- [ ] **Step 1:** Port the test → FAIL. **Step 2:** Port seeding + reshuffle + `capDrossClusters` from web (`MAX_DROSS_CLUSTER` symbol). Player-placed Dross stays legal — only dealt/drifted/collapsed Dross is capped. **Step 3:** Full suite (shrink-cohesion/conservation must stay green — they pin collapse invariants) + typecheck → PASS. **Step 4:** Commit `port: Dross clusters cap at 2 — seeding, reshuffle drift, collapse`; push.

### Task 4: Small engine-parity batch

**Files:**
- Modify: `src/client/game/engine.ts`, `src/client/game/activation.ts`, `src/client/content/content.json`

- [ ] **Step 1:** Port from web `engine.ts`: (a) reshuffle early-return `if (s.handRevealed) return false` — no queue shuffle once the wheel is revealed; (b) `canPlace` fast path for CORE/ZENITH ("any value forms a combo" without the full ranking); (c) delete dead `endStuck()` (unreferenced at `engine.ts:2590`) and the `logTexts.noLegalMove` content key; (d) make all in-play RNG state-carried (`stateRng`) exactly as web — this is the precondition for Task 20's server replay.
- [ ] **Step 2:** In `activation.ts` remove legacy `detectActivation`/`detectActivations` (unused; web deleted them — verify no Reddit-side references first with grep).
- [ ] **Step 3:** Full suite + typecheck → PASS. Commit `port: engine parity batch — revealed-hand reshuffle guard, wild fast path, dead code out`; push.

### Task 5: Extra gems (depth reward)

**Files:**
- Modify: `src/client/game/engine.ts` (`newGame({extraGems})`: up to 6 guaranteed-different minerals appended after the deal from an independent `makeRng(seed ^ 0x5eed1e)` so the board layout never shifts when a tier is crossed)
- Modify: `src/client/game/challenges.ts` (`extraGemTiers`/`extraGemsFor`/`extraGemsForLevel`/`extraGemProgress` — copy from web)
- Modify: `src/client/content/content.json` (`achievements.extraGem.tiers` from web content)
- Modify: `src/client/ui/AchievementsPage.tsx` (the NEXT-extra-gem progress bar, from web)
- Modify: run-start call sites in `src/client/App.tsx`/`useNebuliteGame.ts` (pass `extraGems: extraGemsForLevel(levelNum)`)

- [ ] **Step 1:** Port web `challenges.ts` extra-gem functions + the content tiers; port `newGame` extraGems dealing. **Step 2:** Wire call sites (mirror web `App.tsx` — search `extraGemsForLevel`). **Step 3:** Full suite + typecheck; manual check via `?seed=` that a board with and without a crossed tier deals identically apart from the appended gems. **Step 4:** Commit; push.

### Task 6: Tutorial rig + reveal rig

**Files:**
- Modify: `src/client/game/engine.ts` (`tutorialRig` best-of-8 seeded deals scored by `dealFriendliness`; `rigRevealHand` — up to 2 swaps toward the board's hungriest mineral + appetite re-sort)
- Test: create `src/client/game/rig.test.ts` (port of web file)

- [ ] **Step 1:** Port test → FAIL. **Step 2:** Port `tutorialRig`, `dealFriendliness`, `rigRevealHand` and their call sites (Academy/L1 run start; the daily "Most Nebulite refined" rig arrives with Task 12's daily metric work — note the web parity rule: campaign AND refined dailies both rigged). **Step 3:** Suite + typecheck → PASS. Commit; push.

### Task 7: Daily-challenge economy sync

**Files:**
- Modify: `src/client/game/challenges.ts` (full sync with web: type-wheel `pickDailyChallenges` with `dayNumber`/`rawWheel`/`dealTypes` + `bankOverride` param; `nobust` + `versus` objective types; `SET_BONUS_NEBULITE = 10`; `evalDailyForRun` nobust/scope special-case; achievement latching (`LATCH_KEY` union-merge set); frontier-based level achievements; pinned progress bars. KEEP Reddit's `cashedOut` achievement — do NOT import `loadFriends`.)
- Modify: `src/client/game/stats.ts` (add `duelWins`, `versusWins`, `noBustStreak`, `rushCount` etc. per web; `recordVersusWin()`; stop tallying `deepestLevel` in `recordRun`; `foldDaily` sum/max modes if missing)
- Tests: create `src/client/game/dailypick.test.ts` and sync `dailyfold.test.ts` from web

**Interfaces:** Produces `recordVersusWin()` (consumed by Task 15's duel end) and `SET_BONUS_NEBULITE` (consumed by Task 16's popups).

- [ ] **Step 1:** Port both tests → FAIL. **Step 2:** Sync `challenges.ts`/`stats.ts` per above (start from web files, re-apply the two Reddit adaptations: no friends import, keep `cashedOut`). **Step 3:** Wire the set-bonus payout at run end in `App.tsx` (web: `setDoneNow && !dailySetBonusGated()` pays `SET_BONUS_NEBULITE`). **Step 4:** Suite + typecheck → PASS. Commit `port: daily type wheel, nobust/versus objectives, set bonus, latched achievements`; push.

### Task 8: Game-over forfeit of competitive output

**Files:**
- Modify: `src/client/App.tsx` (a busted-out run submits NOTHING: skip `postScore` to `/api/score` and `postDailyScore` to `/api/daily/score` when the run ended in a bust with nothing cashed out — mirror web `App.tsx` forfeit gates; the partial `gameOver ? 0` nebulite-metric gate at `App.tsx:603` is subsumed)
- Modify: `src/server/index.ts` (belt-and-braces: `POST /api/score` and `/api/daily/score` accept a `forfeit: boolean` field; `forfeit === true` → 204 no-write. Extend `src/shared/api.ts` types.)
- Test: extend an existing App-level test or add a small unit for the gate predicate (`forfeitedRun = phase === "lost" && cashedOut === 0` — already present for Nebulite at `App.tsx:677`; reuse it)

- [ ] **Step 1:** Implement client gates using the existing `forfeitedRun` predicate. **Step 2:** Server + shared-api field. **Step 3:** Suite + typecheck; commit `port: bust-out forfeits ALL competitive output (web a61284d)`; push. (Design rule: only experiences — rush reached — survive a bust; score, bankscore, leaderboards, daily metrics all forfeit.)

### Task 9: Save-envelope parity + cross-device merge

**Files:**
- Create: `src/client/levels/renumber.ts` + `src/client/levels/renumber.test.ts` (verbatim from web: `SAVE_NUMBERING_V = 2`, `remapLevelNum` old 1–9 → +1 / old 10 → 11, `remapLevelKeys`)
- Modify: `src/client/levels/progress.ts` (v2 envelope + `migrateProgress`/`migrateResults`; `TOP_SCORES = 10`; `tutorialComplete()`)
- Modify: `src/client/game/puzzleintro.ts` (v2 envelope, filter old 10)
- Modify: `src/client/game/wallet.ts` (`SAVE_V = 2`, `at` epoch-ms field, newest-wins merge semantics)
- Create: `src/client/game/mergeSave.ts` (the pure `mergeSave` from web `src/game/importSave.ts` — progress→max, results→best, wallet→newest-wins via `at`, stats→per-field max/OR, collection→union; port its tests from `importSave.test.ts`, dropping the web-import wrapper)
- Modify: `src/client/game/saveSync.ts` (`hydrateSave()` becomes MERGE, not delete-then-apply: `merged = mergeSave(localSnapshot, serverSnapshot)`, apply merged, push if it differs from server)

**Interfaces:** Produces `mergeSave(local, remote): SaveMap` — Task 20's server work and any future export flow reuse it.

- [ ] **Step 1:** Port `renumber.ts` + test → PASS (pure). **Step 2:** v2 envelopes in `progress.ts`/`puzzleintro.ts` with migrate-on-read; port `progress-migrate.test.ts` + `levels-shape.test.ts` from web. **Step 3:** Wallet v2. **Step 4:** `mergeSave.ts` + tests → PASS. **Step 5:** Rewire `hydrateSave` to merge (keep the boot-order guarantee in `main.tsx` and the debounced push untouched). **Step 6:** Suite + typecheck; commit `port: save envelope v2, renumber migrate, never-lose-ground save merge`; push.

---

## Phase 2 — Content & campaign sync

### Task 10: Levels sync

**Files:**
- Modify: `src/client/levels/levels.json` (wholesale copy of web `src/levels/levels.json` — 50 of 101 levels differ: The Fortress moves index 10 → 3 re-specced, Outpost renamed Sector 01 Outpost, unlock thresholds re-tuned upward from ~L38, several boards re-specced)
- Preserve: `levels.ts` (`levelScoreLabel`/`displayScoreLabel`), `score-label.test.ts`

- [ ] **Step 1:** Copy web `levels.json`. **Step 2:** `npx vitest run src/client/levels` — `score-label`, `progress-gate`, `levels-shape` green. **Step 3:** Playtest sanity: existing progress keeps its frontier; the Fortress reorder shifts which historical result shows on which island — accepted (web took the same shift). Commit `content: campaign synced to live — Fortress at 3, L38+ retune`; push.

### Task 11: content.json merge

**Files:**
- Modify: `src/client/content/content.json`

- [ ] **Step 1:** Start from web `src/content/content.json` (4,936 lines). REMOVE web-only sections for skipped features: `friends`, `chat`, `account`, `paywall`, `world` (web's Supabase world-daily strings — Reddit keeps its own community-daily copy), `resumeGame` (arrives in Task 18 — keep if doing Task 18), `rotate` (keep only if porting RotateGate in Task 18). KEEP web sections needed by this plan: `restartDialog, cashOut, rushOverlay, rewardReveal, itemTypes, mineralDetails, endCard, overlays, hud, tabsBar, levelSelect, quickPlayTips, practiceTips, characters`.
- [ ] **Step 2:** Re-apply the Reddit-only keys (Global Constraints list): `academyIntro`, settings export block, decor/shop label keys, footer version. Re-add Reddit-only logTexts (`clearedLeftover`, `nebuliteLeftPenalty`) if still referenced (grep first); drop `noLegalMove` (Task 4).
- [ ] **Step 3:** Fill `logStickyKeys` with web's 11 keys; take web's tile→gem `logTexts`/`combos`/`minerals`/`howToPlay`, 13-key `tutorialLevel`, 36-key `challenges` (21-entry dailyBank, characterNames, voiceLines), 8-tier milestones, `collection` 52 keys (keep `achievements.rewards` `cashedOut`, not `community`).
- [ ] **Step 4:** Grep every `CONTENT.<section>` reference in the Reddit client against the merged JSON — no undefined sections. Suite + typecheck; commit `content: full copy sync with live (gem vocabulary, retuned dailies, characters)`; push.

### Task 12: Collection, shop, faction packs, music

**Files:**
- Modify: `src/client/game/collection.ts` (sync from web: `FactionPack` type + 7 packs, pack members hidden from plain shelves via `!t.pack`, sticker retunes, `itemPreview()`, `bolides` particle, `nobust` scope live-streak fix; KEEP `decorRaw` emptied and drop web's awardable-decor triggers)
- Modify: `src/client/audio/music.ts` (sync — faction anthems; all synthesized, no assets)
- Modify: `src/client/ui/ShopPage.tsx`, `src/client/ui/CollectionPage.tsx` (faction-pack shelf + swipeable pack pop-up: Shop all 7 / Collection owned)
- Modify: `src/client/ui/AchievementsPage.tsx` (8-tier milestones render; LIFETIME bottom row shows **duels won only**)
- Create: `src/client/ui/useSlideSwipe.ts` (port from web — shared swipe gesture, also used by Task 16)
- Add assets: `public/faction-thumbs/` (212 KB from web)
- Modify: daily "Most Nebulite refined" community-daily metric gets the campaign refine rig (web `e05c47e`; uses Task 6's rig)

- [ ] **Step 1:** Sync `collection.ts` (re-apply Reddit decor adaptations) + `music.ts`; suite green. **Step 2:** Port shop/collection UI + `useSlideSwipe`; copy faction-thumbs. **Step 3:** Refine-rig the `refined` community-daily metric via `redditDaily`'s daily run setup. **Step 4:** Suite + typecheck + `npm run build` (watch bundle delta); commit `port: faction packs, shop wave, 8-tier milestones, refined-daily rig`; push.

---

## Phase 3 — YOU VS THE HOUSE + characters

### Task 13: Engine versus merge (the 950-line delta)

**Files:**
- Modify: `src/client/game/engine.ts` (port from web: `versus` + `coop` state blocks — port both, co-op UI stays unshipped; `versusEndTurn`/`coopEndTurn`/`claimCluster`/`offerCashOut`/`resolveCashOut`; `versusClearShares(bonus, winnerTakesAll)` → `[bonus, 0]` duels else `[floor(bonus/2)+1000, ceil(bonus/2)]` + clearer doubles banked Nebulite; bust-as-gift at face value `t===CORE ? CORE_BONUS : t===ZENITH ? ZENITH_BONUS : t*100`; `bustSafeCells` — the OPPONENT's claim survives your bust, your own does not (Thys ruling 2026-08-21); claims are hard boundaries for combos/counting/banking/naming via `opponentClaimSet`; per-seat `EndSummary`; personal vs mutual cash-out)
- Modify: `src/client/game/hex.ts` (`squareTall` 126-cell shape; `boardClearBonus` → `BOARD_CLEAR_BONUS_SQUARE`)
- Modify: `src/client/theme/theme.ts` (add `SEAT_COLORS`, keep `MineralShape`)
- Tests: create `src/client/game/versus.test.ts`, `versus-clear-shares.test.ts`, `zenith-versus.test.ts`, `coop.test.ts` (ports — these ARE the spec; port FIRST)

**Interfaces:** Produces the versus engine API (`versusEndTurn`, `claimCluster`, seat state) consumed verbatim by Tasks 14–15.

- [ ] **Step 1:** Port all four test files → FAIL. **Step 2:** Port the engine delta by diffing web `engine.ts` against Reddit's and applying the versus/coop hunks (they are additive blocks; the Task 1–6 ports have already aligned the shared parts, keeping hunks clean). **Step 3:** Full suite → PASS, typecheck both configs. **Step 4:** Commit `port: versus/co-op engine — claims, bust-gift, clear shares, squareTall`; push.

### Task 14: Broker AI

**Files:**
- Create: `src/client/game/brokerAI.ts` (verbatim from web — 276 lines, pure over the engine, injected rng, documented fair-information contract: never reads the player's hand)
- Test: create `src/client/game/brokerAI.test.ts` (port; the self-play ladder test is slow ~10 s — keep it)

- [ ] **Step 1:** Copy file + test; fix relative imports. **Step 2:** `npx vitest run src/client/game/brokerAI.test.ts` → PASS (every tier finishes real games; tier 3 outplays tier 1). **Step 3:** Commit `port: the Broker plays herself — three-tier AI (fair-information contract)`; push.

### Task 15: House Duel UI + duel rulings

**Files:**
- Create: `src/client/ui/HouseDuel.tsx` (from web, 189 lines), `src/client/ui/BrokerPromo.tsx` (from web MINUS the `<video>`/cutscene — the promo card works without it), `src/client/ui/TutorAvatar.tsx`
- Modify: `src/client/App.tsx` + `src/client/ui/Tabs.tsx`/`ChallengesPage.tsx` (duel entry: HOUSE panel beside WORLD on the challenges slider — web `d0cf65b`; wallet stakes 10/20/30; Exit before first move refunds in full `7300027`; Restart re-stakes or drops to tier 1 or greys out `9d4a7a8`; duel clear bonus winner-take-all + end card reads the MATCH ending `97170e0`; versus Zenith belongs to who EARNED it `04a75a2`; no champion at the duel table `001fe18`; duel end card gem-fronted names `c6e9791`)
- Modify: `src/client/ui/Tutorial.tsx`/`TutorialLevel.tsx` surroundings (the Broker fronts the Academy opener, opt-out confirm, last two tutorial pop-ups, How to Play hex — web `52a2b9a`, `c291b8a`, `168db3c`)
- Add assets: 5 Broker portraits + `broker-lg.webp` (~160 KB from web `public/avatars`)
- Consumes: Task 13 engine API, Task 14 `brokerAI`, Task 7 `recordVersusWin`

- [ ] **Step 1:** Port `HouseDuel.tsx` + wiring; content `characters` section (Task 11) supplies copy. **Step 2:** Apply each listed ruling; where web App.tsx structure diverges, port behaviour not structure. **Step 3:** Duel end calls `recordVersusWin()`; duels feed the `versus` daily objective and the duels-won milestone row. **Step 4:** Suite + typecheck + playtest a full duel at each tier on `?seed=`; commit `port: YOU VS THE HOUSE — Broker duel, stakes, rulings`; push.

### Task 16: Daily characters (issuers, detail + cleared popups)

**Files:**
- Create: `src/client/ui/dailyCharacters.ts` (issuer map — web remap `5bb8101`: clear → Sentinel, banks → Outlaw, versus → Broker), `src/client/ui/DailyDetailPopup.tsx` (swipes between the three challenges — shared `useSlideSwipe`), `src/client/ui/DailyClearedPopup.tsx` (avatar leads, title below — layout per `3489942`; swipeable slides `b30c62a`; set-bonus row flush `6d177e7`)
- Modify: `src/client/ui/ChallengesPage.tsx` (avatars lead every daily row `656834b`; rows open the detail popup `6e6892f`), `src/client/ui/Glyphs.tsx` ('clear' brush → BROOM `038b65a`), `src/client/App.tsx` (run-end DAILY CLEARED celebration `3d4520c`)
- Add assets: `public/avatars/` (356 KB — 7 characters × sm+lg)

- [ ] **Step 1:** Copy avatars; port the three files + row/popup wiring. **Step 2:** Voice lines and names come from `content.challenges` (Task 11). **Step 3:** Suite + typecheck + playtest: complete a daily via `?seed=`, see the issuer celebration; commit `port: daily characters — issuers front rows, detail + cleared popups`; push.

---

## Phase 4 — Settings, polish, platform hygiene

### Task 17: Settings › Themes tab

**Files:**
- Modify: `src/client/ui/SettingsPage.tsx` (or Reddit's settings component — sync web's Themes tab: generic board/track pickers, per-region faction swaps `b9f15c7`, bare "Reset all to standard" `c328da2`; KEEP the Reddit export-code section and decor settings block)

- [ ] Port, suite + typecheck, playtest theme swap persists via saveSync, commit `port: Settings › Themes — pickers, faction swaps, reset-all`; push.

### Task 18: Small utilities batch

**Files:**
- Create: `src/client/ui/StarField.tsx` (42-line CSS starfield — NO canvas/WebGL — behind feature tabs), `src/client/ui/GemDetail.tsx` (swipeable gem drill-down), `src/client/ui/share.ts` (share-vs-copy), `src/client/game/quickplay.ts` (3 one-time Quick Play briefings), `src/client/ui/ContinueGamePopup.tsx` (session-once resume prompt `c457806` + `resumeGame` content section)
- Modify: mount points in `App.tsx`/pages per web

- [ ] Port each (all ≤ ~150 lines, zero deps), suite + typecheck, commit `port: starfield, gem detail, share, quick-play tips, continue-game`; push.

### Task 19: Bundle hygiene

**Files:**
- Delete: `public/decor/` (3.2 MB shipped but decor is disabled), `public/decor-thumbs/` if unreferenced (grep first — Collection may still render 2D backdrop thumbs; delete only what nothing references)
- Modify: `vite.config.ts` (stop emitting `.map` files into `dist/client` for upload builds)

- [ ] **Step 1:** Grep references, delete dead assets. **Step 2:** `npm run build`; record before/after `du -sh dist/client`. Target: smaller than the 13 MB baseline despite ~800 KB of new avatars/thumbs. **Step 3:** Commit `bundle: drop disabled decor assets, stop shipping source maps`; push.

### Task 20 (recommended, can ship after launch): Server-side replay verification

**Files:**
- Create: `src/client/game/runConfig.ts` (port — pure, no window/localStorage) + move-stream recording per web `src/net/moves.ts`
- Modify: `src/server/index.ts` (`POST /api/score` + `/api/daily/score` accept `{spec, moves}`; the server replays through the same pure engine — it can import `src/client/game/engine.ts` directly since both compile in-repo — and writes only the replayed score; forfeit enforced server-side)
- Modify: `src/shared/api.ts` (submission types)
- Also: move `REDDIT_IMPORT_SECRET` out of source into a Devvit setting if `@devvit/web` now surfaces settings; otherwise rotate the constant.

- [ ] Port `runConfig` + recording; server replay endpoint behind a version flag (old clients' plain submissions still accepted until the new client is fully rolled out); tests: port `daily-replay.test.ts` replay-parity spirit against the local engine. Commit; push.

### Task 21: Release

- [ ] **Step 1:** Bump `package.json` version to `0.1.0`; note in README that the freeze is lifted.
- [ ] **Step 2:** `npm run build` → `npm run deploy` → playtest on `chrome_abyss_glin_dev`: full Academy run, a campaign level ≥ L38 (retuned threshold), all three dailies + set bonus, a Broker duel per tier, faction pack purchase, theme swap, save round-trip across two sessions, export-code flow, community daily submit (clean and busted run — busted must not appear on boards).
- [ ] **Step 3:** `npm run launch` (devvit publish). Tag `v0.1.0`; push tags.

---

## Explicitly OUT of this plan (and why)

- **3D Ascent/Book/DECOR scenes** — 1.14 MB JS chunk + 129 MB GLB + three.js/fiber/drei/postprocessing deps; the Reddit build's 2D map IS web's own non-WebGL fallback path.
- **Video cutscenes** (intro 7.7 MB, Broker 6.3 MB) — webview time-to-first-frame; Devvit allowlist would force hosting them on Supabase storage anyway.
- **Supabase accounts/profiles/human-gate** — Reddit identity is native and better. The SVG avatar picker (`avatars.ts`/`AvatarGem.tsx`) could come later as a cosmetic on top of Redis if wanted.
- **Online co-op/versus, friends graph, inbox, lobby** — needs Supabase Realtime WebSockets, which Devvit's fetch sandbox doesn't allow; a Redis-polling rewrite is a separate project. The Broker duel supplies the versus experience locally. The **beat-my-board codec** (`challenge.ts`, pure) is a natural future Reddit-post feature — good post-launch candidate.
- **Paywall/monetisation** — dark on web, Supabase-entitlement-bound; Devvit payments would be a from-scratch integration.
- **Admin CMS + telemetry** — authoring/analytics stay web-side; content flows to Reddit via this repo's bundled JSON as today.
- **Splash animated wordmark** (1.6 MB webp) — nice-to-have vs bundle budget; revisit post-launch.
