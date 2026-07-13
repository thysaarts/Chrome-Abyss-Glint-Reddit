# Fixes in this build

## 1. Echo (and other combos) not recognised — ROOT CAUSE FOUND
Mineral tile values were being stored as STRINGS ('1'..'6') instead of numbers,
because the pool was built from `Object.keys(MINERAL_QTY)` (which returns
strings) with a cast that lied to TypeScript. Combo detection compares values
numerically, so a placed tile (number) never matched board tiles (strings) — no
same-value blob ever formed, so Echoes/Trips/etc. busted every time. Fixed by
converting the keys to numbers in `newGame`. This also raised banking rates
across the board (many valid combos were being silently missed).

## 2. Cannot place on an activated (glowing) tile
Clicking a highlighted, pre-banked tile now does nothing except log
"You cannot replace this tile. Choose another spot." The tile stays unplaced.

## 3. Isolated Glint is discarded
After any bank or bust, any Glint with no remaining occupied neighbours is
removed from the board (logged, no penalty) and animated off.

## 4. Faster to-hand animation
The covered-tile-to-hand animation is twice as fast (`T.toHandFly` = 350ms with
a matching quick transition).

## 5. End-of-game popup delayed
The win/lose popup now waits for the final animation to finish AND a short
settling beat, so the final board (cleared tiles, updated score) is visible
before the popup appears.
