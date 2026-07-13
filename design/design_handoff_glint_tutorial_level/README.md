# Handoff: Chrome Abyss — Glint · **Tutorial Level (Level 0, scripted)**

> A **fully scripted, interactive tutorial level** — every action predetermined, the player follows along. Played on the smallest board (**37 tiles**, hex radius 3). This bundle contains a **working prototype** of the whole flow plus this spec. (Game rules & UI: master `design_handoff_glint`; depth styling: `design_handoff_glint_depth`.)

---

## About the design files
HTML **design reference / working prototype** — recreate in the target codebase (**React, web**). `support.js` is the prototype runtime — **do not port**. Open **`Glint Tutorial Level.dc.html`** in a browser and play it through: every step, gate, animation and retry loop works.

## Fidelity
**High-fidelity** — layout, colours, and the full interaction script below are production targets.

---

## Screen anatomy
**Identical to the real in-game screen** (depth style, portrait) — players learn the game AND the UI at once: top bar (CHROME ABYSS kicker + GLINT wordmark left; **mute · Help · Exit** beveled buttons right — no tutorial-specific chrome) · score row (SCORE / BANKS ◆◆◆ / BUSTS ♥♥♥) · toast slot · the 37-cell extruded board, **tilted in perspective** (`rotateX ~13–15°` slow sway) with a cast-shadow ellipse · **BANK NOW as a glass overlay sitting on top of the score row** (blurred dark plate, gold ring + label — exactly where it appears in the live game) · the game's **5-section footer** (RESTART · UP NEXT hex-stack with count · **NOW PLACING** centre, gem levitating above the bar with label above and name below · COMBOS ⓘ · LOG) · **tutorial text panel** (the only tutorial-specific element: violet-tinted card, `TUTORIAL` kicker, step counter `n / 18`, body text, and a **square arrow button** — icon-only, 44px, so the text keeps maximum width; it reads as Next/Continue/Replay via the step).

## The board (37 cells)
Hex grid, radius 3 (axial coords, `|q|,|r|,|q+r| ≤ 3`), flat-top cells, extruded prisms (depth pass). Cell pitch in the prototype: `x = 150 + 39q`, `y = 158 + 45(r + q/2)` at 52×51px per cell.

## Tile-state vocabulary (tutorial-specific)
| State | Visual |
|---|---|
| **Combo hint** (blue outline) | `#4da3ff` 2.6px stroke + 8% blue fill — marks the existing combo being taught |
| **Target** (place here) | brighter `#a8dcff` 3px stroke + 16% fill, **pulsing** (1.1s), double ring — the only tappable cell when a step forces placement |
| **Activated** | white 2.8px ring (standard) |
| **Banking** | gold ring flash → tiles fly up to the score, staggered 55ms |
| **Value numbers** | small `#a8dcff` chips above tiles (step 9 only) |
| **Multiplier badge** | gold `×N` chip popping at board centre |
| **Banner plate** | COMBOS / BANKING / BUST / RESHUFFLE — blurred dark glass plate, `tBanner` smash-in (same recipe as Motion v2; violet / gold / red tints) |

## Gating model (state machine)
One `step` integer (0–17) drives everything. Three gate types:
- **Button-gated** — text + **Next** (steps 0, 2, 3, 5, 6, 9, 11, 14, 16, 17). Board is inert.
- **Forced placement** — exactly one **target** cell is tappable (steps 1, 4, 7, 8, 10); all other input ignored.
- **Free placement** — any occupied cell tappable (steps 12, 15).

**BANK NOW states:** `hidden` · `disabled` (visible, 38% opacity, not-allowed cursor — step 2) · `armed` (pulsing, clickable — step 13; **frozen**: the 3-2-1 countdown ring is decorative and never expires — if the countdown ends the banner stays until clicked).

---

## The script (18 steps)

**Board A** (start): balanced 37 tiles, **no Dross / no Nebulite**. Must contain: 3 connected **Chromite** (`0,-2 · 0,-1 · 1,-2`), 2 connected **Umbrite** (`0,1 · 1,0`) one tile away, a **Nuracite** between the groups (`0,0`). Empty-adjacent Duneglass at `-1,-1` is the Quad target. Hand: **Chromite**; UP NEXT 8.

