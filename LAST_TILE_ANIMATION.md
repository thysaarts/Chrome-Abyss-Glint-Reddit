# Last-tile banking — consistent animation + penalty resolution

Previously, when your final hand tile formed a combo (Rule 3 force-bank), the engine
banked and ended the game synchronously, so the UI skipped the banking animation: the
tiles vanished and the end popup appeared instantly. This is now fixed.

## What happens now, in order
1. The last-tile combo plays the SAME banking animation as any other bank — the
   placed tile glows, the cluster cells light up one-by-one outward, then fly to the
   score. (This is true even though the cluster is under the usual 6-tile threshold.)
2. Any leftover PRE-BANKED combos that never banked (the Rule 3 penalty) each get a
   RED outline, then fly a RED negative number (their base value, e.g. "−300") to the
   score, deducting it.
3. Only after all of the above resolve does the end-of-game popup appear.

## How it's wired
`describePlace` now detects the last-tile force-bank by committing the move on a clone
and checking whether a bank happened despite the normal plan not banking. It reports
`kind: "bank"` (so the UI animates it), `isLastTileBank: true`, the `bankOrder` cells to
light up, and a `penalties` list (each leftover activated combo's cells + base value).
The animation hook plays the standard bank sequence, then a new penalty phase (red
outline + red "−value" flyer per combo), and only then calls `commitFinal`, which holds
the brief settling beat before the popup — so the popup always waits for the full
sequence.
