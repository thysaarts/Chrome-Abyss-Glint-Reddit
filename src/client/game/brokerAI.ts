/**
 * THE BROKER — the house's AI opponent for YOU vs THE HOUSE (versus vs the
 * computer, Challenges tab). Pure functions over the engine, so the same code
 * drives the live duel AND the headless self-play harness that tunes it.
 *
 * FAIR INFORMATION, by contract: the AI acts on its own turn, where
 * `state.hand` is HER hand. It never reads `state.versus.partnerHand` (the
 * player's tiles) — only its public length. She must feel brilliant, never
 * psychic: everything she sees, a human opponent at the table would see.
 *
 * TIERS follow the bet (10/20/30). All tiers play a full one-move simulation
 * of every candidate (each hand tile × each legal cell, plus banking and the
 * cash-out); higher tiers remove pick noise, weigh threats they'd hand the
 * player, and search the player's best possible reply (over ALL gem values —
 * a fair worst-case, since her opponent's hand is hidden from her).
 *
 * KEEP PURE: no UI imports, no Date/random beyond the injected rng.
 */
import { GameState, TileVal, place, isLegalTarget, bankClusterNow, cashOut, versusEndTurn } from "./engine";

export type BrokerTier = 1 | 2 | 3;

export interface BrokerAction {
  kind: "place" | "bank" | "cashout";
  rotateTo?: number; // hand index to bring to the front before placing
  cell?: string; // place / bank target
}

interface TierCfg {
  noise: number; // 0..1 — chance to pick among near-best instead of best
  threatW: number; // penalty weight for 4/5-sized activated groups left behind
  replyW: number; // opponent best-reply penalty weight (0 = off); worst-case over values
  cashoutIQ: boolean; // weigh the cash-out against the live score race
  flexW: number; // weight for keeping my NEXT tile placeable (bust avoidance)
  // sees a board-CLEAR ending for what it is (the win + the house-rule full
  // bonus). Tier 3 only (Thys ruling): below that she values a clearing move
  // like any other placement and only ever finishes the board "by accident".
  clearIQ: boolean;
}

const TIERS: Record<BrokerTier, TierCfg> = {
  1: { noise: 0.5, threatW: 0.35, replyW: 0, cashoutIQ: false, flexW: 0, clearIQ: false },
  2: { noise: 0.15, threatW: 1, replyW: 0, cashoutIQ: true, flexW: 0.7, clearIQ: false },
  3: { noise: 0, threatW: 1.15, replyW: 0, cashoutIQ: true, flexW: 1.4, clearIQ: true },
};

export const tierForBet = (bet: number): BrokerTier => (bet >= 30 ? 3 : bet >= 20 ? 2 : 1);

const W_BUST = 750; // roughly a life's worth of tempo + cash-out value
const W_ACT = 14; // per newly activated cell (combo progress)
const THREAT_5 = 340; // a 5-group is one tile from gifting the opponent a bank
const THREAT_4 = 90;
const WIN = 1e6;

/** rotate hand index i to the front (mirrors the move codec / UI rotate). */
const rotated = (s: GameState, i: number): GameState =>
  i <= 0 || i >= s.hand.length ? s : { ...s, hand: [...s.hand.slice(i), ...s.hand.slice(0, i)] };

/** connected activated groups and their sizes (public board information).
 *  CLAIMS ARE WALLS: a claimed cluster can't be completed, bridged or banked
 *  by the other seat, so it neither reads as a threat nor merges neighbouring
 *  groups across its edge — mirroring the engine's claim boundary. */
function activatedGroups(s: GameState): number[] {
  const act = new Set(s.activatedCells);
  for (const c of s.versus?.claims ?? []) for (const k of c?.cells ?? []) act.delete(k);
  const seen = new Set<string>();
  const sizes: number[] = [];
  for (const k of act) {
    if (seen.has(k)) continue;
    let size = 0;
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const nb of s.adj.get(c) ?? []) {
        if (act.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
      }
    }
    sizes.push(size);
  }
  return sizes;
}

