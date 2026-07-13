# Two mechanics to make the board clearable (hard, but possible)

The 91-tile board was effectively impossible to clear. Two additions fix that
without making it easy.

## 1. THE ABYSS COLLAPSES — board shrink (the primary fix)
When the side-6 board (91 cells) drops to 30 occupied tiles, it collapses to side-5
(61 cells), remapping the surviving tiles INWARD so stranded pieces become adjacent
again. This attacks the root cause of the clearing problem: too much empty space for
too few tiles.

Remap priority (to keep the board intelligible):
  1. Pre-banked (activated) combos are mapped FIRST, as rigid groups. A combo on the
     interior doesn't move at all; one touching the outer ring is relocated as a whole
     to a spot where its shape fits, so it stays intact.
  2. Loose interior tiles keep their position.
  3. Loose tiles on the outermost ring (which has no equivalent on the smaller board)
     collapse to the nearest free cell, preferring the same direction from centre.
  4. Conflicts spill to the next-nearest free cell.

It fires ONCE, only on the 91-board, and it's dramatic on screen ("THE ABYSS
COLLAPSES" with the outer ring sliding inward). Tile count is always preserved — no
tiles are lost in the remap.

Endgame Core rule: when the board collapses, the Core respawns one FINAL time and
then never again. (Without this, a perpetually-respawning Core makes a true clear
impossible.) After the collapse, a cleared Core stays gone.

Why it works: with the shrink active, simulated games NEVER end "no legal move" any
more — the board stops getting stuck. The remaining challenge becomes hand economy
(having enough tiles to finish), which mechanic 2 addresses.

## 2. The early-bank — Option 3 (the Farkle choice)
Previously you could only bank automatically at 6+ tiles, and you were forced to keep
placing — you could never CHOOSE to bank to lock in points before risking a bust.

Now, right after you make a combo, a BANK button appears over the Now-Placing / Up-Next
box for a few seconds. Press it to bank THAT combo immediately at BASE value (no
multiplier, no chain bonus) and clear its tiles. Your other glowing combos are
untouched. If you don't press it, the next tile reveals as normal and the combo keeps
glowing (to be banked later or grown toward 6).

Timing: the offer is alive for 5 seconds, but the visible "3, 2, 1" countdown and the
draining progress bar only begin after a 2-second grace — so it feels like a tight 3
seconds while actually giving you a little longer. (We deliberately did NOT make banking
available when you can already see you're about to bust — that would let you dodge losses
risk-free. The offer only appears right after a successful combo, which is the genuine
"bank or push your luck" moment.)

Why it helps clearing: banking a small combo early is more TILE-EFFICIENT than growing it
to 6 — you clear tiles now instead of spending more hand tiles building up. That directly
eases the hand-economy bottleneck the shrink exposes.

## Result
A crude simulated bot using early-banking now clears the board ~2% of the time (and
leaves far fewer tiles); the old greedy bot cleared 0%. Going from impossible to
occasionally-achievable-by-a-dumb-bot is the signature of a puzzle that's hard but
solvable — a thoughtful human with lookahead and good bank timing should clear it far
more often. This is the intended difficulty band; please playtest to confirm it feels
right.
