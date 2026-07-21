# Motion settings — Reduce Motion now covers the board zoom (+ Visual › Advanced)

Port notes for the non-Reddit Glint. Built and verified in `Glint_reddit`; typecheck,
`vite build` and all 42 tests green.

## Why

A Reddit commenter asked to turn off the zoom/close-ups. Reduce Motion did **not** cover
it: that setting was a pure CSS switch (`data-motion="reduced"` → animation freezes in
`index.css`), while the board camera is an inline React transform that CSS can't reach.
So a player who ticked Reduce Motion still got the full lean-in on every placement.

## The model

`reduceMotion` is the **master**. Four per-effect toggles sit under it in a collapsed
**Advanced** disclosure. They only ever make things *calmer*, never louder:

```
effective = !(reduceMotion || OS prefers-reduced-motion) && toggle
```

Monotone by design — there's no "reduce motion but louder" state to explain. While the
master is on, the Advanced rows render OFF and disabled with "Off — covered by Reduce
motion", the same treatment the Game tab gives the combo picker under HARD difficulty.

The cost: "Reduce motion but keep the zoom" is unexpressible. Deliberate — the
alternative is a tri-state (follow/on/off) that's confusing in a panel this compact.

## Changes by file

### `src/client/ui/settings.ts`

- **New `Settings` fields**: `boardZoom`, `boardTilt`, `ambientFx` — all default `true`,
  all parsed as `!== false` so existing saves upgrade cleanly. **No `SAVE_V` bump needed**
  (additive only; `readVersioned` merges over defaults).
- **New exports**:
  - `osPrefersReducedMotion()` — the single home for the `matchMedia` check.
  - `motionReduced(settings)` — master OR OS preference.
  - `visualOptions` — live mirror of the **effective** `boardZoom` / `screenShake`, for
    render paths that can't thread props. Mirrors the existing `gameOptions` idiom.
- `applySettings` now also sets `data-tilt` and `data-ambient` on `<html>` and refreshes
  `visualOptions`.
- **`screenShake` removed from `gameOptions`** — it's motion, so it moved to
  `visualOptions` where Reduce Motion can gate it. It stays in the `Settings` interface
  in the GAME block for save-file compatibility; only its UI placement moved.

### `src/client/index.css`

The one reduced-motion block was split into two gates, each matching the master *or* its
own attribute:

- **tilt** → `.gl-board-tilt`, `.gl-breathe`
- **ambient** → the long `:is(...)` list (fog, dust, parallax, glimmers, `.gl-board-glint`,
  `.gl-cta-breathe`, …) plus `.gl-decor *`

The `:is(...)` list is duplicated for the second selector — CSS has no selector variables.
Transition/celebration effects (`.gl-rise-in`, `.gl-dive-out`, `.gl-abyss-*`, `.gl-rg-anim`)
stay **master-only**; they're one-shot beats, not ambient life.

### `src/client/App.tsx`

- Board transform now gated: `visualOptions.boardZoom && (anim.focused || …)`.
- **Fit pass** (`useEffect`, the origin-clamping camera framing) early-returns when the
  camera is off — no point churning per-cell maths on every reveal.
- **`onPointerDown` returns early** when the camera is off, so `focusFromPointer` doesn't
  re-anchor `transform-origin`. Subtle but important: the board still rests at
  `ZOOM_BASE` (1.05 on a fine pointer), so moving the pivot alone visibly nudges the board
  under the cursor — exactly the motion being killed.
- Shake site reads `visualOptions.screenShake`.
- The duplicated `matchMedia` check in the score-tally reveal now calls
  `osPrefersReducedMotion()`.
- **`updateSettings` calls `applySettings` synchronously** in addition to the existing
  effect. This one matters: `visualOptions` is read *during render*, and the effect only
  runs after that render commits — without the sync call the board lags a frame behind
  the toggle, and since mutating a plain object triggers no re-render, it stays stale
  until something else re-renders.

### `src/client/ui/TutorialLevel.tsx`

Has its own copy of the camera. Same gate on its `transform`; shake switched from
`gameOptions.screenShake` to `visualOptions.screenShake`.

### `src/client/ui/SettingsScreen.tsx`

- New `MotionAdvanced` component (with `advancedBtn` style) rendered under the Reduce
  motion row, plus a "Reset to standard" for the four toggles.
- **Screen shake row deleted from the Game section.**

### `src/client/content/content.json` → `settingsScreen`

New keys: `advancedTitle`, `advancedDesc`, `advancedShow`, `advancedCoveredNote`,
`zoomTitle`, `zoomDesc`, `tiltTitle`, `tiltDesc`, `ambientTitle`, `ambientDesc`.
`reduceDesc` rewritten — it previously promised only "ambient sway, drifting fog and
particle effects", which is now understated.

`shakeTitle` / `shakeDesc` are unchanged and reused in their new home.

## Watch out for, porting

1. **The admin CMS.** This repo has no `/admin.html`; the non-Reddit one does. If its
   editor enumerates `settingsScreen` fields by hand rather than walking the JSON, the ten
   new keys need adding there or they won't be editable. Also check whether a **published
   draft** in localStorage could shadow the new keys — `CONTENT_DRAFT_KEY` is at `v2`; a
   stale draft lacking these keys would render `undefined` labels. Bump to `v3` if the
   overlay isn't a deep merge over bundled defaults.
2. **Dead CMS copy.** `settingsScreen.decorReduceMotion` references a Decor section that
   isn't in `SECTIONS` or rendered anywhere in this repo. If the non-Reddit version *does*
   render Decor, that copy still reads correctly — the Ascent scene remains master-gated,
   untouched by the new toggles.
3. **Stale comment.** `settings.ts` claims "Reduce Motion switches to the classic
   backdrop" for the Ascent scene. I could find no code doing that here. Worth confirming
   whether it's true in the non-Reddit version; if not, delete the comment in both.
4. **Coarse pointers.** `ZOOM_BASE` is already 1.0 on touch and the press-zoom is already
   suppressed there, so on mobile this only affects the *during-animation* zoom. On
   desktop the resting 1.05 scale is **intentionally left alone** — the toggle kills
   camera *movement*, not the board's size.
5. If the non-Reddit version reads `gameOptions.screenShake` anywhere this repo doesn't,
   those sites need switching to `visualOptions.screenShake`.

## Suggested commit split

The zoom fix is shippable on its own and is the part that answers the comment:

1. Reduce Motion covers the board camera (`settings.ts` helpers + `visualOptions`,
   `App.tsx`, `TutorialLevel.tsx`, sync-apply fix, `reduceDesc` copy).
2. Visual › Advanced panel (new toggles, CSS gates, `MotionAdvanced`, shake moved out of
   Game, remaining copy).

## Not done / open

- No test covers the toggles — the suite is engine-level and none of this touches the
  engine. Verified by typecheck + build only; **it has not been click-tested in a
  browser.** Worth a manual pass on the Advanced panel's disabled state before shipping.
- If the Reddit commenter can be reached, the zoom toggle is the thing to point them at.
