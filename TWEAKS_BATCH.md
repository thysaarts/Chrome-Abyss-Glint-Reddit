# This build: bank/bust economy + UI overhaul

## 1. BANK button countdown -> 4 seconds (1s grace)
The early-bank offer now lasts 4s. The visible "3, 2, 1" countdown + draining bar
start after a 1s grace (instead of 2s), so the player still feels a tight 3 seconds
but has a moment to react first.

## 2. BANK button now plays the full bank animation
Pressing BANK no longer instantly erases the tiles. It plays the SAME animation as a
normal bank: the combo's cells light up one-by-one, then fly to the score (at base
value, no multiplier), and any tiles the bank isolates/clears animate off the board
too — then the result commits.

## 3. Three free banks, three lives, repurposed top bar
The top bar now shows only SCORE, BANKS, and BUSTS:
  - BANKS shows 3 gold diamond pips = your FREE (countdown) banks. One greys out each
    time you use the timed BANK button. After 3, the BANK offer no longer appears.
  - BUSTS shows 3 heart pips = your lives. One greys out per bust. After 3 busts it is
    GAME OVER (the end screen appears).
TILES LEFT, HAND, and ACTIVATED were removed from the bar.

## 4. End-game summary
The end screen now shows: the final SCORE, a "+5,000 board-clear bonus" line when you
clear the board, and your run totals — number of times BANKED (automatic + free) and
number of times BUSTED.

## 5. No-move final turn shows BUST
If you're on your LAST tile and it has no legal move anywhere, the game shows "BUST"
for a couple of seconds and then ends — no need to click into a forced bust. (With more
tiles in hand, an unplaceable tile is just a normal bust that costs a life and play
continues.)

## 6. Reshuffle always fires after a bust
Every bust now reshuffles your upcoming stack (not only when a Glint is cleared), with
the RESHUFFLE banner + board shake, and the log reads "Tiles in your stack are
reshuffled."

## 7. Board nudge on bust
Paired with the reshuffle: a random number (0-6) of board tiles each drift by ONE cell
into a random empty neighbour. Pre-banked (glowing) combos are excluded and never move;
a tile with no empty neighbour stays put.

All changes are covered by tests: 3 busts ends the game, the 4th free bank is refused,
the nudge moves 0-6 tiles excluding combos, and the engine is stable across 200 games
with the new paths active (0 crashes, lives/free-banks never go negative).
