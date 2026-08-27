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
 *
 * HONEST HANDS (Thys 2026-08-27): until the acting hand is REVEALED
 * (state.handRevealed — the difficulty threshold or GLINT RUSH), a human can
 * only place the FRONT tile: the slide wheel doesn't exist yet and the stack
 * is face-down even to its owner. The AI obeys the same rule — it neither
 * rotates to a hidden tile nor lets the bust-avoidance term peek at values it
 * hasn't been shown. (Before this fix both the Broker and the autopilot chose
 * freely from the whole hand, which also made the opponent box's NEXT gem lie:
 * it shows hand[0], the tile the seat will come out with.)
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

/** my (the acting seat's) standing vs the opponent in `s`, terminal-aware.
 *  SOLO (no versus): a board CLEAR is the jackpot; any other ending (lives gone,
 *  hand played out) ranks by the final score, so a forced last placement still
 *  picks the highest-scoring line rather than treating all ends as equal. */
function terminalValue(next: GameState, mySeat: 0 | 1): number | null {
  if (next.phase === "playing") return null;
  const r = next.versus?.result;
  if (r) {
    if (r.winner === -1) return 0;
    const margin = Math.abs(r.scores[0] - r.scores[1]);
    return (r.winner === mySeat ? WIN : -WIN) + (r.winner === mySeat ? margin : -margin);
  }
  if (!next.versus) return (next.phase === "won" ? WIN : -WIN) + (next.finalScore ?? next.score);
  return null;
}

/** FAIR VIEW (Thys 2026-08-27): the one-move simulations run the REAL engine,
 *  so a candidate that would reveal a buried Resurrect / Quadriant shows its
 *  payoff — X-ray vision no player has ("Hidden until revealed" is the rule).
 *  Every chooser therefore simulates on a copy with the bonus gems stripped:
 *  the AI plans as if they don't exist, and finding one stays pure luck. The
 *  chosen action is applied to the REAL state by the driver, so a lucky
 *  uncover still pays out normally. */
function fairView(s: GameState): GameState {
  let hidden = false;
  for (const c of s.cells.values()) if (c.bonusGem != null) { hidden = true; break; }
  if (!hidden) return s;
  const cells = new Map(s.cells);
  for (const [k, c] of cells) if (c.bonusGem != null) cells.set(k, { ...c, bonusGem: null });
  return { ...s, cells };
}

/** newly ACTIVATED combos of one family — Drift (sequences) vs sets (same kind). */
const isDriftCombo = (name: string) => name.includes("Drift");
function familyCount(s: GameState, drift: boolean): number {
  let n = 0;
  for (const c of s.activatedCombos) if (isDriftCombo(String(c.name)) === drift) n++;
  return n;
}

/** how much ALREADY-ACTIVATED cluster the placed cell connects to — the size of
 *  the prior investment a resulting bank completes. 0–2 = a bank flashed from
 *  scratch (instant); 3+ = the second step of a genuine two-step setup. */
