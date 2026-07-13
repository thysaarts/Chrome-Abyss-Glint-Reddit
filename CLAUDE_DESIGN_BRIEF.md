# Claude Design Brief — Chrome Abyss: Glint (mobile game UI)

## What I need from you

A complete **visual UI design** for a mobile-first puzzle game called **Chrome Abyss:
Glint**. There is already a working prototype (logic complete, but the look is plain and
functional). I want you to design the proper game interface: the in-game screen, the HUD, the
tiles, the animations' key states, the end-of-game screen, and the supporting panels — as a
polished, cohesive visual system I can then hand to a developer to build.

Deliverables I'd love: a designed **in-game screen** (portrait, mobile), the **end-of-game
summary**, the **tile/gem set**, and the **HUD components**, plus a small **style sheet**
(colours, type, spacing, component states). Desktop/tablet variants are a bonus.

---

## The game in one paragraph

Glint is a single-player, push-your-luck combo puzzle. You clear a **hexagonal board of
mineral gems** by placing gems from a hand. Placing a gem next to matching gems **activates a
combo** (e.g. three-of-a-kind), which glows; when a connected group of activated gems reaches
6+, it **banks** (scores and clears). The tension is risk: if a gem you place can't form a
combo, you **bust** and lose your built-up group. You have limited lives and a few "bank early"
safety nets. Midway through, the board dramatically **shrinks**. It's tactile, gem-y, and a
little tense — think a calmer, more deliberate cousin of match-3, with a sci-fi mineral theme.

**Tone:** premium, clean, sci-fi but not garish. Tactile gems. Satisfying, weighty feedback on
banks; sharp, punchy feedback on busts and the board shrink. It should feel like a polished
indie mobile puzzler, not a loud free-to-play title.

---

## Existing visual identity (please build on this)

The game is part of the **Chrome Abyss** universe and follows the **Chrome Abyss: Squads**
style guide. Please keep continuity with it:

- **Accent colour:** purple — `#aa3bff` (light mode) / `#c084fc` (dark mode).
- **Light + dark modes**, switched automatically by system preference. Design both if you can;
  dark is the "hero" look.
- **Type:** currently system-ui (clean, neutral sans). You may propose a display face for the
  logo/headers and big moments (e.g. the score, the "SHRINKING" callout), but keep body text a
  clean readable sans. UK English throughout.
- **Surfaces:** subtle borders, soft shadows, rounded corners (cards ~18–22px radius). Calm
  panel backgrounds, not heavy gradients.

**Current palette (dark mode), for reference — feel free to refine:**

| Token | Dark | Light | Use |
|---|---|---|---|
| background | `#16171d` | `#ffffff` | page |
| panel | `#1b1c24` | `#faf9fb` | cards, HUD boxes |
| panel-hi | `#22232d` | `#f4f3ec` | raised surfaces |
| border | `#2e303a` | `#e5e4e7` | hairlines |
| accent | `#c084fc` | `#aa3bff` | brand, buttons |
| good | `#34d98b` | `#1aa564` | success / board cleared |
| bad | `#ff5a76` | `#e23b5a` | bust / danger / lives |
| bank (gold) | `#e8b53f` | `#c98a00` | score, banking, free-bank pips |
| text | `#f3f4f6` (high) / `#8b91a0` (dim) | `#08060d` / `#8b8494` | text hierarchy |

---

## The gems (this is the centrepiece — please design these)

Six mineral types. **Shape encodes value** (this is a core gameplay reading, so shapes must be
instantly distinguishable at small sizes). Each has a name, a value, and a current colour. Make
them feel like cut, faceted, glowing minerals — premium and tactile. Keep the shape language
clear even when tiles are small and packed on the board.

| Value | Name | Shape | Current colour (core / glow) | Notes |
|---|---|---|---|---|
| 1 | **Duneglass** | circle | grey `#C9CDD3` / `#AEB4BC` | most common (25 in deck) |
| 2 | **Vigilite** | vertical almond/eye | dark amber `#3A332A` / `#B8902F` | |
| 3 | **Chromite** | triangle | near-white `#E2E8F0` / white | |
| 4 | **Verdite** | diamond | green `#39E58B` / `#7BFFB8` | |
| 5 | **Umbrite** | pentagon | violet `#B14DFF` / `#D08BFF` | |
| 6 | **Nuracite** | hexagon | cyan `#5FE6F2` / `#C5FBFF` | rarest (10 in deck) |

Plus two **special tiles**:

- **Dross** — value 0, gold (`#F2C53F` / glow `#FFE680`). A "trap" gem: worthless, placing it
  always busts. Should read as tempting-but-dangerous (gold and shiny, but subtly "off").
- **Nebulite** — value 7, the brand purple (`#C084FC` / glow `#E0BBFF`). A shape-shifting mineral and a prize: covering it
  scores +500. Should feel special/energised. It can also act as a wildcard ("joker") — when it
  does, it visually mirrors the colour of the gem it's standing in for while keeping a Nebulite
  glow/ring. A "joker Nebulite" state would be great to design.

