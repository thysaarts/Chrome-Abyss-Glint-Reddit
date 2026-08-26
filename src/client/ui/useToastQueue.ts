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
 * The line the band should show, and a key that changes per line so the
 * float-in / hold / float-out animation replays for each.
 */
export function useToastQueue(log: readonly LogEntry[]): { toast: LogEntry | null; toastId: number } {
  const [toast, setToast] = useState<LogEntry | null>(null);
  const [toastId, setToastId] = useState(0);
  const pending = useRef<LogEntry[]>([]);
  const prevTop = useRef<LogEntry | null>(null);
  const showing = useRef(false);

  // collect: fold each burst into the queue, newest work winning if we overflow
  useEffect(() => {
    const added = newEntries(prevTop.current, log);
    prevTop.current = log[0] ?? null;
    if (added.length === 0) return;
    // A NEW BURST SUPERSEDES whatever is still queued from an earlier move: a
    // fast player must never watch a toast from two placements ago. But a burst
    // is one move's story and always plays IN FULL — truncating it would drop
    // the "Banked …" line, which is the whole reason this queue exists.
    // (When log entries are released per animation beat, "burst" becomes "beat"
    // and this rule needs revisiting — beats of the SAME move must not discard
    // each other.)
    pending.current = added.slice(-MAX_PENDING);
    if (!showing.current) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  // release: one line, then the next
  function advance() {
    const next = pending.current.shift();
    if (!next) { showing.current = false; return; }
    showing.current = true;
    setToast(next);
    setToastId((n) => n + 1);
  }

  useEffect(() => {
    if (!showing.current) return;
    // a STICKY line holds the band until something displaces it — but only when
    // nothing is waiting, or it would swallow the rest of its own burst
    if (toast?.sticky && pending.current.length === 0) return;
    const t = window.setTimeout(advance, STAGGER_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastId]);

  return { toast, toastId };
}