function preBuiltAt(s: GameState, cell: string): number {
  const act = new Set(s.activatedCells);
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const nb of s.adj.get(cell) ?? []) if (act.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
  while (stack.length) {
    const c = stack.pop()!;
    for (const nb of s.adj.get(c) ?? []) if (act.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
  }
  return seen.size;
}

/** score a candidate next-state from the acting seat's perspective.
 *  `placedCell` (when the candidate is a placement) lets the opening read
 *  distinguish an INSTANT bank from a BUILT one — see below. */
function evaluate(prev: GameState, next: GameState, cfg: TierCfg, placedCell?: string): number {
  const term = terminalValue(next, (prev.versus?.turn ?? 0) as 0 | 1);
  // a CLEAR ending is a tier-3 read: below clearIQ she doesn't recognise that
  // finishing the board ends (and likely wins) the game — the move scores like
  // an ordinary placement, so lower tables never snipe the house-rule bonus
  if (term !== null && !(next.phase === "won" && !cfg.clearIQ)) return term;
  let v = 0;
  // OPENING DISCIPLINE (Thys 2026-08-27, every tier): before the FIRST collapse
  // the game is long — immediate points count LESS and building activations
  // counts MORE (two-step banks: set up now, bank in a later turn when it's
  // convenient). Chasing instant 6+ combos early drains the hand. After
  // collapse 1 the discount lifts and normal greed returns.
  const opening = prev.side === 6 && !prev.deathMatch;
  // INSTANT vs BUILT banks (the fix behind Thys's 2026-08-27 field report: a
  // flat discount could never restrain 600–6,000-point auto-banks — 22% of a
  // Hex chain still dwarfed every activation, so the AI stayed a bank-chaser).
  // A bank that completes a cluster the AI already INVESTED in (placed cell
  // touches 3+ previously-activated cells) is the second step of two-step play
  // — it keeps the discounted value. A bank flashed from SCRATCH is capped
  // BELOW a 3-cell activation (168), so any real setup option outranks it and
  // it's only ever taken when nothing better exists.
  let scoreGain = (next.score - prev.score) * (opening ? 0.22 : 1);
  if (opening && placedCell !== undefined && next.banks > prev.banks && preBuiltAt(prev, placedCell) < 3) {
    scoreGain = Math.min(scoreGain, 120);
  }
  v += scoreGain; // points I banked this action
  if (next.livesLeft < prev.livesLeft) v -= W_BUST * (prev.livesLeft - next.livesLeft);
  v += W_ACT * (opening ? 4 : 1) * Math.max(0, next.activatedCells.length - prev.activatedCells.length);
  // DRIFT-FIRST (opening only): a fresh sequence combo keeps the board's values
  // diverse; a same-kind set drains one mineral and raises later bust odds.
  // Deliberately SMALLER than the activation/bank terms, so priority 1
  // (activate over bank) always outranks priority 2 (Drift over set).
  if (opening) {
    v += 60 * Math.max(0, familyCount(next, true) - familyCount(prev, true));
    v -= 30 * Math.max(0, familyCount(next, false) - familyCount(prev, false));
  }
  // SURVIVAL (any phase, every tier): with 4 or fewer minerals in hand, staying
  // alive outranks points — reward moves that GAIN minerals (overflow refills,
  // which also justify a big bank when the overflow is guaranteed), sweep
  // Dross, or resolve Nebulite.
  if (prev.hand.length <= 4 && next.phase === "playing") {
    v += 320 * Math.max(0, next.hand.length - prev.hand.length);
    v += 260 * Math.max(0, (next.drossCleared ?? 0) - (prev.drossCleared ?? 0));
    v += 220 * Math.max(0, (next.nebulitesRefined ?? 0) - (prev.nebulitesRefined ?? 0) + (next.coresCollected - prev.coresCollected));
  }
  // threats I leave on the table: groups one-or-two tiles from a bankable six.
  // Softened in the opening — the two-step CLAIM (the live driver claims fresh
  // setups pre-collapse) walls the group off from the other seat anyway.
  for (const size of activatedGroups(next)) {
    if (size === 5) v -= THREAT_5 * cfg.threatW * (opening ? 0.35 : 1);
    else if (size === 4) v -= THREAT_4 * cfg.threatW * (opening ? 0.35 : 1);
  }
  // BUST AVOIDANCE: games are decided by forced busts as much as by points —
  // keep my remaining tiles playable. Counts distinct hand values with at
  // least one legal build on the next board (my next turn's options).
  // HONEST HANDS: only once the hand is revealed — a face-down stack is
  // unknown even to its owner, so there is nothing fair to plan around.
  if (cfg.flexW > 0 && next.phase === "playing" && next.handRevealed) {
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
  state = fairView(state); // no peeking at buried bonus gems in the bank sim
  const banked = bankClusterNow(state, cell);
  if (banked === state) return false;
  return evaluate(state, banked, cfg) > evaluate(state, state, cfg) + 40;
}

/** the activated group reachable from `cell` (flood over activated neighbours) */
function groupSizeAt(state: GameState, cell: string): number {
  const act = new Set(state.activatedCells);
  if (!act.has(cell)) return 0;
  const group = new Set<string>([cell]);
  const stack = [cell];
  while (stack.length) {
    const c = stack.pop()!;
    for (const nb of state.adj.get(c) ?? []) {
      if (act.has(nb) && !group.has(nb)) { group.add(nb); stack.push(nb); }
    }
  }
  return group.size;
}

/** VERSUS BANK NOW with the two-step opening (Thys 2026-08-27): before the
 *  first collapse a small cluster is a SETUP — decline the early bank (the
 *  claim ring protects it instead; see the App claim driver) and bank on a
 *  later, riper offer. A cluster of 5 is ripe. After collapse 1, and any time
 *  a mineral gain matters, the plain maths decides. */
export function shouldBankNowVersus(state: GameState, cell: string, tier: BrokerTier): boolean {
  const opening = state.side === 6 && !state.deathMatch;
  if (opening && groupSizeAt(state, cell) < 5) return false;
  return shouldBankNow(state, cell, tier);
}

/** Choose the Broker's action for the CURRENT state (must be her turn). */
export function chooseBrokerAction(state: GameState, tier: BrokerTier, rng: () => number = Math.random, opts?: { noBank?: boolean }): BrokerAction | null {
  if (state.phase !== "playing" || !state.versus) return null;
  state = fairView(state); // no peeking at buried bonus gems in the sims
  const cfg = TIERS[tier];
  const cands: { action: BrokerAction; value: number; after: GameState }[] = [];

  // HONEST HANDS: face-down stack → only the front tile is playable (see header)
  const pickable = state.handRevealed ? state.hand.length : Math.min(1, state.hand.length);
  // PLACE: every distinct PICKABLE hand tile × every legal cell
  const seenTiles = new Set<string>();
  for (let i = 0; i < pickable; i++) {
    const t = state.hand[i];
    const tileKey = String(t);
    if (seenTiles.has(tileKey)) continue; // identical tiles play identically
    seenTiles.add(tileKey);
    const rs = rotated(state, i);
    for (const cell of state.order) {
      if (!isLegalTarget(rs, cell)) continue;
      try {
        const after = place(rs, cell, 0);
        cands.push({ action: { kind: "place", rotateTo: i, cell }, value: evaluate(state, after, cfg, cell), after });
      } catch { /* skip pathological placements */ }
    }
  }

  // FORCED BUST: no legal build anywhere — the rules still demand a placement,
  // so she picks the least-damaging cell to bust on (the engine's place() owns
  // the bust consequences; evaluate() charges the lost life)
  if (!cands.some((c) => c.action.kind === "place")) {
    for (let i = 0; i < pickable; i++) {
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
          cands.push({ action: { kind: "place", rotateTo: i, cell }, value: evaluate(state, after, cfg, cell), after });
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
      if (after !== state) cands.push({ action: { kind: "bank", cell }, value: evaluate(state, after, cfg, cell), after });
    }
  }

  // CASH OUT during the rush: worth it when it locks the win (or dodges a loss)
  if (state.deathMatch && cfg.cashoutIQ) {
    const after = cashOut(state);
    if (after !== state) {
      const myFinal = (after.versus?.summary?.[state.versus!.turn]?.finalScore ?? after.score);
      const theirLive = state.versus!.partnerScore;
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

// ---- SOLO AUTOPILOT (DEV TOOLS › AI player) --------------------------------
// The same brain pointed at a single-player run. Two versus instincts flip:
// a 4/5-group is an OPPORTUNITY here (I complete it next turn), never a threat
// (threatW 0), and recognising a board-clear ending is always on — a clear is
// the solo jackpot at every level. The tier (DEV TOOLS picker) sets the
// temperament: wobble and bust-avoidance mirror the Broker's own ladder.
const SOLO_CFGS: Record<BrokerTier, TierCfg> = {
  1: { noise: 0.5, threatW: 0, replyW: 0, cashoutIQ: true, flexW: 0, clearIQ: true },
  2: { noise: 0.15, threatW: 0, replyW: 0, cashoutIQ: true, flexW: 0.7, clearIQ: true },
  3: { noise: 0, threatW: 0, replyW: 0, cashoutIQ: true, flexW: 1.4, clearIQ: true },
};

/** Choose the autopilot's next action in a SOLO run (and CO-OP, where the
 *  partners share one score — the solo maths IS the cooperative maths).
 *  Placements only — banking goes through the live BANK NOW window
 *  (shouldBankNowSolo), mirroring how the duel driver plays. During GLINT RUSH
 *  a bust forfeits the whole run, so the moment no safe build exists the ONLY
 *  sane move is the cash-out. */
export function chooseSoloAction(state: GameState, rng: () => number = Math.random, tier: BrokerTier = 2): BrokerAction | null {
  if (state.phase !== "playing" || state.versus) return null;
  state = fairView(state); // no peeking at buried bonus gems in the sims
  const cfg = SOLO_CFGS[tier];
  const cands: { action: BrokerAction; value: number }[] = [];

  // HONEST HANDS: face-down stack → only the front tile is playable (see header)
  const pickable = state.handRevealed ? state.hand.length : Math.min(1, state.hand.length);
  const seenTiles = new Set<string>();
  for (let i = 0; i < pickable; i++) {
    const t = state.hand[i];
    const tileKey = String(t);
    if (seenTiles.has(tileKey)) continue;
    seenTiles.add(tileKey);
    const rs = rotated(state, i);
    for (const cell of state.order) {
      if (!isLegalTarget(rs, cell)) continue;
      try {
        const after = place(rs, cell, 0);
        cands.push({ action: { kind: "place", rotateTo: i, cell }, value: evaluate(state, after, cfg, cell) });
      } catch { /* skip pathological placements */ }
    }
  }

  if (cands.length === 0) {
    // NO SAFE BUILD anywhere. In the rush, busting forfeits everything the run
    // earned (Thys design rule) — cash out instead, always.
    if (state.deathMatch) return cashOut(state) !== state ? { kind: "cashout" } : null;
    // pre-rush: the rules demand a placement — bust on the least-damaging cell
    for (let i = 0; i < pickable; i++) {
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
          cands.push({ action: { kind: "place", rotateTo: i, cell }, value: evaluate(state, after, cfg, cell) });
        } catch { /* truly unplaceable cell */ }
      }
    }
  }

  if (cands.length === 0) return null;
  cands.sort((a, b) => b.value - a.value);
  if (cfg.noise > 0 && cands.length > 1 && rng() < cfg.noise) {
    const near = cands.filter((c) => c.value >= cands[0].value * 0.8 && cands[0].value - c.value < 300).slice(0, 3);
    return near[Math.floor(rng() * near.length)]?.action ?? cands[0].action;
  }
  return cands[0].action;
}

/** SOLO BANK NOW window: bank when the group is DEAD-ENDED (no hand mineral
 *  can legally extend it — the six will never come), or any time in the rush
 *  (threshold 2; lock the points while the board is dangerous). Otherwise let
 *  the offer lapse and keep building toward the auto-banked six. */
export function shouldBankNowSolo(state: GameState, cell: string): boolean {
  if (state.deathMatch) return true;
  state = fairView(state); // no peeking at buried bonus gems in the growth probes
  // flood the offered group
  const act = new Set(state.activatedCells);
  const group = new Set<string>([cell]);
  const stack = [cell];
  while (stack.length) {
    const c = stack.pop()!;
    for (const nb of state.adj.get(c) ?? []) {
      if (act.has(nb) && !group.has(nb)) { group.add(nb); stack.push(nb); }
    }
  }
  // can ANY distinct hand mineral legally build on a cell touching the group?
  // HONEST HANDS: pre-reveal only the front tile is known — judge growth by it
  const values = new Set(state.handRevealed ? state.hand : state.hand.slice(0, 1));
  for (const g of group) {
    for (const nb of state.adj.get(g) ?? []) {
      if (act.has(nb)) continue;
      for (const val of values) {
        const probe = { ...state, hand: [val, ...state.hand.slice(1)] };
        if (isLegalTarget(probe, nb)) return false; // still growable — wait
      }
    }
  }
  return true; // dead-ended — take the points before an overflow eats them
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