The board is a **pointy-top hexagonal grid** of these gems (a big hexagon made of hex cells).
The board has two sizes in one game: it starts large (a side-6 hexagon, 91 cells) and shrinks
to a side-5 hexagon (61 cells). Design the gem and cell treatment to look good packed densely.

---

## Screens & components to design

### 1. In-game screen (the main one — portrait mobile is the priority)

Everything the player looks at during play:

- **Header:** the game logo/wordmark ("GLINT", kicker "CHROME ABYSS") and a small "New
  game" control.
- **HUD (top bar) — three items only:**
  - **SCORE** — a number; the hero stat. Score increments should feel rewarding.
  - **BANKS** — three pips (currently gold diamonds) representing the player's **free banks**
    remaining; one greys out each time a free bank is used.
  - **BUSTS** — three pips (currently hearts) representing **lives** remaining; one greys out
    per bust. At zero, game over.
  - Design these pip groups to be glanceable and clearly "resource remaining" (filling-down).
- **The board** — the hexagonal gem grid; the focal element. Needs:
  - A normal gem state, a **selected/activated "glowing" state** (gems that are part of a
    combo you've built but not yet banked — currently a white/gold outline glow), and a
    **"danger/red" state** (used briefly when tiles are about to be pulled away).
  - A clear empty-cell treatment (gaps left after banking).
- **Hand area ("NOW PLACING" / "UP NEXT"):** the current gem to place (large, prominent) and a
  small indicator of how many tiles remain in the hidden stack (values hidden). This is where
  the player's attention goes between board glances.
- **The "BANK" button (timed):** after you make a combo, a button appears for ~4 seconds with a
  **3-2-1 countdown and a draining bar**, letting you bank early. It should feel urgent but not
  stressful — a "take the safe points now?" prompt. It only appears while free banks remain.
- **A log/feed** (optional to feature prominently): short one-line messages ("Activated Trips",
  "Banked Hex ×4", "Bust!", "The Abyss collapses"). On mobile this can be minimal or a toast.
- **Reference panels (legends):** a gem legend (shape = value) and a combo/scoring legend.
  These are currently a side panel on desktop; on mobile they likely belong behind a tap
  (an info sheet) rather than always on screen. Please propose how to handle this on mobile.

### 2. Key animated moments (design the "hero frames" / states)

I don't need full animation, but please design what these **look like at their peak**, since
they're the game's most expressive moments:

- **Banking:** activated gems light up and fly to the SCORE. Weighty, satisfying, gold-tinged.
- **Busting:** the built-up group is lost; sharp, red, a bit punishing (but not punitive).
- **THE ABYSS COLLAPSES (board shrink):** the dramatic centrepiece. Currently: the board
  shakes, a huge word **"SHRINKING"** slams across the whole board and then itself shrinks as
  the board contracts from 91 to 61 cells in phases. Please design this big moment — the
  callout typography, the contraction, the overall drama. This should be a "wow".
- **RESHUFFLE:** a smaller banner + shake when the stack reshuffles (after a bust or a Dross clear).

### 3. End-of-game summary (designed screen)

A clean results card/screen. Shows:

- A headline: **"BOARD CLEARED"** (win, green) / **"GAME OVER"** (out of lives) / **"OUT OF
  TILES"** (stuck), with appropriate colour.
- The **final score** (large, hero).
- If the board was cleared: a **"+5,000 board-clear bonus"** line.
- A small **run-summary table**: **Times banked** and **Times busted** (plain numbers).
- A **Play again** button.

I currently have this as a simple table in a card — I'd love a properly designed version.

---

## Layout notes & constraints

- **Mobile-first, portrait.** The board is the hero; the hand + current gem sit below it; the
  HUD sits above. Reference panels should not crowd the play area on mobile.
- **Glanceability.** Score, lives, and free-banks must be readable at a glance; gem shapes must
  be distinguishable at small board sizes.
- **Light & dark.** Both modes; dark is the hero.
- **Accessibility.** Shape encodes value (good — not colour-only), but please keep colour
  contrast strong and consider colour-blind-safe gem palettes if you refine the colours.
- **It will be built in React (web).** Design with web implementation in mind — components,
  states, and tokens rather than one-off illustrations where possible. A small set of reusable
  components (gem, cell, pip, stat box, button, banner, card) is ideal.
- **No ads, no aggressive monetisation styling.** This is a premium-feeling single-player game.

---

## What success looks like

A cohesive visual language I can implement: a designed in-game screen (portrait), the gem set
(six minerals + Dross + Nebulite, including the activated/glowing and joker-Nebulite states), the HUD
(SCORE + the two pip groups), the timed BANK prompt, the dramatic shrink moment, and the
end-of-game summary — all in dark and light, with a short token/style sheet (colours, type
scale, spacing, radii, component states) so a developer can build it faithfully.

If you need to make assumptions, lean **premium, calm, tactile, sci-fi-mineral** — and keep the
Chrome Abyss purple as the brand thread.