/** my (the acting seat's) standing vs the opponent in `s`, terminal-aware. */
function terminalValue(next: GameState, mySeat: 0 | 1): number | null {
  if (next.phase === "playing") return null;
  const r = next.versus?.result;
  if (r) {
    if (r.winner === -1) return 0;
    const margin = Math.abs(r.scores[0] - r.scores[1]);
    return (r.winner === mySeat ? WIN : -WIN) + (r.winner === mySeat ? margin : -margin);
  }
  return null;
}

/** score a candidate next-state from the acting seat's perspective. */
function evaluate(prev: GameState, next: GameState, cfg: TierCfg): number {
  const term = terminalValue(next, prev.versus!.turn as 0 | 1);
  // a CLEAR ending is a tier-3 read: below clearIQ she doesn't recognise that
  // finishing the board ends (and likely wins) the game — the move scores like
  // an ordinary placement, so lower tables never snipe the house-rule bonus
  if (term !== null && !(next.phase === "won" && !cfg.clearIQ)) return term;
  let v = 0;
  v += (next.score - prev.score); // points I banked this action
  if (next.livesLeft < prev.livesLeft) v -= W_BUST * (prev.livesLeft - next.livesLeft);
  v += W_ACT * Math.max(0, next.activatedCells.length - prev.activatedCells.length);
  // threats I leave on the table: groups one-or-two tiles from a bankable six
  for (const size of activatedGroups(next)) {
    if (size === 5) v -= THREAT_5 * cfg.threatW;
    else if (size === 4) v -= THREAT_4 * cfg.threatW;
  }
  // BUST AVOIDANCE: games are decided by forced busts as much as by points —
  // keep my remaining tiles playable. Counts distinct hand values with at
  // least one legal build on the next board (my next turn's options).
  if (cfg.flexW > 0 && next.phase === "playing") {
    const values = new Set(next.hand.filter((t) => typeof t === "number" && t >= 1 && t <= 6));
    let playable = 0;
    for (const val of values) {
      const probe = { ...next, hand: [val, ...next.hand.slice(1)] };
      for (const cell of next.order) {
        if (isLegalTarget(probe, cell)) { playable++; break; }
      }
    }
    if (values.size > 0) v += cfg.flexW * 220 * (playable / values.size);
  }
  return v;
}

/** the opponent's best immediate gain on `board`, worst-cased over every gem
 *  value (their hand is hidden — this is the fair paranoid bound). */
function bestReplyGain(board: GameState, sampleCells: number): number {
  let best = 0;
  for (let val = 1; val <= 6; val++) {
    const probe = { ...board, hand: [val as TileVal, ...board.hand.slice(1)] };
    let tried = 0;
    for (const cell of board.order) {
      if (!isLegalTarget(probe, cell)) continue;
      if (++tried > sampleCells) break;
      try {
        const after = place(probe, cell, 0);
        const gain = after.score - board.score;
        if (gain > best) best = gain;
      } catch { /* illegal in a way the guard missed — skip */ }
    }
  }
  return best;
}

/** LIVE: the BANK NOW window opened on her own placement — take it or let it
 *  lapse? Compares the banked-now future against standing pat. */
export function shouldBankNow(state: GameState, cell: string, tier: BrokerTier): boolean {
  const cfg = TIERS[tier];
  const banked = bankClusterNow(state, cell);
  if (banked === state) return false;
  return evaluate(state, banked, cfg) > evaluate(state, state, cfg) + 40;
}

