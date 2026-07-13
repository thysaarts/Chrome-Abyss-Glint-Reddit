# Nebulite — rules added in this build

## Double-combo activation
A single placement can sit in TWO combos at once and BOTH activate and score:
either a matching set + a Drift, or two Drifts. (Two same-value sets can't both
apply — that's just one bigger blob → Hex.) The placed tile is the only tile shared
between the two combos. The union of their cells counts toward the 6-tile bank
threshold, so a Trips (3) + Drift (4) sharing the placed cell is 6 tiles and banks
immediately as "Trips + Drift (Accord) → +900". This removes the old feel of a Drift
"killing" an intended matching combo.

## Buried tiles (foundation)
A Glint or Core dropped on the board BURIES the mineral beneath it instead of erasing
it. That buried mineral returns to the player's HAND whenever the Glint/Core leaves for
any reason — taken (covered by a placement), banked (e.g. a joker-Core in a combo), or
cleared (isolated). This applies in every removal path, including busts.

## Rule 1 — Core as a matching joker (with LOCKING)
A Core ADJACENT to the tile you place mirrors that tile's value to help complete a
MATCHING SET (Echo/Trips/Quad/Pentad/Hex) — never a Drift. Visually the Core keeps its
rounded-square shape but takes the mirrored mineral's colours, with a faint ring of its
original Core colour.

It mirrors the FIRST tile placed next to it and then LOCKS to that value: once the Core
is part of an activated/pre-banked combo, a later placement next to it cannot re-mirror
it, cannot steal it into a new combo, and cannot change its colour. The Core can only
mirror a new value again AFTER it has banked and respawned. (A placement next to a
locked Core simply doesn't get to use it — if that placement forms no combo of its own,
it busts as normal.)

When the joker-Core's combo banks, the Core scores +500, is consumed, and its buried
tile (if any) returns to your hand; it then respawns one move later (Rule 2).

## Rule 2 — Core respawn
When the Core is cleared/banked it RESPAWNS one placement later (not immediately): the
player makes one more move — any move, including a bust — and then the Core reappears at
a random cell. It can land anywhere EXCEPT an activated/glowing combo cell or a Glint; it
may cover a gap, a mineral, or an inert tile, burying whatever it covers (recoverable).

## Rule 3 — last-tile banking + penalty
If your final hand tile forms a combo, that cluster BANKS regardless of size (even a lone
Echo of 2). Any OTHER activated/glowing combos still on the board that never banked then
cost their BASE combo value (no multiplier, no chain) as a penalty subtracted from the
final score. If the last tile busts instead, normal bust rules apply.

## Rule 4 — board-clear bonus
Clearing the whole board awards a flat +5000, with a log line and a "+5000" animating from
the centre of the board up to the score.

## Rule 5 — Glint clear → reshuffle
Clearing a Glint reshuffles the player's UNREVEALED hand (the queue behind the current
tile). Values are fixed (the game is the same fixed multiset of tiles); only the order
changes. On screen: "RESHUFFLE" appears at the board centre and the board + up-next stack
shake for ~1 second.

## Rule 6 — isolated pairs
Cut-off tiles are resolved after every clear:
  - an isolated SINGLE banks for its face value (mineral ×100, Core 500, Glint 0) and flies
    up to the score;
  - an isolated PAIR (exactly two SAME-VALUE plain tiles, with no other occupied neighbour —
    the pair as a whole cut off) banks the LEFT/TOP tile to the score and sends the other to
    the player's HAND;
  - groups of 3 or more do nothing (they stay on the board). A cut-off mixed-value clump
    (e.g. a stranded Drift run) is not a "pair" and does nothing. Activated / pre-banked tiles
    are never treated as isolated.

## Notes on clearing the board
These rules remove all stranded singles and pairs and recycle many tiles back to the hand
(buried recovery, strand overflow, pair-to-hand), cutting a greedy bot's average leftover
tiles from ~50 to ~18. A naive greedy bot still doesn't clear the 91-tile board (the wall is
mid-size same-value clumps of 3-6), but a skilled human plausibly can while it stays hard. If
playtesting shows it's still not clearable, the cleanest next lever is auto-banking an isolated
same-value TRIPLET as a Trips.

All rules are covered by unit tests, and a 100-game integrity run confirms state invariants
hold (no stranded buried tiles, never more than one Core on the board, activated cells always
occupied, locked joker-Cores never re-mirrored) with reshuffles and respawns firing throughout.
