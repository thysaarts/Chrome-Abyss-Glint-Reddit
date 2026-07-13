# Dramatic board shrink + Core-after-shrink confirmation

## Core respawn after the shrink — confirmed
The shrink ("THE ABYSS COLLAPSES") performs the Core's FINAL respawn, then sets a flag
that disables all future respawns. Verified across 120 games: the only respawn at/after
the shrink is the single final one during the collapse itself; ZERO respawns happen on
any turn after the shrink. Once the board has shrunk, the Core stays gone.

## The shrink is now dramatic and phased
Previously the board snapped from 91 to 61 cells. Now it plays a multi-phase collapse:
  1. The full board holds and SHAKES as a huge red "SHRINKING" word slams across it.
  2. The outer ring of tiles flashes red.
  3. The outer ring vanishes (pulled inward) and the board begins contracting.
  4. The board scales down further; the "SHRINKING" word shrinks WITH it (180 -> 150 ->
     110 -> 72px), then fades.
  5. The board lands at its tight contracted scale, then the new 61-cell board is revealed.
The whole sequence runs ~2.7s with shakes and a scaling transform, so the collapse
demands attention and is unmistakable, instead of happening in a snap.