/** Choose the Broker's action for the CURRENT state (must be her turn). */
export function chooseBrokerAction(state: GameState, tier: BrokerTier, rng: () => number = Math.random, opts?: { noBank?: boolean }): BrokerAction | null {
  if (state.phase !== "playing" || !state.versus) return null;
  const cfg = TIERS[tier];
  const cands: { action: BrokerAction; value: number; after: GameState }[] = [];

  // PLACE: every distinct hand tile × every legal cell
  const seenTiles = new Set<string>();
  for (let i = 0; i < state.hand.length; i++) {
    const t = state.hand[i];
    const tileKey = String(t);
    if (seenTiles.has(tileKey)) continue; // identical tiles play identically
    seenTiles.add(tileKey);
    const rs = rotated(state, i);
    for (const cell of state.order) {
      if (!isLegalTarget(rs, cell)) continue;
      try {
        const after = place(rs, cell, 0);
        cands.push({ action: { kind: "place", rotateTo: i, cell }, value: evaluate(state, after, cfg), after });
      } catch { /* skip pathological placements */ }
    }
  }

  // FORCED BUST: no legal build anywhere — the rules still demand a placement,
  // so she picks the least-damaging cell to bust on (the engine's place() owns
  // the bust consequences; evaluate() charges the lost life)
  if (!cands.some((c) => c.action.kind === "place")) {
    for (let i = 0; i < state.hand.length; i++) {
      const t = state.hand[i];
      const tileKey = `b${String(t)}`;
      if (seenTiles.has(tileKey)) continue;
      seenTiles.add(tileKey);
      const rs = rotated(state, i);
      for (const cell of state.order) {
        if (state.activatedCells.includes(cell)) continue;
        try {
          const after = place(rs, cell, 0);
          if (after === rs) continue;
          cands.push({ action: { kind: "place", rotateTo: i, cell }, value: evaluate(state, after, cfg), after });
        } catch { /* truly unplaceable cell */ }
      }
    }
  }

  // BANK NOW: one candidate per activated group (its first cell reaches it).
  // The LIVE game banks only through the offer window (opts.noBank) — the
  // standalone candidates serve the headless self-play harness.
  if (state.freeBanksLeft > 0 && !opts?.noBank) {
    const seenGroup = new Set<string>();
    for (const cell of state.activatedCells) {
      if (seenGroup.has(cell)) continue;
      // mark this whole group visited
      const stack = [cell];
      seenGroup.add(cell);
      const act = new Set(state.activatedCells);
      while (stack.length) {
        const c = stack.pop()!;
        for (const nb of state.adj.get(c) ?? []) if (act.has(nb) && !seenGroup.has(nb)) { seenGroup.add(nb); stack.push(nb); }
      }
      const after = bankClusterNow(state, cell);
      if (after !== state) cands.push({ action: { kind: "bank", cell }, value: evaluate(state, after, cfg), after });
    }
  }

  // CASH OUT during the rush: worth it when it locks the win (or dodges a loss)
  if (state.deathMatch && cfg.cashoutIQ) {
    const after = cashOut(state);
    if (after !== state) {
      const myFinal = (after.versus?.summary?.[state.versus.turn]?.finalScore ?? after.score);
      const theirLive = state.versus.partnerScore;
      // cash out when it puts me clearly ahead of their LIVE score (they still
      // play on — demand a margin before surrendering the board)
      const value = myFinal > theirLive + 400 ? WIN / 2 + (myFinal - theirLive) : -200;
      cands.push({ action: { kind: "cashout" }, value, after });
    }
  }

  if (cands.length === 0) return null;

  // tier 3: charge each strong candidate with the player's best possible reply
  if (cfg.replyW > 0) {
    cands.sort((a, b) => b.value - a.value);
    const K = Math.min(6, cands.length);
    for (let i = 0; i < K; i++) {
      const c = cands[i];
      if (c.after.phase !== "playing") continue; // terminal — no reply exists
      const handed = versusEndTurn(c.after); // the board as the player receives it
      c.value -= cfg.replyW * bestReplyGain(handed, 40);
    }
  }

  cands.sort((a, b) => b.value - a.value);
  // tier 1: a light human wobble — sometimes take a near-best line instead
  if (cfg.noise > 0 && cands.length > 1 && rng() < cfg.noise) {
    const near = cands.filter((c) => c.value >= cands[0].value * 0.8 && cands[0].value - c.value < 300).slice(0, 3);
    return near[Math.floor(rng() * near.length)]?.action ?? cands[0].action;
  }
  return cands[0].action;
}

/** Apply an action in the PURE engine (self-play + tests; the live game routes
 *  through the UI handlers instead so animations play). Returns the state
 *  AFTER the action and the turn hand-off. */
export function applyBrokerAction(state: GameState, action: BrokerAction): GameState {
  let s = state;
  if (action.kind === "place") {
    s = rotated(s, action.rotateTo ?? 0);
    s = place(s, action.cell!, 0);
  } else if (action.kind === "bank") {
    s = bankClusterNow(s, action.cell!);
    return s; // banking keeps the turn — the placement follows
  } else if (action.kind === "cashout") {
    s = cashOut(s);
    return s;
  }
  if (s.phase === "playing" && s.versus?.moved) s = versusEndTurn(s);
  return s;
}
