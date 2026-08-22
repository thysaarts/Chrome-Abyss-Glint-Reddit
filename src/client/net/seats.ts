/**
 * SEAT MAPPING for online play.
 *
 * Both devices boot the identical game from `seed + names`, so they agree on the
 * board and on whose turn it is (`turn`). Each device only needs to know which
 * seat IT occupies. "Entry" is the order a device's name was passed to newGame:
 * entry 0 = the host (first name), entry 1 = the guest (second name).
 *
 *  - co-op has no ritual: seat == entry (host is seat 0 / green).
 *  - versus runs the opening ritual, which can swap who opens; the engine records
 *    the result in `versus.seatByEntry`, so the host is not always seat 0.
 */
import type { GameState } from "../game/engine";

export type Entry = 0 | 1;

/** The seat this device occupies, given its entry (0 = host, 1 = guest). */
export function seatForEntry(state: GameState, entry: Entry): number {
  if (state.versus) return state.versus.seatByEntry[entry];
  return entry; // co-op: entry order is the seat
}

/** Whose turn is it (the active seat)? */
export function activeSeat(state: GameState): number {
  return state.versus?.turn ?? state.coop?.turn ?? 0;
}

/** Is it this device's turn to act? */
export function isMyTurn(state: GameState, entry: Entry): boolean {
  return seatForEntry(state, entry) === activeSeat(state);
}
