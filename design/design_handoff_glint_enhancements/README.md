# Handoff: Chrome Abyss — Glint · **Enhancements & Motion v2**

> This bundle covers the **latest enhancements** to the in-game screen — a redesigned footer, the Foundry tile background, a bigger touch-reactive board, and a set of "make it feel alive" motions. (Full game spec lives in the master `design_handoff_glint` bundle; core beats in `Glint Motion.dc.html`.)

---

## Overview
The in-game screen was made **more legible and more alive** — closer to a premium match-3 in *feel* while keeping the tech / sci-fi look. Four changes:
1. **Redesigned footer** (the control bar under the board).
2. **Foundry tile background** (the cell wells).
3. **Bigger, touch-reactive board**.
4. **More motion overall** (a new enhancements showcase).

## About the design files
HTML **design references / working prototype** — recreate in the target codebase (**React, web**), not ship as-is. `support.js` is the prototype runtime — **do not port**. Open **`Screen.dc.html`** (the in-game screen) and **`Glint Enhancements.dc.html`** (looping motion demos) in a browser.

## Fidelity
**High-fidelity.** Final layout, colour, type, and motion timings.

---

## 1 · Redesigned footer (control bar)
A **5-section footer menu** (`panel`, radius 24). Left→right: **Restart** · **Up next** · **NOW PLACING** · **Combos (ⓘ)** · **Help (?)**.
- The four outer items (**Restart, Up next, Combos, Help**) are **equal-width sections** (`flex:1`), styled like a footer/tab menu: a 42px rounded icon tile (`panel-hi`, `border`, radius 13) + an 8.5px label. Press feedback: `:active` → `scale(.9)` + accent border.
- **Up next** is a **stack of three hexagon tiles** (overlapping, back ones dimmer, front in accent) with the remaining-tile **count** in `accent`; it bobs gently (idle float).
- **NOW PLACING is the centred focal point**: an 84px slot (radius 24) raised **~34px above the bar** (`margin-top:-34px`), with an `accent` ring and a **pulsing glow** (`npPulse`, 2.6s). A radial `accent` **glow shape sits behind it** in the bar to pull focus. Holds the current gem (64px) + its name.

> Desktop equivalent: small **Restart / ⓘ / Help** icon buttons on the **left of the LOG** panel; NOW PLACING / UP NEXT stay in the hand panel.

## 2 · Foundry tile background (cell wells)
The board cells use the **Foundry slate well** (the 1A treatment the team preferred) instead of the near-black Abyss well — while the page/atmosphere stays Abyss (1B). Each well:
- base **`#181a23`** (lifted slate, reads as a recess on the near-black board),
- a **lighter top-left facet** `#2a2e3a` @ .42 and a **darker bottom-right facet** `#000` @ .2 (recessed, lit-from-top-left),
- **`#2c2f3c`** hairline stroke.
No per-cell violet glow (kept only as a faint board-wide radial). Applies in `Board.dc.html` (board) and `Cell.dc.html` (legend/showcase wells).

## 3 · Bigger, touch-reactive board
- The board is **scaled up to fill the screen width** — its edges reach the sides (base `scale(1.08)`), maximising legibility.
- **Reacts to touch:** on `pointerdown` it springs to **`scale(1.17)`** (transform-origin centre, `.36s` spring `cubic-bezier(.34,1.26,.5,1)`) and settles back on release — the board "leans in" for the interaction, plays the moment, then zooms back out. (State: `pressed`.)
- **At rest:** a gentle **idle breathe** (`scale 1↔1.015`, 7s) and a slow **sheen sweep** across the surface.

## 4 · More motion (`Glint Enhancements.dc.html`)
A separate showcase of the "alive" motions (all looping, with timing/easing captions):

| Enhancement | What it does | Timing |
|---|---|---|
| **Board reacts to you** | slight zoom-in on touch + idle breathe + sheen | press 1.08→1.17 · spring |
| **Glimmer & shimmer** | slow specular sweep across the board; scattered tiles **twinkle** on their own clocks | sweep 6s · twinkle staggered |
| **A living footer** | NOW PLACING breathes/glows; side buttons springy press + idle bob | pulse 2.4s · press spring |
| **Cascade & refill** | after a bank, replacement tiles **drop in with a staggered bounce** (match-3 cascade) | drop 300ms · 80ms stagger · spring |
| **Score that rewards** | the score **counts up & pops** on a bank while the tile flies into it | count-up 600ms · pop |

Keyframes used (see the files): `npPulse`, `breathe`, `sheen`, `floaty` (Screen); `zoomReact`, `ripple`, `glimSweep`, `twk`, `btnLife`, `dropIn`, `scorePop`, `flyScore` (Enhancements). The board's per-tile twinkle is `bglim` in `Board.dc.html`.

---

## Design tokens (essentials — full set in the master bundle)
Surfaces bg `#07080f` · panel `#0e1018` · panel-hi `#15182a` · **well `#181a23`** · border `#2a2748` · accent `#c084fc` · gold `#e8b53f` · good `#34d98b` · bad `#ff5a76`. Type: Chakra Petch / Saira / Share Tech Mono. Radii: footer 24 · NOW PLACING slot 24 · icon tiles 13.

## Files
| File | What it is |
|---|---|
| `Screen.dc.html` | The in-game screen — **redesigned footer + bigger touch-reactive board** (template + logic). |
| `Board.dc.html` | The hex board — **Foundry wells + per-tile glimmer** (one performant SVG). |
| `Cell.dc.html` | Hex well + gem + state rings — Foundry well. |
| `Gem.dc.html` | Faceted gem component. |
| `Glint Enhancements.dc.html` | **Motion showcase** for the enhancements (looping demos + timings). |
| `Glint Motion.dc.html` | The core beats (bank / bust / collapse / reshuffle / countdown) — context. |
| `favicon.svg` | Gem favicon. |
| `support.js` | Prototype runtime only — **do not port**. |

## Implementation notes
- Drive the board press-zoom from real pointer/touch on the board container; keep the spring easing so it feels physical.
- The board renders as one SVG in the prototype for performance — in React, render one memoised gem component per cell and animate via your motion lib.
- Glimmer/twinkle should be sparse and slow — quiet life between moves, never noisy.
- Keep the look tech/sci-fi; it's the **motion** that brings the match-3 liveliness.
