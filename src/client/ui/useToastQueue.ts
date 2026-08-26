import { useEffect, useRef, useState } from "react";
import type { GameState } from "../game/engine";

type LogEntry = GameState["log"][number];

/**
 * THE TOAST QUEUE — plays a burst of log lines in order instead of showing only
 * the last one.
 *
 * A single `place()` can emit two to four entries at once (bank → isolated →
 * collapse → hand reveal), and `state.log` lands wholesale at the end of the
 * choreography. The band used to render `log[0]`, so everything except the
 * newest line of a burst was never seen at all — the "Banked …" line never got a
 * toast, and on a big turn neither did THE ABYSS COLLAPSES.
 *
 * This queues each burst oldest-first and releases one line at a time.
 *
 * INTERIM SPACING: the gap below is a stand-in. The real fix is to release each
 * line as its own animation beat plays, so the spacing comes from the
 * choreography rather than a timer; this queue then only has to sequence events
 * that genuinely ARE simultaneous (the collapse and the hand reveal share a
 * trigger). Until then, one beat per line.
 */

/** How long each queued line holds the band before the next one takes over.
 *  The drain runs AFTER commitFinal, which is also where input unblocks — so
 *  this time overlaps the player's next move, and shorter means less overlap.
 *  Floor is ~600ms: the float animation takes ~400ms just to rise (gl-toast-float,
 *  3600ms with the rise at 11%), so below that a line reads as a flicker. */
const STAGGER_MS = 1000;
/** Safety cap. A burst is 2-4 lines in practice; this only guards a runaway. */
const MAX_PENDING = 8;

/**
 * The entries added to `log` since `prevTop` was at its head, oldest-first.
 *
 * `log` is newest-first and capped at 40, so a run of adds appears at the front.
 * When `prevTop` is gone (a new run, or a burst that pushed it past the cap) we
 * cannot know how much was missed — take the newest `max` and drop the rest
 * rather than replay stale history.
 */
export function newEntries(prevTop: LogEntry | null, log: readonly LogEntry[], max = MAX_PENDING): LogEntry[] {
  if (log.length === 0) return [];
  if (!prevTop) return log.slice(0, max).reverse();
  const at = log.indexOf(prevTop);
  if (at === 0) return []; // nothing new
  const added = at === -1 ? log.slice(0, max) : log.slice(0, at);
  return added.reverse(); // oldest-first: the order they were pushed
}

/**
 * The queue's brain, framework-free so its sequencing is testable. The hook
 * wires it to React state and the stagger timer; the core decides WHAT shows
 * WHEN:
 *
 * - `collect(log)` folds a log snapshot in. A new burst supersedes whatever is
 *   still queued from an earlier move (a fast player must never watch a toast
 *   from two placements ago), but a burst is one move's story and always plays
 *   IN FULL — truncating it would drop the "Banked …" line, which is the whole
 *   reason this queue exists.
 * - `needsTimer(line)` — a STICKY line with nothing queued behind it holds the
 *   band with NO timer ("holds until the next entry", engine.ts). The core
 *   remembers that hold, and the next collect DISPLACES it. This displacement
 *   is load-bearing: without it the final sticky of a finished run (BOARD
 *   CLEARED) deadlocked the band — no timer running, and collect refused to
 *   advance because a line was "showing" — so the stale line survived into the
 *   whole of the NEXT game (Thys's bug, 2026-08-26).
 * - `tick()` — the stagger timer fired; release the next line.
 */
export class ToastQueueCore {
  private pending: LogEntry[] = [];
  private prevTop: LogEntry | null = null;
  private showing = false;
  private stickyHold = false; // a sticky is on the band with NO timer armed
  constructor(private emit: (t: LogEntry) => void) {}

  collect(log: readonly LogEntry[]): void {
    const added = newEntries(this.prevTop, log);
    this.prevTop = log[0] ?? null;
    if (added.length === 0) return;
    this.pending = added.slice(-MAX_PENDING);
    // start the drain if the band is free — or if a sticky is holding it, in
    // which case this burst IS "the next entry" that ends the sticky's reign.
    // A non-sticky line keeps its full beat: its timer is already running.
    if (!this.showing || this.stickyHold) {
      this.stickyHold = false;
      this.advance();
    }
  }

  /** Whether the just-shown line needs the stagger timer. False = it is a
   *  sticky holding the band until the next collect displaces it. */
  needsTimer(current: LogEntry): boolean {
    if (current.sticky && this.pending.length === 0) {
      this.stickyHold = true;
      return false;
    }
    return true;
  }

  tick(): void {
    this.advance();
  }

  private advance(): void {
    const next = this.pending.shift();
    if (!next) {
      this.showing = false;
      return;
    }
    this.showing = true;
    this.emit(next);
  }
}

/**
 * The line the band should show, and a key that changes per line so the
 * float-in / hold / float-out animation replays for each.
 */
export function useToastQueue(log: readonly LogEntry[]): { toast: LogEntry | null; toastId: number } {
  const [toast, setToast] = useState<LogEntry | null>(null);
  const [toastId, setToastId] = useState(0);
  const core = useRef<ToastQueueCore | null>(null);
  if (!core.current) {
    core.current = new ToastQueueCore((t) => {
      setToast(t);
      setToastId((n) => n + 1);
    });
  }

  useEffect(() => {
    core.current!.collect(log);
  }, [log]);

  useEffect(() => {
    if (!toast) return;
    if (!core.current!.needsTimer(toast)) return; // sticky: held until displaced
    const t = window.setTimeout(() => core.current!.tick(), STAGGER_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastId]);

  return { toast, toastId };
}