| # | Gate | Text (verbatim) | Board / system behaviour |
|---|---|---|---|
| 1 | Next | "In this game, you are trying to collect as many gems and minerals as you can. You do so by creating a combo. Let's try and make a combo with your Chromite tile." | — |
| 2 | Forced `-1,-1` | "There's already three Chromite tiles connected on the board. Let's turn it into a Quad. Place your tile on the highlighted spot." | 3 Chromite get **blue combo hint**; Duneglass `-1,-1` becomes the pulsing **target** (NOT the Nuracite). Placement must not form any other combo. |
| 3 | Next | "You have now activated a combo on the board. And you replaced your Chromite tile with the Duneglass piece on the board, which went into your hand." | Quad activates (white rings ×4). Hand becomes **Duneglass**… |
| 4 | Next | "But a combo of less than 6 tiles isn't enough to bank. So, let's make another combo. Let's see where you can place this Umbrite gem." | **BANK NOW appears disabled** (unclickable). Hand advances to **Umbrite**. Umbrite pair gets blue hint; Nuracite `0,0` becomes the target. |
| 5 | Forced `0,0` | "Perfect! There's a pair of Umbrite gems close to your Quad of Chromite. Place your **Umbrite** gem onto the highlighted spot." *(script said "Vigilite" — corrected: the hand gem is the Umbrite from step 3's replacement chain)* | Placing on the Nuracite links Quad(4) + placed(1) + pair(2) = **7 tiles → auto-bank**. `×6` badge (Nuracite multiplier), gold flash, tiles fly to score, **+4,200**. Replaced Nuracite does NOT enter the hand. |
| 6 | Next | "You have connected two combos. Notice how the tile you replaced did not go into your hand this time. It is used as a multiplier for your Convergence combo. A Nuracite is worth 6, the highest value!" | — |
| — | auto | — | **Clear & refill** to Board B: tiles shrink out staggered, **COMBOS** banner (violet plate, ~2s), new tiles drop in staggered. |
| 7 | Next | "Let's talk about Combos. You just banked a Quad and a Trips. These are combos of tiles of the same kind. You can also make combos that include tiles of different kinds. For example, a Drift." | **Board B** contains: a **Drift** Duneglass→Vigilite→Chromite→Verdite (`-2,0 … -2,3`) whose Duneglass end is adjacent to 2 more Duneglass (`-1,0` target + `0,0`) for the later **Accord**; and a **Full Drift** 1–6 (`1,-3 … 1,2`). Hand: **Verdite**. |
| 8 | Forced `-2,3` | "Let's replace your Verdite gem with the Verdite gem in this combo. That way, you activate this Drift on the board. Place your gem on the highlighted spot." | Drift (4 cells) blue-hinted; its Verdite is the target. |
| 9 | Forced `-1,0` | "A Drift is a run of four tiles and gems that form a straight. Look at the numbers above these tiles. You can easily work out a tile's value by counting its points. Now, place your Duneglass on the highlighted tile." | **Value chips 1·2·3·4** appear above the Drift tiles. Hand is Duneglass (from step 8's replacement). Target `-1,0` connects Drift's Duneglass to another Duneglass → Trips. |
| 10 | Next | "Now, you created an Accord. An Accord consists of a Drift and a set-combo, in your case a Trips of Duneglass. Because this is exactly 6 tiles, it's banked automatically." | 6 tiles auto-bank, `×2` badge, **+1,400**. |
| 11 | Forced `1,2` | "Your next gem is a Nuracite. Notice there's a Full Drift on the board already. Let's claim it by replacing the Nuracite gem in the Full Drift with yours. Place your gem in the highlighted spot." | Full Drift (6 cells) blue-hinted; its Nuracite is the target. Replacement must not trigger any other combo. |
| 12 | Next | "A Full Drift is already 6 tiles, so it banks immediately. Remember that this will happen automatically for every combo or chain of 6 tiles and more." | Auto-bank, `×6`, **+4,800**. |
| — | auto | — | **Clear & refill** to Board C, **BANKING** banner (gold plate). **Board C** (central cluster only): 4 connected **Vigilite** (`0,-1 · 1,-1 · 0,0 · -1,0`), 1 connected **Umbrite** (`1,0`), plus **2 Duneglass** (`0,1 · -1,1`) *(script said 1 — two are needed so two tiles remain after the free bank for the final bust)*. Hand: **Vigilite**. |
| 13 | **Free placement** | "Now, let's see if you can claim a combo of Vigilite tiles. Go ahead and place your gem on the board." | No highlights. **Success** = placing on the Umbrite or a Duneglass (adjacent → 5-tile Pentad activates). **Failure** = placing on a Vigilite (breaks nothing, no combo) → **BUST animation, then the board resets to Board C and this step restarts**. Loop until success. |
| 14 | **Tap BANK NOW** | "Well done. Now, let's bank this combo immediately. Notice the BANK NOW banner that appears at the top with a countdown. You usually get 3 seconds to decide if you want to bank. Click it!" | BANK NOW **armed + pulsing, frozen** — countdown ring never expires; banner persists until clicked. Clicking banks the Pentad (`×5` if the Umbrite was replaced), e.g. **+2,500**; BANKS pips 3→2. |
| 15 | Next | "You have now banked a combo yourself, without waiting for the 6+ threshold. You get this free bank 3 times per game, so use it wisely. It's best to wait till later in the game to spend it." | — |
| 16 | Free placement | "Your next tile seems to be incompatible. You can try to place it anywhere, but unfortunately, there's no match or Drift to make, so you will Bust!" | Hand: **Verdite** — incompatible with the 2 remaining tiles. Any placement → **normal BUST sequence** (shake, red plate, BUSTS 3→2) → **RESHUFFLE** banner → pause. |
| 17 | **Continue** | "You can Bust 3 times in one game and then it's game over. Do you think you are ready to try it out yourself now? Click Continue when you're ready." | Continue → board resets to a fresh 37-tile Board A, normal game begins (prototype shows a completion toast "Tutorial complete · The Basics unlocked" + Replay). |

### Script corrections applied (flag to content owner)
1. **TEXT 5** said *"Place your Vigilite gem"* — the gem in hand at that point is **Umbrite** (hand chain: Chromite → Duneglass → Umbrite via replacements). Copy updated to "Umbrite".
2. **Board C** needs **2 Duneglass** (script said 1) so that after the Pentad banks, **two** tiles remain for the guaranteed final bust; with 1, the last placement would leave a single orphan tile edge-case.

## Scoring used in the prototype (indicative)
Convergence (Quad+Trips, 7 tiles, ×6 Nuracite) **+4,200** · Accord (Drift+Trips, ×2) **+1,400** · Full Drift (×6) **+4,800** · Free-banked Pentad (×5 Umbrite) **+2,500**. Real values come from the game's scoring engine — the teaching beats are what matter.

## Implementation notes
- Model as a **step state machine** (0–17) with three gate types (button / forced-cell / free) — the prototype's `onCell`/`next`/`bankNow` handlers map 1:1.
- Forced steps: ignore all input except the target cell; keep the target pulsing.
- The retry loop (step 13) must **fully reset Board C and the hand** on failure — busts during practice do **not** consume a life; the final scripted bust (step 16) **does**.
- Clear/refill: stagger tiles out (~22ms/cell), banner plate ~2s, stagger new tiles in with a drop-bounce.
- Value chips (step 9) belong to the tutorial layer, not the board component.
- Tutorial completion should mark **Level 1 · The Basics** unlocked (see Level Select handoff) and hand off into a normal Level-0 run.
- Text panel content animates per step (fade/rise, ~300ms); keep texts verbatim from the table.

## Files
| File | What it is |
|---|---|
| `Glint Tutorial Level.dc.html` | **The scripted tutorial prototype** — all 18 steps playable, with gates, banners, retry loop, frozen bank. Start here. |
| `Gem.dc.html` | Faceted gem component. |
| `favicon.svg` · `support.js` | Icon · prototype runtime (**do not port**). |
