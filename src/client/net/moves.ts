/**
 * MOVES AS MESSAGES — the whole of online play.
 *
 * A turn is one of a small set of engine actions. We serialize each as a tiny
 * record; the opponent's device replays it through the SAME pure engine
 * functions and arrives at the identical board. Nothing about the board itself
 * travels — only the action.
 *
 * `rotate`/`swap` are pure hand reorderings (they change which tile places
 * next), so they must ride the wire too or the two hands drift apart. They
 * mirror useNebuliteGame's local rotateHand/swapHand exactly.
 */
import { GameState, place, bankClusterNow, claimCluster, versusEndTurn, coopEndTurn, cashOut, offerCashOut, resolveCashOut } from "../game/engine";

export type NetMoveKind = "place" | "bank" | "claim" | "pass" | "cashout" | "rotate" | "swap" | "cashoutOffer" | "cashoutAccept" | "cashoutDecline";

export interface NetMove {
  seq: number; // 0-based order within the match
  seat: number; // which seat authored it (0 = green/opener, 1 = second)
  kind: NetMoveKind;
  cell?: string; // place / bank / claim
  index?: number; // rotate / swap (hand index)
  choice?: number; // place: combo-picker branch (0 unless a picker was shown)
}

/** Reorder the hand so index i becomes the placing tile, preserving cycle order
 *  (mirrors useNebuliteGame.rotateHand). */
function rotate(s: GameState, i: number): GameState {
  if (i <= 0 || i >= s.hand.length) return s;
  return { ...s, hand: [...s.hand.slice(i), ...s.hand.slice(0, i)] };
}

/** Swap hand[0] with hand[i] (mirrors useNebuliteGame.swapHand — only for the
 *  short late-game wheel of ≤3 tiles). */
function swap(s: GameState, i: number): GameState {
  if (i <= 0 || i >= s.hand.length) return s;
  const hand = s.hand.slice();
  [hand[0], hand[i]] = [hand[i], hand[0]];
  return { ...s, hand };
}

/** Apply one wire move to a state, returning the next state. Pure — the same
 *  input always yields the same output, which is what keeps two devices in
 *  lock-step. */
export function applyNetMove(state: GameState, m: NetMove): GameState {
  switch (m.kind) {
    case "place": return place(state, m.cell!, m.choice ?? 0);
    case "bank": return bankClusterNow(state, m.cell!);
    case "claim": return claimCluster(state, m.cell!);
    case "pass": return state.versus ? versusEndTurn(state) : coopEndTurn(state);
    case "cashout": return cashOut(state);
    case "cashoutOffer": return offerCashOut(state);
    case "cashoutAccept": return resolveCashOut(state, true);
    case "cashoutDecline": return resolveCashOut(state, false);
    case "rotate": return rotate(state, m.index ?? 0);
    case "swap": return swap(state, m.index ?? 0);
  }
}

/** Replay a whole move list from a fresh game state (used to catch a late
 *  joiner up, or to re-derive a match for score validation). */
export function replayMoves(initial: GameState, moves: NetMove[]): GameState {
  return moves.slice().sort((a, b) => a.seq - b.seq).reduce(applyNetMove, initial);
}
