# This build: Core tweak, two bug fixes, and a UI cleanup

## 1. Core always respawns ONTO a tile (hand top-up)
When the Core respawns, it now always lands on a coverable mineral (burying it),
instead of sometimes landing on an empty cell. Because a buried tile returns to your
hand when the Core later leaves, this guarantees you get an extra tile back each
respawn cycle — keeping you in play longer, which helps you clear the board. It only
falls back to an empty cell if no mineral is available (rare, very late game).
Verified: across 80 games / 111 respawns, the Core buried a tile every time.

## 2. Bug fix — same-mineral merge was double-scored (and mis-labelled)
Symptom: a placement that connected TWO already-activated combos of the SAME mineral
into one 7+ cluster was banked as e.g. "Hex + Pentad" (or "Hex + Trips + Trips"),
taking the two biggest combos instead of treating it as one group.

Cause: the bank summed the names of every activated combo that overlapped the cluster.
For same-value combos that merge, those aren't distinct combos — they're one oversized
same-value blob.

Fix: connected same-value combos now collapse into the single correct combo (one Hex
for 6+), with the 7th-plus tiles overflowing to the hand via the existing overflow
rule. A genuine set + Drift double-combo from a single placement still correctly counts
both. Verified: bridging two same-value Trips now scores as one Hex (was Hex+Trips+Trips).

## 3. Bug fix — tiles briefly reappearing after a bank
Symptom: after banking/clearing, some tiles would flash back on the board for a frame.
It felt random.

Cause (animation, not engine): during the multi-phase bank animation the board shows a
frozen pre-bank snapshot with the banked tiles merely HIDDEN. The set of hidden cells
was REBUILT each phase rather than accumulated, so a later phase (the +5000 clear bonus,
or a Core respawn) could momentarily UN-hide a tile that had already left — a one-frame
flash. It only happened when strand-overflow / isolated / clear-bonus / respawn phases
followed the main bank, which is why it seemed random.

Fix: the bank animation now accumulates a "cleared" set monotonically — once a tile has
left the board it stays hidden for the rest of the sequence — and switches the frozen
board to the committed (already-cleared) state as soon as tiles have flown. Verified by
tracking the on-board tile count through the whole animation: it now only ever
decreases, never flashes back up.

## 4. UI — removed the 91 / 61 / 37 board-size buttons
The game always starts on the full 91-cell board and scales down to 61 in play (at 30
tiles left), so the manual size selector no longer made sense. The header now shows just
the title and a "New game" button.
