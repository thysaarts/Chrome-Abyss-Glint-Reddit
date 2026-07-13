# Handoff: Chrome Abyss — Glint · **Region Theming (backgrounds)**

> Seven region-themed **background treatments** for the in-game screen. The board, gems, and layout never change — the **atmosphere layer and UI chrome tint** carry the region. The standard violet-nebula treatment (see `design_handoff_glint_depth`) stays for **unthemed / Quick-start** games. This is a delta on top of the depth pass.

---

## About the design files
HTML **design reference / working prototype** — recreate in the target codebase (**React, web**). `support.js` is the prototype runtime — **do not port**. Open **`Glint Regions.dc.html`** in a browser: all seven phones loop their ambient animations live (static PNGs can't show the flicker/slide/glitch motion).

## Fidelity
**High-fidelity** — colours, layer recipes, and timings below are production targets.

---

## The theming system (rules)
1. **Board is sacred** — wells, gems, extrusion, tilt are identical in every region. Only what's *behind* and *around* it changes.
2. **Three theming hooks per region:**
   - **Atmosphere layers** (z-order: behind the board): 1–2 parallax radial washes (reuse `parA`/`parB` drift) + 1–3 **signature elements** (the world reference) + optional edge/floor treatment.
   - **UI chrome tint**: panel gradient, border, and label ink shift to the region's material. Structure, radii, bevels, and the gold score / gold banks / red hearts stay constant.
   - **Ambient particles**: the rising-dust system recoloured (embers, bubbles, sparks…).
3. **Subtlety budget**: signature elements ≤ ~10% opacity washes + a few small bright accents. The board must always win the eye. All motion is `transform`/`opacity` only.
4. Region maps to level (from the Level Select handoff): the theme loads with the level's region.

---

## Region recipes

### 1 · Machina Forge — *iron mine, industrial* (e.g. Iron Tide)
- Screen bg `#0a0806` · panels `rgba(38,26,16,.85)→rgba(20,13,8,.9)` · border `#3c2c1c` · labels `#9a8168` · accent `#ff8c4a`
- Atmosphere: molten wash bottom `rgba(255,110,40,.26)`; faint gantry struts `repeating-linear-gradient(48deg, rgba(255,140,60,.045) 0 2px, transparent 2px 30px)`.
- **Firelight (signature)** — three stacked bottom glows, each flickering on its own irregular opacity track (`fireFlick` 2.3s / `fireFlick2` 1.7s / `fireFlick` 1.15s +0.35s delay, linear):
  - 330px `linear-gradient(transparent, rgba(255,110,30,.32))`
  - 210px `radial-gradient(70% 100% at 50% 100%, rgba(255,150,50,.32), transparent 72%)`
  - 120px `radial-gradient(52% 100% at 50% 100%, rgba(255,215,120,.24), transparent 76%)`
  - `fireFlick` opacity keys: .85→.58→.95→.68→1→.62→.92→.74→1→.66 (irregular spacing — no easing curve smoothing, plain linear between keys).
- Particles: orange embers (`dust`, 6.5–8.5s). Hand gem: **Chromite**.

### 2 · Fringe Market — *outlaw neon street* (The Neon Bazaar)
- Screen bg `#0b070f` · panels `rgba(40,18,42,.85)→rgba(20,10,22,.9)` · border `#45204a` · labels `#a878a8` · accent `#ff4fd8`
- Atmosphere: magenta street haze bottom `rgba(255,60,170,.2)` + cyan top-left `.08` + violet right `.10`.
- **Neon signs (signature)** — 4 glowing tubes (pink 44×5, cyan 26×4, amber 5×34 vertical, violet 36×4) with box-shadow glows, that **slide in and out**:
  - Horizontal tubes: `neonSlideH` — grow from anchor (`transform-origin:left/right center`) `translateX(-16px) scaleX(.15) → 0/1` hold 40% → retract out `+20px`; 5.5s / 7s / 8s, staggered delays.
  - Vertical tube: `neonSlideV` — same pattern on Y (`transform-origin:center top`), 6.2s.
- Particles: pink + cyan motes. Hand gem: **Dross** (label "Dross?" — the bait fits the crime world).

### 3 · Corporate Spire — *luxury, clean, bright* (Syndicate of Spires)
- Screen bg `#0e1220` (brightest region) · panels `rgba(42,50,72,.85)→rgba(22,28,46,.9)` · border `#3c465e` · labels `#9aa8c8` · accent `#dce9ff`
- Atmosphere: white top-light `rgba(215,232,255,.16)`, gold side wash `.07`; tower-window columns `repeating-linear-gradient(90deg, rgba(255,255,255,.022) 0 2px, transparent 2px 34px)`; two drifting light shafts (`rayDrift` 12s/15s).
- **Searching rings (signature)** — two hairline circles (240px gold `rgba(232,181,63,.18)`, 180px white `.10`) that **roam the screen** on slow waypoint paths: `circSearch` 26s (`translate(0,0) → (-120,90) → (-215,300) → (-60,420) → (28,160)` with ±6% scale) and `circSearch2` 34s. Reads as a concierge lens scanning the spire.
- Hand gem: **Nebulite** (luxury prize).

### 4 · Military Bastion — *fortress, defence* (The Fortress)
- Screen bg `#0a0c0a` · panels `rgba(30,36,26,.88)→rgba(15,18,12,.92)` · border `#37402e` · labels `#8a9a78` · accent `#ff5a5a`
- Atmosphere: olive-steel top wash `rgba(140,160,110,.09)`; **red alert base** `radial 70%×100% rgba(255,60,60,.1)` pulsing (`alertPulse` 7s, .35↔.75).
- Signatures: **hazard chevron strips** top + bottom edges (12px, `repeating-linear-gradient(135deg, rgba(255,90,90,.10) 0 12px, transparent 12px 26px)`); a **searchlight** column sweeping the width (`beamSweep` 14s, 90px `rgba(220,235,220,.05)` skewed).
- Hand gem: **Vigilite** (the watchman's amber).

### 5 · Shadow Sector — *espionage, stealth* (The Ghost Network)
- Screen bg `#04060a` (darkest) · panels `rgba(16,26,38,.88)→rgba(8,13,20,.92)` · border `#223144` · labels `#6a86a0` · accent `#7ec8ff`
- Atmosphere: one cold blue wash `rgba(80,130,200,.08)` only — the emptiness is the theme.
- Signatures: **radar rings** — two 340px circles centred behind the board expanding `.25→1.5` and fading (`radar` 5s, offset 2.5s); a horizontal **scan band** (52px, `rgba(126,200,255,.06)`) travelling top→bottom (`scanY` 8s linear).
- Hand gem: **Umbrite**. Board cast shadow slightly stronger here (`.7` black).

### 6 · Divinity Enclave — *spiritual water world* (The Tower of Truth)
- Screen bg `#051220` · panels `rgba(14,38,56,.88)→rgba(7,20,32,.92)` · border `#1e425c` · labels `#6a9ec0` · accent `#4ab8ff`
- Atmosphere: deep-water washes `rgba(40,140,220,.2)` / teal `.10` / blue `.10`.
- **Underwater light (signature)** — three god-ray columns (80/52/34px, `linear-gradient(180deg, rgba(150,220,255,.11→.06), transparent)`, `transform-origin:center top`) that **waver like light through water**: `waterRay` — skew oscillates `-16°↔-5°`, `translateX ±14px`, **`scaleX .88↔1.2` (refraction breathing)**, opacity `.5↔1`; 9s / 12s / 10.5s staggered. Plus a **caustic shimmer band** at the surface line (two soft radials, `causticShim` 7s: opacity `.4↔1`, `translateX ±12px`).
- Particles: **bubbles** — hollow circles (border only) rising with lateral drift (`bubble` 9–11s).
- Hand gem: **Nuracite**.

### 7 · Digital Nexus — *hackers, terminal green* (The Cyber Realm)
- Screen bg `#040c08` · panels `rgba(13,36,24,.88)→rgba(7,18,12,.92)` · border `#1e4230` · labels `#5a9a78` · accent `#3cff9e`
- Atmosphere: terminal-green washes `rgba(60,220,130,.13)` / `rgba(40,255,170,.07)`.
- Signatures:
  - **Code rain** — five 2px columns, each a clipped strip with `repeating-linear-gradient(0deg, rgba(90,255,170,.35–.42) 0 5–8px, transparent … 20–28px)` translating down one period (`rainT` 2.2–3.4s linear, seamless loop), varied opacity .6–1.
  - **Scanlines** — full-screen `repeating-linear-gradient(0deg, rgba(60,255,158,.028) 0 1px, transparent 1px 4px)`.
  - **Glitches** — two full-width bars (3px green `.32`, 2px cyan `.28`) that stay invisible ~86% of the loop then **jump with `steps(1)`** (`glitchBar` 4.2s / 5.7s: `translateX -16 → +12 → -7` over ~8% of the cycle); three small **data blocks** (34×8 etc.) blinking on for ~3% (`glitchBlock` 6.4–9.2s, staggered).
  - **Grid floor** — bottom 150px, 17px green grid both axes, masked to fade upward.
- Hand gem: **Verdite**.

---

## Shared keyframes (copy from the file)
`parA/parB` (atmosphere drift) · `dust` (motes) · `sway` (board) · `gemHover` · `fireFlick/fireFlick2` · `neonSlideH/neonSlideV` · `circSearch/circSearch2` · `alertPulse` · `beamSweep` · `radar` · `scanY` · `waterRay` · `causticShim` · `rainT` · `glitchBar` · `glitchBlock` · `bubble`.

## Implementation notes
- Model a region theme as a **token bundle** (`screenBg`, `panelGrad`, `border`, `labelInk`, `accent`) + a **background component** per region rendered behind the game layer. The game UI reads the token bundle; the board reads nothing.
- All signature elements are absolutely-positioned divs with gradients — no images. Keep them behind `z-index` of the HUD, above the base washes.
- `steps(1)` timing is intentional for glitch/flicker beats; everything else eases.
- Respect `prefers-reduced-motion`: freeze signature loops at a neutral frame, keep the colour washes.
- Unthemed / Quick-start uses the standard violet-nebula treatment from the depth pass.

## Files
| File | What it is |
|---|---|
| `Glint Regions.dc.html` | **All seven themed in-game mockups**, looping live. Start here. |
| `Board.dc.html` · `Gem.dc.html` | Board (flat + extruded modes) and gem components used by the mockups. |
| `favicon.svg` · `support.js` | Icon · prototype runtime (**do not port**). |
