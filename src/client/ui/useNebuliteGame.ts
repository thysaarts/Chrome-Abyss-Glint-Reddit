import { useCallback, useEffect, useRef, useState } from "react";
import {
  newGame,
  place,
  bankClusterNow,
  describePlace,
  placeAlternatives,
  logOnly,
  visibleTile,
  cashOut,
  GameState,
  NewGameOpts,
  TileVal,
  GLINT,
  CORE,
  RESURRECT,
  QUADRIANT,
  ZENITH,
  isBonusGem,
} from "../game/engine";
import { recordMoveTrace, clearTrace } from "../game/trace";
import { logText, chainLabel } from "../content/content";
import { sfx } from "../audio/sfx";
import { haptic } from "../game/haptics";
import { gameOptions } from "./settings";
import { loadStats } from "../game/stats";
import { abilityUnlocked } from "../game/challenges";
import { chainBonus, ComboName } from "../game/combos";

// Pretty display names for the COMBO LINEUP rows (mirrors the engine's log labels).
const COMBO_PRETTY: Record<ComboName, string> = {
  Echo: "Echo", Trips: "Trips", Quad: "Quad", Pentad: "Pentad",
  Hex: "Hex", Drift: "Drift", LongDrift: "Long Drift", FullDrift: "Full Drift",
};
const prettyCombo = (n: ComboName) => COMBO_PRETTY[n];
const isRunCombo = (n: ComboName) => n === "Drift" || n === "LongDrift" || n === "FullDrift";

// ---- timing constants (ms) ----
const T = {
  bankHoldGlow: 400, // hold the white activated glow before lighting up
  bankLightStep: 180, // per-tile light-up
  bankFly: 1000, // total fly-to-score duration window
  bankFlyStagger: 90, // stagger between flying tiles
  bustLift: 850, // placed + covered tile lift and float
  bustFly: 850, // fly to bust score
  bustFlyStagger: 120,
  bustDropNext: 700, // next tile drops into the gap
  specialFly: 580, // glint/core fly
  toHandFly: 300, // covered tile -> hand
  activateStep: 110, // per-tile light-up when a non-banking combo activates
  activateHold: 260, // hold the fully-lit combo before zooming out
  snap: 240, // magnetic "thick-thumbs" rescue snap to a neighbour
  zoomOut: 400, // wait for the focus-zoom to settle back OUT (0.36s transition + buffer)
};

// COMBO CHOICE — when a placement could resolve more than one way, the best
// option pre-lights blue and auto-confirms after this window (tap the grey
// alternative to switch — which resets the window — or tap the blue to commit
// instantly). Exported for the countdown chip in App.
// legacy constant (the LIVE window is per-difficulty: gameOptions.choiceWindowMs
// — easy 3000, medium/hard 2000); kept for reference and tests
export const CHOICE_WINDOW = 2000;

// COMBO LINEUP timings — shared with the overlay component (App.tsx), which runs
// its own matching timeline: fly to the slots → linger (names shown) → dive in.
export const LINEUP_T = {
  fly: 550, // board cell → lineup slot (movement trimmed; the read-it beat is kept)
  stagger: 45, // per-tile start offset while forming up
  linger: 950, // hold the formed combos + names (the user-facing "read it" beat)
  dive: 400, // lineup slot → score box
  diveStagger: 35, // per-tile start offset while diving
};

export interface FlyingTile {
  id: string;
  value: TileVal;
  fromKey: string | null; // board cell to start from (screen coords resolved by mapper)
  fromXY?: { x: number; y: number }; // explicit start (for hand-origin)
  fromCentre?: boolean; // start from the centre of the board (for the clear bonus)
  fromScreen?: boolean; // start from the centre of the viewport (Mother Lode Nebulite)
  to: "score" | "bust" | "hand" | "gap" | "multiplier" | "screen" | "wallet";
  toKey?: string; // for "gap" — the cell to land in
  delay: number; // ms before it starts moving
  fast?: boolean; // use the quicker fly transition (e.g. to-hand)
  magnetic?: boolean; // snappy "magnetic" attract easing (thick-thumbs rescue snap)
  fadeIn?: boolean; // spawn invisible and fade in while moving (off-board arrivals)
  label?: string; // if set, render this text (e.g. "+5000") instead of a gem
  negative?: boolean; // render the label in red (a penalty deduction)
  swirl?: boolean; // spin + shrink away (a bonus gem hiding itself under a tile)
  glow?: string; // extra CSS drop-shadow colour (bonus-gem flights)
  size?: number; // render at a custom px size (the big seeding swirl)
}

export type Mapper = (key: string) => { x: number; y: number } | null;

interface AnimState {
  playing: boolean;
  // "focus zoom": while true, the board stays zoomed-in on the action. Set at the
  // start of an action's animation and cleared when it (and its animation) finish,
  // so the board leans in for the moment, then settles back out.
  focused: boolean;
  litCells: Set<string>; // cells currently lit-up (bank light-up)
  redCells: Set<string>; // cells flashed red (strand overflow heading to hand)
  hiddenCells: Set<string>; // cells whose tile is mid-flight (don't render in place)
  // During a non-banking activation we reveal the combo's white rings one-by-one
  // from the placed tile outward. When non-null, only these cells show the
  // activated ring (the rest of the frozen board's activated cells stay dark).
  activateReveal: Set<string> | null;
  // The just-placed cell — its gem plays the drop-in bounce.
  dropCell: string | null;
  flying: FlyingTile[];
  // a SEPARATE channel for the opening bonus-gem swirl, so it can run alongside
  // the mineral rain / special drops (which own `flying`) without clashing
  seedFlying?: FlyingTile[];
  freezeState: GameState | null; // the PRE-commit board to show during animation
  multiplierLabel: string | null; // e.g. "×6" shown beside the parked multiplier tile
  bankedPlate: string | null; // "BANKED ×N" — the gold glass plate stamped bottom-centre while tiles fly
  banner: string | null; // centre-screen text (e.g. "RESHUFFLE")
  shake: boolean; // shake the board + up-next stack (Rule 5)
  // THE ABYSS COLLAPSES: a multi-phase shrink. `phase` drives the big "SHRINKING"
  // word (which itself shrinks) and a scale transform on the board. `vanishing` are
  // cells (outer ring) currently being pulled in / removed, shown collapsing.
  shrinking?: { phase: number; scale: number; vanishing: Set<string>; final?: boolean; fromCells: number; toCells: number } | null;
  rushTitle?: boolean; // the "GLINT RUSH / FINAL ROUND" title after the final collapse
  // MOTHER LODE: the 6-tiles → Nebulite refine sequence. `phase` "gather" shows the
  // source gem ×count; "fuse" morphs it into the Nebulite(s). Null when idle.
  motherLode?: { phase: "gather" | "fuse"; sourceValue: number; count: number; nebulites: number; bonus: number } | null;
  // SINGULARITY: a shaped board's wedge cells drop into the abyss. phase 0 = the
  // banner slams in while the doomed cells tremble; phase 1 = they fall.
  singularity?: { phase: 0 | 1; cells: Set<string> } | null;
  // A GENERAL downward-fall channel (independent of the singularity): cells that
  // drop off the bottom of the board. Used for the DISCARDED combo on a bust —
  // the activated group you were building falls away, gem by gem.
  fallCells?: Set<string> | null;
  fallGo?: boolean;
  // THE THIRD BUST: the final heart flies to screen centre ("fly") and BURSTS
  // ("burst"), then the end card follows.
  finalHeart?: "fly" | "break" | null;
  // COMBO LINEUP — the banked tiles first line up in combo rows under the score
  // (a ghost copy stands in where one tile sat in two combos), each row named;
  // they linger a beat, then dive into the score. Rendered by ComboLineupOverlay,
  // which runs its own timeline against the shared LINEUP_T constants.
  comboLineup?: {
    rows: { name: string; tiles: { cell: string | null; value: TileVal; ghost: boolean; jokerValue?: number }[] }[];
    chain: string | null;
    // QUADRIANT revealed by this bank — its own row under the combos: the gem, ×4,
    // the tile it covered and that tile's face value
    quadriant?: { value: number; face: number; bonus: number } | null;
  } | null;
  // COMBO CHOICE — the pre-select-and-confirm picker: blue = the selected
  // resolution, grey = the alternatives' other cells, key = the placed cell
  // (anchors the countdown chip), tick bumps to restart the chip's drain.
  choice?: { blue: Set<string>; grey: Set<string>; key: string; tick: number } | null;
  // GAME START — the minerals rain in first (staggered drop), then the specials
  // (Dross / Nebulite) pop in ON TOP one by one: they visibly arrive over a board
  // that was already there, teaching that a special always covers a buried gem.
  entryDrop?: boolean;
  // The dramatic opening count over the board: "3" → "2" → "1" during the rain,
  // "go" slamming in as the last special lands. Null when idle / disabled.
  countdown?: "3" | "2" | "1" | "go" | null;
}

const IDLE: AnimState = {
  playing: false,
  focused: false,
  litCells: new Set(),
  redCells: new Set(),
  hiddenCells: new Set(),
  seedFlying: [],
  activateReveal: null,
  dropCell: null,
  flying: [],
  freezeState: null,
  multiplierLabel: null,
  bankedPlate: null,
  banner: null,
  shake: false,
  shrinking: null,
  rushTitle: false,
  motherLode: null,
  singularity: null,
  fallCells: null,
  fallGo: false,
  finalHeart: null,
  comboLineup: null,
  choice: null,
};

// Thrown (and swallowed) to ABORT an in-flight animation sequence when a new
// game starts mid-animation. Without it, the orphaned async sequence would keep
// running and commit the OLD game's state over the freshly-started board.
const ABORT = Symbol("seq-abort");

function buildInitial(opts: NewGameOpts): GameState {
  return newGame({ handSize: 9, ...opts });
}

export function useNebuliteGame(initialSide: 4 | 5 | 6) {
  const [state, setState] = useState<GameState>(() => buildInitial({ side: initialSide }));
  const [anim, setAnim] = useState<AnimState>(IDLE);
  const [settling, setSettling] = useState(false); // brief hold before showing end popup
  // OPTION 3: after the player makes a combo, an early-bank offer with a timed BANK
  // button. `cellKey` is the just-placed cell (whose cluster would bank).
  const [earlyBankOffer, setEarlyBankOffer] = useState<{ cellKey: string } | null>(null);

  const mapperRef = useRef<Mapper | null>(null);
  const busyRef = useRef(false);
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;
  // the last-rendered anim frame, so the commit-time safety net can contract
  // exactly the board the player is looking at
  const animRef = useRef<AnimState>(anim);
  animRef.current = anim;
  // set by animateShrink: the COLLAPSE beat has been staged for the current action
  const shrinkAnimatedRef = useRef(false);
  // set by animateSingularity: the SINGULARITY beat has been staged for this action
  const singularityAnimatedRef = useRef(false);
  // THE PERFORMED-SIDE LEDGER — the last grid side the COLLAPSE beat actually
  // performed on screen. Only animateShrink and a new game may update it. The
  // commit-time safety net compares the committed side against THIS, never
  // against the on-screen photograph: a beat that renders the committed
  // (already collapsed) board early can swap the scenery, but it can't erase
  // the debt recorded here.
  const performedSideRef = useRef(state.side);

  // SNAP DETECTOR — the rendered board's side may never be smaller than the
  // last side the COLLAPSE beat performed. Any frame that violates this IS the
  // silent snap, whichever path produced it. Kept on in production (it's one
  // comparison per frame); the counter feeds the headless simulations.
  useEffect(() => {
    const side = (anim.freezeState ?? state).side;
    if (side < performedSideRef.current) {
      console.error(
        `SNAP-DETECT: a side-${side} board reached the screen before its COLLAPSE beat (last performed side ${performedSideRef.current})`
      );
      if (typeof window !== "undefined") {
        (window as unknown as { __glintSnapDetect?: number }).__glintSnapDetect =
          ((window as unknown as { __glintSnapDetect?: number }).__glintSnapDetect ?? 0) + 1;
      }
    }
  }, [anim.freezeState, state]);
  const earlyBankOfferRef = useRef(earlyBankOffer);
  earlyBankOfferRef.current = earlyBankOffer;
  const offerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // INTERACTION GATE — a board-resizing beat (COLLAPSE / SINGULARITY) must not
  // start while the player's finger is down on the board (they may be lining up
  // their next move while the previous action's chain is still resolving). The
  // beat queues here and fires the moment the touch lifts. A hard cap keeps a
  // resting finger from stalling the game forever.
  const boardHeldRef = useRef(false);
  const holdWaitersRef = useRef<(() => void)[]>([]);
  const setBoardHeld = useCallback((held: boolean) => {
    boardHeldRef.current = held;
    if (!held && holdWaitersRef.current.length) {
      const waiters = holdWaitersRef.current;
      holdWaitersRef.current = [];
      waiters.forEach((w) => w());
    }
  }, []);
  const waitForBoardRelease = async (capMs = 5000) => {
    if (!boardHeldRef.current) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(cap); resolve(); } };
      const cap = setTimeout(finish, capMs);
      holdWaitersRef.current.push(finish);
    });
  };

  const setMapper = useCallback((fn: Mapper) => {
    mapperRef.current = fn;
  }, []);

  // The animation-sequence GENERATION. `start` bumps it; every animation await
  // goes through `pause`, which re-checks it after waking — so a restart aborts
  // any orphaned sequence at its next beat instead of letting it run to commit.
  const seqGenRef = useRef(0);
  const pause = useCallback(async (ms: number) => {
    const g = seqGenRef.current;
    await new Promise<void>((r) => setTimeout(r, ms));
    if (seqGenRef.current !== g) throw ABORT;
  }, []);

  // COMBO CHOICE — the pre-select-and-confirm picker's live state. `resolve`
  // is the staged placement's resolution closure (called with the chosen index).
  const choiceRef = useRef<null | {
    cellKey: string;
    alts: { cells: string[] }[];
    sel: number;
    tick: number;
    timer: ReturnType<typeof setTimeout> | null;
    resolve: (i: number) => void;
  }>(null);

  const paintChoice = useCallback(() => {
    const c = choiceRef.current;
    if (!c) return;
    const blue = new Set(c.alts[c.sel].cells);
    blue.add(c.cellKey);
    const grey = new Set<string>();
    c.alts.forEach((a, i) => {
      if (i !== c.sel) a.cells.forEach((k) => { if (!blue.has(k)) grey.add(k); });
    });
    setAnim((a) => ({ ...a, choice: { blue, grey, key: c.cellKey, tick: c.tick } }));
  }, []);

  const confirmChoice = useCallback(() => {
    const c = choiceRef.current;
    if (!c) return;
    if (c.timer) clearTimeout(c.timer);
    choiceRef.current = null;
    setAnim((a) => ({ ...a, choice: null }));
    c.resolve(c.sel);
  }, []);

  const armChoiceTimer = useCallback(() => {
    const c = choiceRef.current;
    if (!c) return;
    if (c.timer) clearTimeout(c.timer);
    // Settings › Game can turn the auto-confirm off — the picker then stays
    // open until the player taps blue (or the placed cell) to lock it in.
    // (Hard difficulty forces the timer on; the window length is per-difficulty.)
    if (!gameOptions.choiceTimer) return;
    c.timer = setTimeout(confirmChoice, gameOptions.choiceWindowMs);
  }, [confirmChoice]);

  /** A tap while the picker is open: blue (or the placed cell) confirms now;
   *  a grey alternative's cell switches to it and restarts the window; any
   *  other cell is ignored — the window keeps draining. */
  const choiceTap = useCallback((k: string) => {
    const c = choiceRef.current;
    if (!c) return;
    if (k === c.cellKey || c.alts[c.sel].cells.includes(k)) {
      sfx.bankNowClick();
      confirmChoice();
      return;
    }
    const other = c.alts.findIndex((a, i) => i !== c.sel && a.cells.includes(k));
    if (other >= 0) {
      c.sel = other;
      c.tick++;
      sfx.click();
      paintChoice();
      armChoiceTimer();
    }
  }, [confirmChoice, paintChoice, armChoiceTimer]);

  const start = useCallback((opts: NewGameOpts & { countdown?: boolean } = {}) => {
    clearTrace(); // fresh dev play-by-play per run (?debug=1)
    seqGenRef.current++; // abort any in-flight animation sequence (see `pause`)
    if (choiceRef.current?.timer) clearTimeout(choiceRef.current.timer);
    choiceRef.current = null;
    busyRef.current = false;
    shrinkAnimatedRef.current = false;
    singularityAnimatedRef.current = false;
    if (offerTimerRef.current) clearTimeout(offerTimerRef.current);
    setEarlyBankOffer(null);
    setSettling(false);
    // DIFFICULTY: shift the collapse / singularity triggers (easy +2 — the
    // board comes down sooner; hard −1 — you must clear deeper to progress)
    const shift = gameOptions.collapseShift;
    // ACHIEVEMENT BONUS GEMS the player has unlocked seed into this game.
    const stats = loadStats();
    const bonusGems = {
      resurrect: abilityUnlocked("invincible", stats),
      quadriant: abilityUnlocked("crimsonEndurance", stats),
      zenith: abilityUnlocked("superluminal", stats),
    };
    const ns = buildInitial({
      side: 6,
      ...opts,
      collapseAt1: Math.max(4, (opts.collapseAt1 ?? 30) + shift),
      collapseAt2: Math.max(3, (opts.collapseAt2 ?? 15) + shift),
      singularityAt: Math.max(6, (opts.singularityAt ?? 45) + shift),
      // the hand-reveal threshold and the bust rescue are difficulty-driven;
      // the ENGINE owns both (reveal hysteresis + the invisible rescue)
      revealAt: gameOptions.revealAt,
      rescueMode: gameOptions.difficulty === "hard" ? "off" : gameOptions.difficulty,
      bonusGems,
    });
    performedSideRef.current = ns.side; // fresh board: the ledger starts at its full size
    setState(ns);
    sfx.openingTune();

    // OPENING CHOREOGRAPHY: the FULL mineral board rains in first — including
    // the gems that are about to be covered (each special's `buried` value, so
    // what the player sees IS what they'll recover later). Then the Dross /
    // Nebulite drop in from above, one by one, and each buried gem stays
    // visible until the exact moment its special LANDS on top of it.
    const specials = ns.order.filter((k) => {
      const t = ns.cells.get(k)?.tile;
      return t === GLINT || t === CORE;
    });
    const buriedShown = revealBuried(
      ns,
      specials
        .map((k) => ({ key: k, value: ns.cells.get(k)!.buried as number }))
        .filter((b) => b.value != null)
    );
    setAnim({ ...IDLE, playing: true, freezeState: buriedShown, entryDrop: true });
    // the 3-2-1-GO opening — on unless the level opts out (Tutorial / Academy)
    const wantCountdown = opts.countdown !== false;
    void (async () => {
      try {
        // ACHIEVEMENT BONUS GEMS swirl in IMMEDIATELY — dropped big to the board
        // centre and hidden under a tile — on their OWN channel, so they run
        // alongside the board raining in (no waiting for the whole opening) and
        // follow one another quickly. (Never awaited by the rain/specials below.)
        const bonusSeeded = ns.order
          .filter((k) => isBonusGem(ns.cells.get(k)?.bonusGem))
          .map((k) => ns.cells.get(k)!.bonusGem as TileVal);
        void (async () => {
          for (let i = 0; i < bonusSeeded.length; i++) {
            const gem = bonusSeeded[i];
            if (gem === RESURRECT) sfx.resurrectReveal();
            else sfx.quadriantReveal();
            const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
            setAnim((a) => ({ ...a, seedFlying: [{ id: `seed-bonus-${i}`, value: gem, fromKey: null, fromXY: { x: cx, y: -140 }, to: "screen", swirl: true, size: 128, delay: 0, glow: gem === RESURRECT ? "#ff6e8e" : "#ff8496" }] }));
            await pause(1500); // drop + hold big + swirl into the board
            setAnim((a) => ({ ...a, seedFlying: [] }));
            if (i < bonusSeeded.length - 1) await pause(280); // quick gap before the next
          }
        })();

        // the WHOLE rain: the last tile's staggered start plus its 450ms drop
        // (matches the Board's adaptive per-cell delay), then a readable beat.
        // (The board setting up IS the anticipation — no numerals; just the
        // GO! slam once everything has landed.)
        const rainMs = ns.order.length * Math.min(22, 1200 / ns.order.length) + 450;
        await pause(rainMs + 300);
        // one staggered volley: every special is airborne at once, but they LAND
        // one by one — each buried gem disappears at exactly its landing moment.
        let shown = buriedShown;
        setAnim((a) => ({
          ...a,
          entryDrop: false,
          flying: specials.map((k, i) => {
            const at = mapperRef.current?.(k);
            return {
              id: `entry-special-${k}`,
              value: ns.cells.get(k)!.tile as TileVal,
              fromKey: null,
              // spawn fully ABOVE THE VIEWPORT (belt and braces on top of the
              // fade-in) — even a mistimed first frame can never appear as a
              // tile sitting on another row
              fromXY: at ? { x: at.x, y: Math.min(at.y - 360, -60) } : undefined,
              to: "gap" as const,
              toKey: k,
              delay: i * 260,
              fadeIn: true,
            };
          }),
        }));
        let elapsed = 0;
        for (let i = 0; i < specials.length; i++) {
          const landAt = 640 + i * 260;
          await pause(landAt - elapsed);
          elapsed = landAt;
          const k = specials[i];
          shown = withTileAt(shown, k, ns.cells.get(k)!.tile as TileVal); // covered NOW
          sfx.place();
          setAnim((a) => ({ ...a, flying: a.flying.filter((f) => f.toKey !== k), freezeState: shown }));
        }
        if (wantCountdown) {
          // GO! slams in with a bang as the reveal completes (a brief shake
          // sells the impact; the screen-shake setting is honoured at render)
          setAnim((a) => ({ ...a, countdown: "go", shake: true }));
          sfx.goBang();
          await pause(320);
          setAnim((a) => ({ ...a, shake: false }));
          await pause(420);
          setAnim((a) => ({ ...a, countdown: null }));
        }
        await pause(wantCountdown ? 60 : 250);
        setAnim(IDLE);
      } catch (e) {
        if (e !== ABORT) throw e; // a restart mid-entry owns the screen
      }
    })();
  }, []);

  // Commit a fully-resolved state. If the game just ended, hold a brief "settling"
  // beat so the final board (cleared tiles, updated score) is visible BEFORE the
  // end-of-game popup appears.
  //
  // SAFETY NET: if the board is coming down, the COLLAPSE beat plays FIRST — and
  // the GLINT RUSH title when this collapse starts the death match. This hangs off
  // the CONDITION (the committed board is smaller than the shown one), not off any
  // particular resolution path, so no code path can ever snap the board smaller
  // silently. Paths that already staged the collapse mid-flow (bank / bust /
  // activate) mark shrinkAnimatedRef and are not replayed. Callers await this
  // BEFORE clearing the anim to IDLE.
  const commitFinal = useCallback(async (next: GameState) => {
    const prev = stateRef.current;
    // SINGULARITY safety net: if this resolution dropped a shape's wedges and no
    // path staged the beat yet, play it now — BEFORE any collapse beat.
    let shown = boardWithout(animRef.current.freezeState ?? prev, animRef.current.hiddenCells);
    shown = await singularityBeat(shown, next.lastResolved);
    // Compare against the PERFORMED-SIDE LEDGER, never against the photograph:
    // a pre-commit beat that renders the committed (already collapsed) board —
    // the BANK NOW late-isolation frame was one — swaps the scenery early, and
    // any check that measures the screen reads "no contraction" and goes blind.
    // The ledger only moves when the COLLAPSE beat actually plays, so an owed
    // collapse can't hide. (Grid SIDE, never cell counts: a big clear could
    // leave fewer shown cells than the collapsed grid and read as settled.)
    if (!shrinkAnimatedRef.current && next.side < performedSideRef.current) {
      // contract exactly what's on screen: the current freeze frame minus the
      // tiles that already flew off during this action. Reveal the committed board
      // as-is — by commit time every flight (incl. late isolation) has played.
      await animateShrink(shown, [], next, next.deathMatch && !prev.deathMatch);
    } else if (!shrinkAnimatedRef.current && next.deathMatch && !prev.deathMatch) {
      // GLINT RUSH on a board that never collapses (started at side 4, e.g. the
      // Tutorial level): no contraction — just announce the final round, zoomed OUT.
      await settleOut();
      setAnim((a) => ({ ...a, playing: true, freezeState: next }));
      sfx.boardCleared();
      await pause(120);
      sfx.rushRise();
      setAnim((a) => ({ ...a, rushTitle: true }));
      await pause(3000);
      setAnim((a) => ({ ...a, rushTitle: false }));
    }
    shrinkAnimatedRef.current = false;
    singularityAnimatedRef.current = false;
    setState(next);
    // ACHIEVEMENT BONUS GEM reveals: the special sound + a flourish flight to the
    // slot the effect landed in (heart → busts, Quadriant → score, Zenith → score
    // when it banked / already in hand when it was dealt).
    const reveals = (next.lastResolved?.bonusRevealed ?? []).filter((r) => r.key !== "hand" || r.bonus);
    if (reveals.length && next.phase === "playing") {
      const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
      const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
      const flights: FlyingTile[] = [];
      reveals.forEach((rev, i) => {
        if (rev.gem === RESURRECT) { sfx.resurrectReveal(); flights.push({ id: `rev-res-${i}`, value: RESURRECT as TileVal, fromKey: null, fromXY: { x: cx, y: cy }, to: "bust", delay: i * 220, glow: "#ff6e8e" }); }
        else if (rev.gem === QUADRIANT) { sfx.quadriantReveal(); /* its overview line + the score carry the visual — no extra flight */ }
        else { sfx.zenithReveal(); flights.push({ id: `rev-zen-${i}`, value: ZENITH as TileVal, fromKey: null, fromXY: { x: cx, y: cy }, to: "score", delay: i * 220, glow: "#e4ff6b" }); }
      });
      if (flights.length) {
        setAnim((a) => ({ ...a, playing: true, freezeState: next, flying: flights }));
        await pause(1000 + flights.length * 220);
        setAnim(IDLE);
      }
    }
    if (next.phase !== "playing") {
      if (next.phase === "won") sfx.boardCleared();
      else sfx.gameOver();
      setSettling(true);
      setTimeout(() => setSettling(false), 700);
    }
  }, []);

  // ENDGAME AID: the moment the hand drops to 3 tiles (everything now revealed),
  // a log line invites the choice.
  const handLenRef = useRef(Infinity);
  useEffect(() => {
    const len = state.hand.length;
    const prev = handLenRef.current;
    handLenRef.current = len;
    if (state.phase !== "playing" || len > 3 || len < 2 || prev <= 3) return;
    setState((s) =>
      s.phase === "playing" && s.hand.length === len
        ? logOnly(s, logText("handChoice", { count: len }))
        : s
    );
  }, [state.hand.length, state.phase]);

  // the hand reveal (threshold + hysteresis + announcement) lives in the ENGINE
  // now — state.handRevealed below. (No last-bust reveal on any difficulty:
  // revealing the hand is real hidden information, and rewarding trouble
  // invites deliberate busting.)
  const handRevealed = state.handRevealed;

  // ENDGAME AID: with 3 or fewer tiles in hand, the UP NEXT tiles are revealed and
  // the player can swap the visible tile with a revealed one — pure reorder, no
  // rules impact.
  const swapHand = useCallback((i: number) => {
    if (busyRef.current || choiceRef.current) return; // not while a placement is staged
    const s = stateRef.current;
    if (s.phase !== "playing" || s.hand.length > 3 || i <= 0 || i >= s.hand.length) return;
    sfx.click();
    setState((prev) => {
      if (prev.phase !== "playing" || prev.hand.length > 3 || i >= prev.hand.length) return prev;
      const hand = prev.hand.slice();
      [hand[0], hand[i]] = [hand[i], hand[0]];
      return { ...prev, hand };
    });
  }, []);

  // THE RUSH WHEEL: rotate the hand so index i becomes the placing tile. A pure
  // reorder that PRESERVES the cycle order (the wheel must spin, not shuffle).
  // Available whenever the wheel shows: GLINT RUSH, or the last few tiles.
  const rotateHand = useCallback((i: number) => {
    if (busyRef.current || choiceRef.current) return; // not while a placement is staged
    const s = stateRef.current;
    if (s.phase !== "playing") return;
    if (i <= 0 || i >= s.hand.length) return;
    setState((prev) => {
      if (prev.phase !== "playing" || i >= prev.hand.length) return prev;
      return { ...prev, hand: [...prev.hand.slice(i), ...prev.hand.slice(0, i)] };
    });
  }, []);

  // CASH OUT (GLINT RUSH only): the player banks the run by choice, converting
  // unspent lives / free banks into points and ending the game.
  const cashOutNow = useCallback(() => {
    if (busyRef.current || choiceRef.current) return; // not while a placement is staged
    const s = stateRef.current;
    if (s.phase !== "playing" || !s.deathMatch) return;
    sfx.bankScore();
    setState(cashOut(s));
    setSettling(true);
    setTimeout(() => setSettling(false), 700);
  }, []);

  // OPTION 3: open the timed early-bank offer. It stays available for 4 seconds
  // total (the UI shows a "3..2..1" that begins after a 1s grace, so it feels like
  // 3s but is actually longer). Auto-dismisses if not taken. Does NOT appear once
  // the player has used all 3 free banks.
  const openEarlyBankOffer = useCallback((cellKey: string) => {
    if (stateRef.current.freeBanksLeft <= 0) return; // no free banks left — no offer
    if (offerTimerRef.current) clearTimeout(offerTimerRef.current);
    setEarlyBankOffer({ cellKey });
    // Settings › Game picks the countdown length (3s or 5s) — plus the 1s grace
    offerTimerRef.current = setTimeout(() => setEarlyBankOffer(null), gameOptions.bankWindow * 1000 + 1000);
  }, []);

  // OPTION 3: the player took the early bank. Plays the SAME bank animation as a
  // normal bank (cells light up one-by-one, then fly to the score), no multiplier,
  // followed by the resolution of anything the bank isolated/cleared — then commits.
  const bankNow = useCallback(() => {
    if (offerTimerRef.current) clearTimeout(offerTimerRef.current);
    const offer = earlyBankOfferRef.current;
    setEarlyBankOffer(null);
    if (!offer) return;
    const st = stateRef.current;
    if (st.phase !== "playing" || busyRef.current) return;
    if (!st.activatedCells.includes(offer.cellKey)) return;

    sfx.bankNowClick();
    (async () => {
      try {
      busyRef.current = true;
      const order = st.order;
      const cellKey = offer.cellKey;

      // BFS the connected activated cluster from the bank cell (the tiles that bank).
      const activated = new Set(st.activatedCells);
      const clusterOrder: string[] = [];
      const seen = new Set<string>([cellKey]);
      const queue = [cellKey];
      while (queue.length) {
        const k = queue.shift()!;
        if (!activated.has(k)) continue;
        clusterOrder.push(k);
        for (const nb of st.adj.get(k) ?? []) {
          if (activated.has(nb) && !seen.has(nb)) { seen.add(nb); queue.push(nb); }
        }
      }

      // Phase A: brief glow on the cluster.
      setAnim({ ...IDLE, playing: true, focused: true, freezeState: st });
      await pause(T.bankHoldGlow);

      // Phase B: light up the cluster cells one-by-one.
      const lit = new Set<string>();
      for (let i = 0; i < clusterOrder.length; i++) {
        lit.add(clusterOrder[i]);
        sfx.bankTile(i);
        setAnim((a) => ({ ...a, playing: true, freezeState: st, litCells: new Set(lit) }));
        await pause(T.bankLightStep);
      }
      await pause(120);

      // Phase C: THE COMBO LINEUP — the cluster's activated combos form up in
      // named rows under the score, linger, then dive in (same as a placement
      // bank, base value, no multiplier).
      const cleared = new Set<string>(clusterOrder);
      const clusterSet = new Set(clusterOrder);
      const combosIn = st.activatedCombos.filter((c) => c.cells.some((k) => clusterSet.has(k)));
      const rows = lineupRows(
        combosIn.map((c) => ({ name: prettyCombo(c.name), cells: c.cells, run: isRunCombo(c.name) })),
        st
      );
      const nTiles = rows.reduce((n, r) => n + r.tiles.length, 0);
      const chainRaw = chainBonus(combosIn.map((c) => c.name)).name;
      const chain = chainRaw ? chainLabel(chainRaw) : null;
      // a banked special's buried gem shows the moment its cell lifts to the
      // lineup — but ONLY for cluster members: a gem buried under an ISOLATED
      // special stays hidden until that special itself flies off below, or the
      // departing special looks like it slid out from beneath its own gem
      const ebClusterSet = new Set(clusterOrder);
      const ebBuried = bankClusterNow(st, cellKey).lastResolved.buriedToHand.filter((t) => ebClusterSet.has(t.key));
      const ebBuriedKeys = new Set(ebBuried.map((t) => t.key));
      // a joker-Core inside the cluster is COLLECTED — it flies to the wallet
      // rather than leaving silently with the lineup
      const ebCores: FlyingTile[] = clusterOrder
        .filter((k) => st.cells.get(k)?.tile === CORE)
        .map((k, i) => ({ id: `eb-core-${k}`, value: CORE as TileVal, fromKey: k, to: "wallet" as const, delay: nTiles * LINEUP_T.stagger + i * 90 }));
      if (ebCores.length > 0) sfx.clearCore();
      setAnim((a) => ({
        ...a,
        playing: true,
        freezeState: revealBuried(st, ebBuried),
        litCells: new Set(),
        hiddenCells: new Set([...cleared].filter((k) => !ebBuriedKeys.has(k))),
        flying: ebCores,
        bankedPlate: `BANKED ×${clusterOrder.length}`,
        comboLineup: { rows, chain },
      }));
      await pause(LINEUP_T.fly + nTiles * LINEUP_T.stagger + LINEUP_T.linger);
      sfx.bankScore(); // the lineup dives into the score
      await pause(LINEUP_T.dive + nTiles * LINEUP_T.diveStagger + 150);
      setAnim((a) => ({ ...a, comboLineup: null }));

      // Commit on a clone to learn what the bank resolved (isolated/strand/etc).
      const committed = bankClusterNow(st, cellKey);
      const res = committed.lastResolved;

      // Resolve isolated-to-score, strand/pair/buried-to-hand — same as a normal bank.
      const isoFly: FlyingTile[] = res.isolatedToScore.map((t, i) => ({
        id: `eb-iso-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: (t.value === CORE ? "wallet" : "score") as FlyingTile["to"], delay: i * 70,
      }));
      if (isoFly.length > 0) {
        for (const t of res.isolatedToScore) cleared.add(t.key);
        playClearSounds(res.isolatedToScore);
        // reveal buried minerals under departing specials (see the bank path)
        const buriedKeys = new Set(res.buriedToHand.map((t) => t.key));
        setAnim((a) => ({
          ...a,
          playing: true,
          freezeState: revealBuried(st, res.buriedToHand),
          hiddenCells: new Set([...cleared].filter((k) => !buriedKeys.has(k))),
          flying: isoFly,
        }));
        await pause(T.specialFly + isoFly.length * 70 + 100);
      }
      const toHand: FlyingTile[] = [
        ...res.strandToHand.map((t, i) => ({ id: `eb-st-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand" as const, delay: i * 70, fast: true })),
        ...res.pairToHand.map((t, i) => ({ id: `eb-pair-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand" as const, delay: (res.strandToHand.length + i) * 70, fast: true })),
        ...res.buriedToHand.map((t, i) => ({ id: `eb-bur-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand" as const, delay: (res.strandToHand.length + res.pairToHand.length + i) * 70, fast: true })),
      ];
      if (toHand.length > 0) {
        for (const f of toHand) if (f.fromKey) cleared.add(f.fromKey);
        playHandSounds(toHand);
        setAnim((a) => ({ ...a, playing: true, freezeState: st, hiddenCells: new Set(cleared), flying: toHand }));
        await pause(T.toHandFly + toHand.length * 70 + 100);
      }
      if (res.clearBonus > 0) {
        setAnim((a) => ({ ...a, playing: true, freezeState: st, hiddenCells: new Set(cleared), flying: [{ id: "eb-clearbonus", value: 1 as TileVal, fromKey: null, fromCentre: true, to: "score", delay: 0, label: `+${res.clearBonus}` }] }));
        await pause(T.specialFly + 250);
      }
      // ROLL THE SCORE UP NOW, as part of the bank — before the reshuffle / collapse
      // (see the placement-bank path for the rationale).
      setState((s) => (s.score === committed.score && s.banks === committed.banks ? s : { ...s, score: committed.score, banks: committed.banks }));
      await pause(120);

      // SINGULARITY / THE ABYSS COLLAPSES — staged mid-flow, exactly like the
      // placement-bank and bust paths. This path used to lean on the commit-time
      // safety net instead, but the late-isolation beat below renders the
      // committed (already collapsed) board — which both snapped the visual AND
      // blinded a net that measured the screen (the silent 91→61 snap).
      const cwEB = withLateTiles(committed);
      const preShrinkEB = await singularityBeat(boardWithout(st, cleared), res);
      if (res.shrunk) {
        await animateShrink(preShrinkEB, res.shrunk.mapping, cwEB, res.shrunk.final);
      }
      // RESHUFFLE from a Glint clear / nudge during the early bank — always animated,
      // the word before the tiles move.
      if (!res.shrunk && (res.reshuffled || res.nudged.length > 0)) {
        await animateReshuffle(cwEB);
      }

      // tiles isolated by a collapse / glint-clear reshuffle during the early bank
      await animateLateResolution(committed);

      await commitFinal(committed); // plays COLLAPSE / GLINT RUSH first if the board came down
      setAnim(IDLE);
      busyRef.current = false;
      } catch (e) {
        // a restart mid-animation aborted this sequence — the new game owns the screen
        if (e !== ABORT) throw e;
      }
    })();
  }, [commitFinal]);

  // NOTE (formerly RULE 5): a last tile with no legal move used to auto-end the
  // game with a forced BUST. Removed — with CASH OUT in play, ending the run is
  // ALWAYS the player's decision: they can cash out (in GLINT RUSH) or place the
  // tile anywhere and take the bust, which ends the game naturally when the hand
  // empties or the lives run out.

  // THE ABYSS COLLAPSES — a dramatic, phased shrink. `frozen` is the pre-shrink
  // board (all tiles stay ON it while it contracts — nothing blips out); at the end
  // `revealState` (the new, smaller board) is shown at full size, so the tiles
  // reappear remapped on the collapsed grid. `isFinal` adds the GLINT RUSH title.
  // SINGULARITY — a shaped board's wedges (and everything on them) drop into the
  // abyss: the word slams in while the doomed rim trembles, then the cells fall
  // off the bottom of the screen with a swarm of particles sucked down after them.
  const animateSingularity = async (frozen: GameState, fallKeys: Set<string>) => {
    await waitForBoardRelease(); // never start resizing the board under a held finger
    singularityAnimatedRef.current = true;
    sfx.collapse(); // the doom hit under the banner
    setAnim((a) => ({
      ...a,
      playing: true,
      freezeState: frozen,
      hiddenCells: new Set(),
      flying: [],
      redCells: new Set(),
      litCells: new Set(),
      activateReveal: null,
      banner: null,
      shake: true,
      singularity: { phase: 0, cells: fallKeys },
    }));
    await pause(1050);
    sfx.abyssFall(); // the descending whoosh as the rim lets go
    setAnim((a) => ({ ...a, shake: false, singularity: { phase: 1, cells: fallKeys } }));
    await pause(1450);
    setAnim((a) => ({ ...a, singularity: null, freezeState: dropCells(frozen, fallKeys) }));
    await pause(200);
  };

  /** ZOOM-OUT GATE — a transitional animation (RESHUFFLE / BUST / COLLAPSE /
   *  SINGULARITY / GLINT RUSH / MOTHER LODE) may only start once the board's focus
   *  zoom has settled back OUT and the interaction highlights are cleared. If we're
   *  still zoomed in from the placement/bank, drop the highlights, zoom out and wait
   *  for the transition to finish; if we're already out, this is a no-op (so a chain
   *  of transitionals doesn't wait repeatedly). Every transitional awaits this first,
   *  so they always run on a resolved, zoomed-OUT board. */
  const settleOut = async () => {
    if (!animRef.current.focused) return;
    setAnim((a) => ({ ...a, focused: false, litCells: new Set(), redCells: new Set(), activateReveal: null, dropCell: null }));
    await pause(T.zoomOut);
  };

  /** Play the SINGULARITY beat if this resolution recorded one; returns the frozen
   *  board the NEXT beat should start from (the shown board minus the fallen rim). */
  const singularityBeat = async (frozen: GameState, res: GameState["lastResolved"]): Promise<GameState> => {
    if (!res.singularity || singularityAnimatedRef.current) return frozen;
    await settleOut();
    const fallKeys = new Set(res.singularity.cells.map((c) => c.key));
    await animateSingularity(frozen, fallKeys);
    return dropCells(frozen, fallKeys);
  };

  const animateShrink = async (
    frozen: GameState,
    _mapping: { from: string; to: string }[],
    revealState: GameState,
    isFinal = false,
    keepHidden: Set<string> = new Set() // cells held back on the REVEALED board (e.g. a bust's forced tile, dropped as its own beat afterwards)
  ) => {
    await waitForBoardRelease(); // never start resizing the board under a held finger
    await settleOut(); // collapse runs on a zoomed-OUT board
    shrinkAnimatedRef.current = true; // the commit-time safety net must not replay it
    performedSideRef.current = revealState.side; // the ledger: this side is now paid for
    if (typeof window !== "undefined") {
      (window as unknown as { __glintCollapseBeats?: number }).__glintCollapseBeats =
        ((window as unknown as { __glintCollapseBeats?: number }).__glintCollapseBeats ?? 0) + 1;
    }
    const shr = (phase: number, scale: number) => ({ phase, scale, vanishing: new Set<string>(), final: isFinal, fromCells: frozen.order.length, toCells: revealState.order.length });
    // Phase 0: hold the full board, slam the big word in. Clear ALL residual overlays
    // first (banked/activated rings, flying tiles, banner) so the collapse starts on a
    // fully-resolved board — no leftover green/gold combo borders from the last action.
    sfx.collapse();
    setAnim((a) => ({ ...a, playing: true, freezeState: frozen, hiddenCells: new Set(), flying: [], redCells: new Set(), litCells: new Set(), activateReveal: null, banner: null, shake: true, shrinking: shr(0, 1) }));
    await pause(650);

    // Phases 1–4: the WHOLE board contracts in beats — every tile stays on it (no
    // instant removals), and the word shrinks with it.
    setAnim((a) => ({ ...a, shake: false, shrinking: shr(1, 1) }));
    await pause(320);
    setAnim((a) => ({ ...a, shrinking: shr(2, 0.82) }));
    await pause(430);
    setAnim((a) => ({ ...a, shrinking: shr(3, 0.6), shake: true }));
    await pause(430);
    setAnim((a) => ({ ...a, shrinking: shr(4, 0.42), shake: false }));
    await pause(360);

    // Reveal the new, smaller board at full size — the tiles reappear, remapped.
    // `keepHidden` cells stay held back: they get their own entrance beat after.
    setAnim((a) => ({ ...a, freezeState: revealState, shrinking: null, hiddenCells: new Set(keepHidden), redCells: new Set(), shake: false }));
    await pause(isFinal ? 260 : 420);

    // GLINT RUSH — announce the final round: the title sweeps in from the side with
    // its own whoosh + stinger (see RushOverlay / gl-rush-slide).
    if (isFinal) {
      sfx.boardCleared(); // a bright fanfare as the smaller board settles
      await pause(120);
      sfx.rushRise(); // the whoosh that carries the title in from the side
      setAnim((a) => ({ ...a, freezeState: revealState, rushTitle: true }));
      await pause(3000);
      setAnim((a) => ({ ...a, rushTitle: false }));
    }
  };

  // MOTHER LODE — a big same-value overflow is refined into a Nebulite. The refined
  // tiles gather to screen centre, morph (source gem ×N → Nebulite) under a MOTHER
  // LODE banner, then the Nebulite flies down into the hand. `cleared` accumulates the
  // hidden cells so the refined tiles disappear from the board as they gather.
  const animateMotherLode = async (
    ml: { bonus: number; sourceValue: number; refinedCells: string[]; nebulites: number },
    cleared: Set<string>
  ) => {
    await settleOut(); // the Mother Lode gather/fuse runs on a zoomed-OUT board
    sfx.motherLode();
    // Phase 1 (gather): the refined tiles fly from the board to the viewport centre.
    const gather: FlyingTile[] = ml.refinedCells.map((k, i) => ({
      id: `lode-${k}`, value: ml.sourceValue as TileVal, fromKey: k, to: "screen", delay: i * 45,
    }));
    for (const k of ml.refinedCells) cleared.add(k);
    setAnim((a) => ({ ...a, hiddenCells: new Set(cleared), redCells: new Set(), flying: gather }));
    await pause(760 + ml.refinedCells.length * 45);
    // Phase 2 (fuse): show the "source gem ×N" composition, then morph to Nebulite(s).
    setAnim((a) => ({ ...a, flying: [], motherLode: { phase: "gather", sourceValue: ml.sourceValue, count: ml.refinedCells.length, nebulites: ml.nebulites, bonus: ml.bonus } }));
    await pause(720);
    setAnim((a) => ({ ...a, motherLode: a.motherLode ? { ...a.motherLode, phase: "fuse" } : null }));
    await pause(1050);
    // Phase 3 (to hand): the Nebulite(s) fly from centre down into the hand.
    const toHand: FlyingTile[] = Array.from({ length: ml.nebulites }, (_, i) => ({
      id: `lode-neb-${i}`, value: CORE as TileVal, fromKey: null, fromScreen: true, to: "hand", delay: i * 130, fast: true,
    }));
    setAnim((a) => ({ ...a, motherLode: null, flying: toHand }));
    await pause(T.toHandFly + ml.nebulites * 130 + 150);
    setAnim((a) => ({ ...a, flying: [] }));
  };

  // RESHUFFLE — always animated. We first show the "RESHUFFLE" banner + shake on a
  // board that still has the nudged tiles in their OLD positions, so the word
  // appears BEFORE anything moves; then after ~1s we reveal the committed board,
  // so the tile drift reads as happening during/after the shuffle (not before it).
  // `keepHidden` cells stay hidden throughout the reshuffle — e.g. a bust's
  // auto-placed inert tile, which shouldn't flash in during the shuffle and then
  // get re-dropped afterwards (it only appears once, when Phase B drops it in).
  const animateReshuffle = async (committed: GameState, keepHidden: Set<string> = new Set()) => {
    const nudged = committed.lastResolved.nudged ?? [];
    // build a pre-nudge view: move each drifted tile back from its destination to
    // its origin, so the board shown during the banner matches the moment before
    // the shuffle resolved.
    const preCells = new Map(committed.cells);
    for (const { from, to } of nudged) {
      const dst = preCells.get(to);
      const src = preCells.get(from);
      if (!dst || !src) continue;
      preCells.set(from, { coord: src.coord, tile: dst.tile, inert: dst.inert, buried: dst.buried });
      preCells.set(to, { coord: dst.coord, tile: null, inert: false, buried: null });
    }
    const preNudge: GameState = { ...committed, cells: preCells };

    await settleOut(); // reshuffle runs on a zoomed-OUT board
    // word appears, tiles still in old spots
    sfx.reshuffle();
    setAnim((a) => ({ ...a, playing: true, hiddenCells: new Set(keepHidden), flying: [], freezeState: preNudge, banner: "RESHUFFLE", shake: true }));
    await pause(1000);
    // now reveal the moved tiles (board contracts to committed); keep the word a beat longer
    setAnim((a) => ({ ...a, freezeState: committed, shake: true }));
    await pause(450);
    setAnim((a) => ({ ...a, banner: null, shake: false }));
  };

  // LATE ISOLATION — tiles left alone (or as a same-value pair) by a COLLAPSE or a
  // RESHUFFLE. The engine already banked/handed them (they're gone in `committed`);
  // we rebuild a view that still shows them, hold a beat, then fly the banked ones
  // UP to the score and the paired/buried ones DOWN to the hand — same as the
  // immediate isolation animation, just after the board has settled.
  const animateLateResolution = async (committed: GameState, keepHidden: Set<string> = new Set()) => {
    const { banked, toHand, buried } = committed.lastResolved.lateIsolated;
    if (banked.length === 0 && toHand.length === 0 && buried.length === 0) return;

    const readdInto = (cells: Map<string, GameState["cells"] extends Map<string, infer C> ? C : never>, key: string, value: number) => {
      const c = committed.cells.get(key);
      if (c) cells.set(key, { coord: c.coord, tile: value as TileVal, inert: false, buried: null });
    };
    // the settle frame shows the ISOLATED tiles themselves (a special sits ON
    // TOP of its buried gem, so at shared keys the special wins)…
    const preCells = new Map(committed.cells);
    for (const t of buried) readdInto(preCells, t.key, t.value);
    for (const t of banked) readdInto(preCells, t.key, t.value);
    for (const t of toHand) readdInto(preCells, t.key, t.value);
    const preState: GameState = { ...committed, cells: preCells };
    // …and the moment the specials LIFT OFF, their cells show the buried gems
    // that were always underneath (never dark, never added later)
    const revealCells = new Map(preCells);
    for (const t of buried) readdInto(revealCells, t.key, t.value);
    const revealState: GameState = { ...committed, cells: revealCells };
    const buriedKeys = new Set(buried.map((t) => t.key));

    // settle them onto the board for a beat so it's clear they were left isolated.
    // Keep the current zoom (this cleanup runs AFTER a collapse/reshuffle, which has
    // already zoomed the board out) — don't re-zoom-in between transitional beats.
    setAnim((a) => ({ ...a, playing: true, freezeState: preState, hiddenCells: new Set(keepHidden), flying: [], banner: null, shake: false }));
    await pause(300);

    const hide = new Set<string>(keepHidden);
    if (banked.length > 0) {
      const fly: FlyingTile[] = banked.map((t, i) => ({ id: `late-iso-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: (t.value === CORE ? "wallet" : "score") as FlyingTile["to"], delay: i * 70 }));
      // a departing special's cell is NOT hidden — it keeps showing the buried
      // gem (swapped in via revealState) until that gem itself flies off
      banked.forEach((t) => { if (!buriedKeys.has(t.key)) hide.add(t.key); });
      sfx.bankScore();
      playClearSounds(banked);
      setAnim((a) => ({ ...a, freezeState: revealState, hiddenCells: new Set(hide), flying: fly }));
      await pause(T.specialFly + banked.length * 70 + 120);
    }
    const handTiles = [...toHand, ...buried];
    if (handTiles.length > 0) {
      const fly: FlyingTile[] = handTiles.map((t, i) => ({ id: `late-hand-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand", delay: i * 70, fast: true }));
      handTiles.forEach((t) => hide.add(t.key));
      playHandSounds(handTiles);
      setAnim((a) => ({ ...a, freezeState: revealState, hiddenCells: new Set(hide), flying: fly }));
      await pause(T.toHandFly + handTiles.length * 70 + 120);
    }
  };

  const onPlace = useCallback(
    async (cellKey: string, tap?: { x: number; y: number }) => {
      try {
      // a tap while the combo picker is open drives the picker, nothing else
      if (choiceRef.current) { choiceTap(cellKey); return; }
      if (busyRef.current) return;
      if (state.phase !== "playing") return;
      const tile = visibleTile(state);
      if (tile === null) return;

      // Placing a tile ends any pending early-bank offer (the moment to bank has passed).
      if (offerTimerRef.current) clearTimeout(offerTimerRef.current);
      setEarlyBankOffer(null);

      // A highlighted (pre-banked) combo is off limits — you cannot replace a tile
      // that is part of your activated group. The tile stays unplaced.
      if (state.activatedCells.includes(cellKey)) {
        setState((st) => logOnly(st, logText("cannotReplace")));
        return;
      }

      let outcome = describePlace(state, cellKey);

      // THICK-THUMBS RESCUE: a tap that would bust, but an adjacent cell nearest the
      // finger is a legal non-bust move (a slip past a matching neighbour), snaps the
      // placement there instead — a quick "magnetic" slide, then it plays normally. If
      // no neighbour qualifies (or it's a Dross, which always busts), the bust stands.
      // TOUCH ONLY: a mouse on desktop is precise, so the rescue is disabled there.
      if (outcome.kind === "bust" && isCoarsePointer()) {
        const rescue = findRescueCell(state, cellKey, tap, mapperRef.current);
        if (rescue) {
          busyRef.current = true;
          setAnim({
            ...IDLE,
            playing: true,
            focused: true,
            freezeState: state,
            flying: [{ id: "snap", value: tile, fromKey: cellKey, fromXY: tap, to: "gap", toKey: rescue, delay: 0, magnetic: true }],
          });
          await pause(T.snap);
          cellKey = rescue;
          outcome = describePlace(state, cellKey);
        }
      }

      // The placement's FULL resolution for a chosen alternative. `choiceIdx`
      // selects among the placement's possible resolutions (0 = the engine's
      // classic best pick); it flows into every describe/commit below.
      const resolveMove = async (choiceIdx: number, pre?: typeof outcome) => {
      const outcome = pre ?? describePlace(state, cellKey, choiceIdx);

      // ACTIVATE (non-banking): zoom in on the action, animate the covered tile to
      // where it goes (HAND for a mineral/Glint, SCORE for a Core +500), then light
      // up the newly-activated combo one tile at a time from the placed tile outward.
      // When the whole combo is lit the action is done, so we zoom back out.
      if (outcome.kind === "activate") {
        const covered = outcome.coveredVal;
        busyRef.current = true;
        const placedFrozen = withTileAt(state, cellKey, tile);
        const prevActivated = new Set(state.activatedCells); // already-glowing cells

        // focus in on the placement (the placed gem drops in with a bounce)
        setAnim({ ...IDLE, playing: true, focused: true, dropCell: cellKey, freezeState: placedFrozen, hiddenCells: covered !== null ? new Set([cellKey]) : new Set() });

        const next = place(state, cellKey, choiceIdx);
        recordMoveTrace(state, next, cellKey, choiceIdx); // dev play-by-play (?debug=1)

        if (covered !== null) {
          const flying: FlyingTile[] = [];
          if (covered === CORE) {
            flying.push({ id: "core", value: CORE, fromKey: cellKey, to: "wallet", delay: 0 });
            sfx.clearCore(); // covered the Nebulite for +500
          } else {
            // covered mineral OR Glint -> flies to the hand (quick)
            flying.push({ id: "tohand", value: covered as TileVal, fromKey: cellKey, to: "hand", delay: 0, fast: true });
            covered === GLINT ? sfx.gainDross() : sfx.tileToHand();
          }
          // a mineral BURIED beneath the covered Glint/Core follows it out — from
          // under the placed gem — and flies to the hand. (It used to arrive in
          // the hand silently, with nothing on screen to explain it.)
          const coverBuried = next.lastResolved.buriedToHand.filter((t) => t.key === cellKey);
          coverBuried.forEach((t, i) => {
            flying.push({ id: `cover-buried-${i}`, value: t.value as TileVal, fromKey: cellKey, to: "hand", delay: 180 + i * 70, fast: true });
            setTimeout(() => sfx.tileToHand(), 200 + i * 70);
          });
          setAnim((a) => ({ ...a, focused: true, playing: true, freezeState: placedFrozen, hiddenCells: new Set([cellKey]), flying }));
          const mainFly = covered === CORE ? T.specialFly : T.toHandFly;
          const buriedFly = coverBuried.length > 0 ? 180 + (coverBuried.length - 1) * 70 + T.toHandFly : 0;
          await pause(Math.max(mainFly, buriedFly) + 100);
        }

        // Sequential activation reveal: BFS the activated combo from the placed cell
        // outward, then light each cell in turn (cells that were already glowing stay
        // lit from the start; only the fresh ones ripple on).
        if (next.phase === "playing" && next.activatedCells.length > 0) {
          const activatedNow = new Set(next.activatedCells);
          const order: string[] = [];
          const seen = new Set<string>([cellKey]);
          const queue: string[] = [cellKey];
          while (queue.length) {
            const kk = queue.shift()!;
            if (!activatedNow.has(kk)) continue;
            order.push(kk);
            for (const nb of next.adj.get(kk) ?? []) {
              if (activatedNow.has(nb) && !seen.has(nb)) { seen.add(nb); queue.push(nb); }
            }
          }
          for (const kk of next.activatedCells) if (!order.includes(kk)) order.push(kk); // safety

          const reveal = new Set<string>(prevActivated);
          setAnim((a) => ({ ...a, focused: true, playing: true, freezeState: next, flying: [], hiddenCells: new Set(), activateReveal: new Set(reveal) }));
          await pause(120);
          let lit = 0;
          for (const kk of order) {
            if (reveal.has(kk)) continue; // already lit (was activated before this move)
            reveal.add(kk);
            sfx.activateTile(lit++); // per-tile glow, rising pitch
            setAnim((a) => ({ ...a, activateReveal: new Set(reveal) }));
            await pause(T.activateStep);
          }
          await pause(T.activateHold); // hold the completed combo a beat before zooming out
        }

        // An activation can still clear a Glint (covering it / isolating it), which
        // reshuffles + nudges, and can drop the board to the shrink trigger. Both
        // must ALWAYS play their animation, even though this wasn't a bank or bust.
        const nextCw = withLateTiles(next);
        // SINGULARITY resolves first — the wedge rim falls before any collapse
        const preShrinkA = await singularityBeat(boardWithout(placedFrozen, new Set()), next.lastResolved);
        if (next.lastResolved.shrunk) {
          // contract a board with the activation glow cleared, so no green combo borders
          // linger while the board collapses (it reappears on the settled board).
          await animateShrink(preShrinkA, next.lastResolved.shrunk.mapping, nextCw, next.lastResolved.shrunk.final);
        } else if (next.lastResolved.reshuffled || next.lastResolved.nudged.length > 0) {
          await animateReshuffle(nextCw);
        }
        await animateLateResolution(next); // tiles isolated by the collapse / reshuffle
        await commitFinal(next); // plays COLLAPSE / GLINT RUSH first if the board came down
        setAnim(IDLE); // action + animation done -> zoom back out
        busyRef.current = false;
        // OPTION 3: offer an early bank of the cluster just made.
        if (next.phase === "playing" && next.activatedCells.includes(cellKey)) {
          openEarlyBankOffer(cellKey);
        }
        return;
      }

      // BANK
      if (outcome.kind === "bank") {
        busyRef.current = true;
        // Show the board WITH the placed tile already in its cell, so the combo
        // looks complete during the animation — and WITH the outcome's combos
        // in activatedCombos, so a joker Core in the bank mirrors its mineral
        // from the very first glow frame (it used to sit unmirrored through
        // the light-up and lineup, looking like the mirror "never happened").
        const placedFrozen: GameState = {
          ...withTileAt(state, cellKey, tile),
          activatedCombos: [
            ...state.activatedCombos,
            ...outcome.bankCombos.map((c) => ({ name: c.name as ComboName, cells: c.cells })),
          ],
        };
        const order = outcome.bankOrder;

        // Compute the committed result up front so the light-up can also show the
        // OVERFLOW tiles (they leave this bank but get a red outline, since they don't
        // count for the combo) as a continuous count right after the green cluster.
        const committed = place(state, cellKey, choiceIdx);
        recordMoveTrace(state, committed, cellKey, choiceIdx); // dev play-by-play (?debug=1)
        const res = committed.lastResolved;
        const overflowKeys = [
          ...res.strandToHand.map((t) => t.key),
          ...(res.motherLode?.refinedCells ?? []),
        ];

        // If a mineral was covered, it is the multiplier — lift it out and park
        // it next to the score box for the whole animation.
        const hasMult = outcome.multiplier > 1 && outcome.coveredVal !== null
          && outcome.coveredVal !== GLINT && outcome.coveredVal !== CORE;
        const parked: FlyingTile[] = [];
        if (hasMult) {
          parked.push({
            id: "multiplier",
            value: outcome.coveredVal as TileVal,
            fromKey: cellKey,
            to: "multiplier", // parks beside the score, persists
            delay: 0,
          });
        }

        // Phase A: show placed tile (drops in) + glow; lift the multiplier to its parked spot.
        setAnim({
          ...IDLE,
          playing: true,
          focused: true,
          dropCell: cellKey,
          flying: parked,
          freezeState: placedFrozen,
          multiplierLabel: hasMult ? `×${outcome.multiplier}` : null,
        });
        await pause(T.bankHoldGlow);

        // Phase B: light up cells one-by-one from the placed tile outward.
        const lit = new Set<string>();
        for (let i = 0; i < order.length; i++) {
          lit.add(order[i]);
          sfx.bankTile(i);
          setAnim((a) => ({ ...a, litCells: new Set(lit) }));
          await pause(T.bankLightStep);
        }
        // Continue the count straight into the OVERFLOW tiles — same beat, but a RED
        // outline to show they don't count toward the combo. They stay red through the
        // score fly, then peel off to the hand / Mother Lode fusion afterwards.
        const overflowRed = new Set<string>();
        for (const k of overflowKeys) {
          overflowRed.add(k);
          sfx.bankTile(order.length); // one more tick in the sequence
          setAnim((a) => ({ ...a, litCells: new Set(lit), redCells: new Set(overflowRed) }));
          await pause(T.bankLightStep);
        }
        await pause(120);

        // Phase C: THE COMBO LINEUP — the banked tiles fly up and form their
        // combos in rows just under the score (a ghost copy stands in where one
        // tile completed two combos), each row named; they linger a beat so the
        // player reads WHAT they banked, then dive into the score together.
        // Keep the parked multiplier tile present alongside.
        const rows = lineupRows(outcome.bankCombos, placedFrozen);
        const nTiles = rows.reduce((n, r) => n + r.tiles.length, 0);
        // a QUADRIANT revealed by this bank gets its own overview line (gem · ×4 ·
        // the covered tile · its face value)
        const quadRev = committed.lastResolved.bonusRevealed.find((b) => b.gem === QUADRIANT && b.effect === "quad" && (b.bonus ?? 0) > 0);
        const quadLine = quadRev ? { value: Math.round((quadRev.coveredValue ?? 0) / 100), face: quadRev.coveredValue ?? 0, bonus: quadRev.bonus ?? 0 } : null;
        // every collected Nebulite flies to the WALLET: the covered one AND any
        // joker-Core inside the banked cluster (those otherwise leave with the
        // lineup and would read as plain score)
        const clusterCores = order.filter((k) => placedFrozen.cells.get(k)?.tile === CORE);
        const coreFly: FlyingTile[] = [
          ...(outcome.coveredCore
            ? [{ id: "bank-core", value: CORE as TileVal, fromKey: outcome.placedKey, to: "wallet" as const, delay: nTiles * LINEUP_T.stagger }]
            : []),
          ...clusterCores.map((k, i) => ({
            id: `bank-core-${k}`, value: CORE as TileVal, fromKey: k, to: "wallet" as const,
            delay: nTiles * LINEUP_T.stagger + (outcome.coveredCore ? 90 : 0) + i * 90,
          })),
        ];
        // `cleared` accumulates every cell that has left the board during this bank.
        // Once a cell is in here it stays HIDDEN for the rest of the animation, so a
        // later phase can never un-hide (and briefly flash) an already-removed tile.
        const cleared = new Set<string>(order);
        // ONLY the cluster's specials lift off to the lineup — their cells must
        // show the buried gems underneath from that very frame. A gem buried
        // under an ISOLATED special stays hidden until that special itself flies
        // off (phase F) — revealing it early made the departing Dross look like
        // it slid out from beneath its own buried gem.
        const orderSet = new Set(order);
        const lineupBuried = res.buriedToHand.filter((t) => orderSet.has(t.key));
        const bankBuriedKeys = new Set(lineupBuried.map((t) => t.key));
        const hiddenNow = () => new Set([...cleared].filter((k) => !bankBuriedKeys.has(k)));
        setAnim((a) => ({
          ...a,
          hiddenCells: hiddenNow(),
          redCells: new Set(overflowRed),
          flying: [...parked, ...coreFly],
          bankedPlate: hasMult ? `BANKED ×${outcome.multiplier}` : `BANKED ×${order.length}`,
          comboLineup: { rows, chain: outcome.chainName, quadriant: quadLine },
          // from the lineup onward the hand already shows the NEXT tile — the
          // player reads their next move while the ceremony resolves, instead
          // of waiting for it (strand/Mother Lode arrivals land on top later).
          freezeState: revealBuried({ ...placedFrozen, hand: committed.hand }, lineupBuried),
        }));
        if (outcome.coveredCore || clusterCores.length > 0) sfx.clearCore();
        // form up + read it…
        await pause(LINEUP_T.fly + nTiles * LINEUP_T.stagger + LINEUP_T.linger);
        sfx.bankScore(); // …then the lineup dives into the score
        await pause(LINEUP_T.dive + nTiles * LINEUP_T.diveStagger + 150);
        setAnim((a) => ({ ...a, comboLineup: null }));

        // Phase D: multiplier tile flies into the score too.
        if (hasMult) {
          setAnim((a) => ({
            ...a,
            hiddenCells: hiddenNow(),
            redCells: new Set(overflowRed),
            flying: [{ id: "multiplier", value: outcome.coveredVal as TileVal, fromKey: null, fromXY: parkedXY(), to: "score", delay: 0 }],
            multiplierLabel: null,
    banner: null,
    shake: false,
          }));
          await pause(T.specialFly + 100);
        }

        // Phase E: Rule 1 — leftover 7+ strand tiles (already red-outlined during the
        // light-up) fly DOWN to the hand. Phase F: Rule 2 — every isolated tile
        // (mineral, Core, or Glint) flies UP to the score.
        const strandFly: FlyingTile[] = res.strandToHand.map((t, i) => ({
          id: `strand-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand", delay: i * 70, fast: true,
        }));
        const isoFly: FlyingTile[] = res.isolatedToScore.map((t, i) => ({
          id: `iso-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: (t.value === CORE ? "wallet" : "score") as FlyingTile["to"], delay: i * 70,
        }));

        if (strandFly.length > 0) {
          // the strand tiles are already red (shown during the light-up); peel them off
          // to the hand now. Keep any refined tiles red until the Mother Lode fusion.
          for (const t of res.strandToHand) cleared.add(t.key);
          playHandSounds(res.strandToHand);
          const stillRed = new Set(res.motherLode?.refinedCells ?? []);
          setAnim((a) => ({ ...a, hiddenCells: hiddenNow(), redCells: stillRed, flying: strandFly }));
          await pause(T.toHandFly + strandFly.length * 70 + 100);
        }

        if (isoFly.length > 0) {
          for (const t of res.isolatedToScore) cleared.add(t.key);
          playClearSounds(res.isolatedToScore);
          // a departing special lifts off its buried mineral: that cell keeps
          // SHOWING the gem underneath (instead of going dark) until the gem
          // itself flies to the hand in the next phase
          const buriedKeys = new Set(res.buriedToHand.map((t) => t.key));
          setAnim((a) => ({
            ...a,
            freezeState: revealBuried(placedFrozen, res.buriedToHand),
            hiddenCells: new Set([...cleared].filter((k) => !buriedKeys.has(k))),
            flying: isoFly,
          }));
          await pause(T.specialFly + isoFly.length * 70 + 100);
        }

        // Rule 6 + buried: the isolated-pair's second tile and any recovered
        // buried minerals fly DOWN to the hand.
        const toHandFly: FlyingTile[] = [
          ...res.pairToHand.map((t, i) => ({
            id: `pair-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand" as const, delay: i * 70, fast: true,
          })),
          ...res.buriedToHand.map((t, i) => ({
            id: `buried-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand" as const, delay: (res.pairToHand.length + i) * 70, fast: true,
          })),
        ];
        if (toHandFly.length > 0) {
          for (const f of toHandFly) if (f.fromKey) cleared.add(f.fromKey);
          playHandSounds([...res.pairToHand, ...res.buriedToHand]);
          setAnim((a) => ({ ...a, hiddenCells: new Set(cleared), flying: toHandFly }));
          await pause(T.toHandFly + toHandFly.length * 70 + 100);
        }

        // MOTHER LODE: a big same-value overflow was refined into a Nebulite — gather
        // the tiles to centre, fuse, and drop the Nebulite into the hand.
        if (res.motherLode && res.motherLode.nebulites > 0) {
          await animateMotherLode(res.motherLode, cleared);
        }

        // ROLL THE SCORE UP NOW — the banked combo + isolated tiles have flown into
        // the score, so climb the number here, as part of the bank, BEFORE any
        // collapse / reshuffle. (The board is drawn from the freeze state during the
        // animation, so updating just score/banks doesn't disturb it; commitFinal
        // later sets the same score, so the number doesn't re-roll.)
        // The header carries the DURING-PLAY score into the pop-up: on an ENDING bank we
        // roll to scoreBase (the board-collected total) so the end-of-run bonuses/penalties
        // are applied live IN the summary, not baked in before it appears. A normal bank
        // rolls to its banked total as before.
        const rollTo = committed.phase === "playing" ? committed.score : committed.scoreBase;
        setState((s) => (s.score === rollTo && s.banks === committed.banks ? s : { ...s, score: rollTo, banks: committed.banks }));
        await pause(120);

        // Keep tiles the final isolation pass will clear on the board through the
        // collapse/reshuffle; they fly off afterwards in animateLateResolution.
        const cwb = withLateTiles(committed);

        // THE ABYSS COLLAPSES: if this bank dropped the board to a shrink trigger,
        // play the dramatic phased shrink and reveal the new, smaller board. Contract a
        // CLEAN board (banked tiles gone, glow cleared) so nothing reappears mid-collapse.
        // The SINGULARITY (if this bank triggered it) plays first — rim falls, then collapse.
        const preShrinkB = await singularityBeat(boardWithout(placedFrozen, cleared), res);
        if (res.shrunk) {
          await animateShrink(preShrinkB, res.shrunk.mapping, cwb, res.shrunk.final);
        }

        // Rule 4: the board-clear bonus is NO LONGER flown to the header here — it (and
        // the busts/banks/hand conversion + tiles penalty) is applied live in the end-of-
        // run pop-up's score tally, so the header holds the board-collected score until then.

        // Rule 2: a respawned Core pops in at its new cell. Switch the frozen board
        // to the COMMITTED state (which already reflects every clear), and reveal
        // everything except the cells still mid-flight — the respawn cell shows.
        if (res.coreRespawnedAt) {
          setAnim((a) => ({ ...a, hiddenCells: new Set(), flying: [], freezeState: cwb }));
          await pause(300);
        }

        // Rule 5: a Glint clear (or any reshuffle/nudge) — always animated, with the
        // RESHUFFLE word shown before the tiles move. Skipped on a collapse (the
        // collapse already revealed the settled board).
        if (!res.shrunk && (res.reshuffled || res.nudged.length > 0)) {
          await animateReshuffle(cwb);
        }

        // tiles isolated by the collapse / reshuffle bank / return to the hand now
        await animateLateResolution(committed);

        // RULE 3 penalties: any leftover pre-banked combos that never banked get a
        // RED outline, then each flies a RED negative number to the score. Shown on
        // the last-tile bank, before the end-of-game popup.
        if (outcome.penalties.length > 0) {
          const penaltyCells = outcome.penalties.flatMap((p) => p.cells);
          // hold the cleared board (freeze pre-penalty) and outline the penalty combos red
          setAnim((a) => ({
            ...a,
            freezeState: committed,
            hiddenCells: new Set(),
            redCells: new Set(penaltyCells),
            flying: [],
          }));
          await pause(600);
          // each penalty combo: fly a red "-value" from its first cell to the score
          for (const pen of outcome.penalties) {
            const fromKey = pen.cells[0];
            setAnim((a) => ({
              ...a,
              freezeState: committed,
              redCells: new Set(pen.cells),
              hiddenCells: new Set(pen.cells),
              flying: [{ id: `pen-${fromKey}`, value: 1 as TileVal, fromKey, to: "score", delay: 0, label: `−${pen.value}`, negative: true }],
            }));
            await pause(T.specialFly + 200);
          }
          setAnim((a) => ({ ...a, redCells: new Set(), flying: [] }));
        }

        // Commit & clear animation. Only now is the next tile revealed.
        await commitFinal(committed); // plays COLLAPSE / GLINT RUSH first if the board came down
        setAnim(IDLE);
        busyRef.current = false;
        return;
      }

      // BUST
      if (outcome.kind === "bust") {
        busyRef.current = true;
        const frozen = state;

        const placedFrozen = withTileAt(frozen, cellKey, tile);

        // BUST moment — the placed tile drops in, then a red "BUST" stamps in with a
        // shake + cracks the instant you bust, BEFORE anything reshuffles.
        setAnim({ ...IDLE, playing: true, focused: true, dropCell: cellKey, freezeState: placedFrozen });
        await pause(300);
        await settleOut(); // the BUST stamp (and everything after) runs zoomed OUT
        sfx.bust();
        haptic("bust");
        setAnim((a) => ({ ...a, banner: "BUST", shake: true }));
        await pause(750);

        // Phase A: the placed tile lands, then lifts up; the covered tile is
        // revealed and also floats. (We freeze the board WITH the placed tile.)
        setAnim((a) => ({ ...a, banner: null, shake: false, dropCell: null, hiddenCells: new Set([cellKey]), freezeState: placedFrozen }));
        // floating tiles above the cell (placed + covered)
        const floaters: FlyingTile[] = [
          { id: "bust-placed", value: tile, fromKey: cellKey, to: "bust", delay: T.bustLift },
        ];
        if (outcome.coveredVal !== null) {
          floaters.push({ id: "bust-covered", value: outcome.coveredVal, fromKey: cellKey, to: "bust", delay: T.bustLift + T.bustFlyStagger });
        }
        setAnim((a) => ({ ...a, flying: floaters }));
        await pause(T.bustLift + T.bustFly + floaters.length * T.bustFlyStagger);

        // DISCARDED COMBO — the activated group you were building is forfeit on a
        // bust: strip its rings and drop the gems off the bottom of the board, one
        // after another (a soft negative note per gem), before anything reshuffles.
        const discardCells = new Set<string>(frozen.activatedCells);
        if (discardCells.size > 0) {
          // the doomed combos turn RED first — a clear warning beat before they
          // fall, so the forfeit reads as a sentence, not a vanishing act
          setAnim((a) => ({ ...a, flying: [], litCells: new Set(), hiddenCells: new Set([cellKey]), redCells: new Set(discardCells) }));
          await pause(480);
          const noRings: GameState = { ...placedFrozen, activatedCells: [], activatedCombos: [] };
          setAnim((a) => ({ ...a, freezeState: noRings, flying: [], redCells: new Set(), litCells: new Set(), hiddenCells: new Set([cellKey]), fallCells: discardCells, fallGo: true }));
          sfx.nebForfeit();
          [...discardCells].forEach((_, i) => setTimeout(() => sfx.poof(), 130 + i * 70));
          await pause(760);
          // the gems are gone now — remove them from the board so the rest of the
          // bust cleanup (fly-outs, reshuffle) never re-shows them
          setAnim((a) => ({ ...a, freezeState: boardWithout(placedFrozen, discardCells), fallCells: null, fallGo: false, hiddenCells: new Set([cellKey]) }));
        }

        // Compute committed result to know what the bust resolved.
        const committed = place(frozen, cellKey);
        recordMoveTrace(state, committed, cellKey, choiceIdx); // dev play-by-play (?debug=1)
        const bres = committed.lastResolved;

        // THE THIRD BUST — the run is over, immediately: the engine skipped the
        // forced tile and the reshuffle. The final heart tears out of the BUSTS
        // box, flies to the centre of the screen and BURSTS; then the end card.
        if (committed.phase !== "playing" && committed.livesLeft <= 0) {
          sfx.finalBust();
          haptic("bust");
          setAnim((a) => ({ ...a, flying: [], finalHeart: "fly" }));
          await pause(780);
          // the heart BREAKS: two halves rotate apart and fall, one after the
          // other, under the failure sting
          sfx.failure();
          setAnim((a) => ({ ...a, finalHeart: "break" }));
          await pause(1500);
          setAnim((a) => ({ ...a, finalHeart: null }));
          await commitFinal(committed);
          setAnim(IDLE);
          busyRef.current = false;
          return;
        }

        // Rule 2: every tile isolated by the bust flies UP to the score (minerals,
        // Core for 500, Glint for 0).
        const isoFly: FlyingTile[] = bres.isolatedToScore.map((t, i) => ({
          id: `iso-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "score", delay: i * 70,
        }));
        if (isoFly.length > 0) {
          const hide = new Set(bres.isolatedToScore.map((t) => t.key));
          playClearSounds(bres.isolatedToScore);
          setAnim((a) => ({ ...a, hiddenCells: hide, flying: isoFly }));
          await pause(T.specialFly + isoFly.length * 70 + 100);
        }

        // Rule 6 + buried: pair's second tile and recovered buried minerals -> hand.
        const bustToHand: FlyingTile[] = [
          ...bres.pairToHand.map((t, i) => ({
            id: `pair-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand" as const, delay: i * 70, fast: true,
          })),
          ...bres.buriedToHand.map((t, i) => ({
            id: `buried-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "hand" as const, delay: (bres.pairToHand.length + i) * 70, fast: true,
          })),
        ];
        if (bustToHand.length > 0) {
          const hide = new Set(bustToHand.map((f) => f.fromKey!).filter(Boolean));
          playHandSounds([...bres.pairToHand, ...bres.buriedToHand]);
          setAnim((a) => ({ ...a, hiddenCells: hide, flying: bustToHand }));
          await pause(T.toHandFly + bustToHand.length * 70 + 100);
        }

        // CAUSE-ORDER PRESENTATION (mirrors the engine, decision record): the
        // forced tile drops FIRST, then the reshuffle drifts, then the bust's own
        // wake discards (red flash + poof — a bust never pays), and only THEN the
        // collapse, whose strays bank by the standard rules afterwards.
        const inertKey = bres.inertAt; // FINAL position (post nudge + collapse remap)
        const bustCleared = new Set<string>([...frozen.activatedCells, cellKey]);
        const preBase = boardWithout(frozen, bustCleared); // the board after the losses
        // where the forced tile sat BEFORE any collapse: the bust cell, or its
        // nudged spot — the wake-discard list records it at that position
        const inertKeyPre = bres.nudged.find((m) => m.from === cellKey)?.to ?? cellKey;
        const inertDiscard = bres.lateDiscarded.find((t) => t.key === inertKeyPre) ?? null;
        const inertVal = inertKey ? (committed.cells.get(inertKey)?.tile ?? null) : null;
        const dropVal = (inertVal ?? inertDiscard?.value ?? null) as TileVal | null;
        const preWithDrop = dropVal !== null ? withTileAt(preBase, cellKey, dropVal) : preBase;

        // THE FORCED TILE'S ENTRANCE — it lands on the bust cell with a negative
        // sting. Even when the wake immediately discards it (it landed isolated —
        // the inert marker is purely visual now), the player sees it land, flash
        // red and poof with the other discards: it never appears from nowhere,
        // and never vanishes unseen.
        if (dropVal !== null) {
          const dropFly: FlyingTile[] = [
            { id: "bust-next", value: dropVal, fromKey: null, fromXY: handOrigin(), to: "gap", toKey: cellKey, delay: 0 },
          ];
          setAnim({ ...IDLE, playing: true, focused: true, hiddenCells: new Set([cellKey]), flying: dropFly, freezeState: preWithDrop });
          setTimeout(() => {
            sfx.place(); // the landing thud…
            sfx.gainDross(); // …under a negative sting: this tile was forced on you
          }, T.bustDropNext - 120);
          await pause(T.bustDropNext + 120);
        }

        // Keep any tiles the COLLAPSE-stray pass will bank on the board through
        // the collapse; they fly off afterwards in animateLateResolution.
        const cw = withLateTiles(committed);

        // RESHUFFLE drift (never on a collapse turn — the contraction shows the
        // final positions itself). The forced tile is already down, so it simply
        // drifts along with everything else.
        if (!bres.shrunk && (bres.reshuffled || bres.nudged.length > 0)) {
          await animateReshuffle(cw);
        }

        // THE WAKE DISCARDS — resolved BEFORE any collapse now. Without a
        // collapse the committed board still has these coordinates (flash on the
        // final view); with one, rebuild the pre-collapse board with the nudges
        // applied so the flash happens where the player last saw the tiles.
        let collapseBase = bres.shrunk ? applyNudges(preWithDrop, bres.nudged) : preWithDrop;
        if (bres.lateDiscarded.length > 0) {
          const keys = new Set(bres.lateDiscarded.map((t) => t.key));
          const flashView = bres.shrunk ? collapseBase : cw;
          // warning beat: the doomed isolated tiles (the forced tile included, if
          // the wake cut it off) turn RED…
          setAnim((a) => ({ ...a, playing: true, freezeState: flashView, flying: [], redCells: keys, hiddenCells: new Set() }));
          await pause(520);
          // …then they DROP off the board, exactly like a forfeited activated
          // combo — they don't bank, so they share its exit. Never a silent poof.
          [...keys].forEach((_, i) => setTimeout(() => sfx.poof(), 130 + i * 70));
          setAnim((a) => ({ ...a, redCells: new Set(), fallCells: keys, fallGo: true }));
          await pause(760);
          collapseBase = boardWithout(collapseBase, keys);
          setAnim((a) => ({ ...a, freezeState: bres.shrunk ? collapseBase : boardWithout(cw, keys), fallCells: null, fallGo: false }));
          await pause(100);
        }

        // THE ABYSS COLLAPSES — last, exactly as the engine now resolves it. The
        // surviving forced tile contracts along with the board and reappears
        // remapped; the strays the collapse cut off fly to score/hand afterwards
        // by the standard isolation rules (the collapse pays — the bust never does).
        {
          const preShrinkC = await singularityBeat(collapseBase, bres);
          if (bres.shrunk) {
            await animateShrink(preShrinkC, bres.shrunk.mapping, cw, bres.shrunk.final);
          }
        }
        await animateLateResolution(committed);

        await commitFinal(committed); // plays COLLAPSE / GLINT RUSH first if the board came down
        setAnim(IDLE);
        busyRef.current = false;
        return;
      }
      }; // end resolveMove

      // AMBIGUITY GATE — when the placement could resolve more than one way,
      // stage the pre-select-and-confirm picker instead of resolving now: the
      // best option lights blue, the alternatives grey; it auto-confirms after
      // CHOICE_WINDOW unless the player switches (which restarts the window)
      // or taps the blue to commit instantly. Never appears for a single
      // resolution, a bust, a Dross or a wild Nebulite. When the player has
      // turned the combo picker OFF, skip staging entirely and auto-resolve the
      // best option (index 0) — the very same option the picker pre-selects.
      if (gameOptions.comboPicker && outcome.kind !== "bust") {
        const alts = placeAlternatives(state, cellKey);
        if (alts.length >= 2) {
          busyRef.current = false; // the picker needs taps to flow
          const placedFrozen = withTileAt(state, cellKey, tile);
          choiceRef.current = {
            cellKey,
            alts,
            sel: 0,
            tick: 0,
            timer: null,
            resolve: (i: number) => {
              void (async () => {
                try {
                  await resolveMove(i);
                } catch (e) {
                  if (e !== ABORT) throw e;
                }
              })();
            },
          };
          setAnim({ ...IDLE, playing: true, focused: true, dropCell: cellKey, freezeState: placedFrozen, choice: null });
          sfx.click(); // a soft cue that the placement is staged, awaiting the pick
          paintChoice();
          armChoiceTimer();
          return;
        }
      }

      await resolveMove(0, outcome);
      } catch (e) {
        // a restart mid-animation aborted this sequence — the new game owns the screen
        if (e !== ABORT) throw e;
      }
    },
    [state]
  );

  return { state, anim, settling, onPlace, start, setMapper, earlyBankOffer, bankNow, swapHand, rotateHand, cashOutNow, handRevealed, setBoardHeld };
}

// ---- helpers ----

// Build the COMBO LINEUP rows from the bank's combo decomposition: resolve each
// cell to the tile shown on the frozen board, order run rows by value (so a
// Drift reads 1-2-3-4), and mark a cell's SECOND appearance as a ghost — a
// visual aid showing the tile also completed that combo; it is not banked twice.
function lineupRows(
  combos: { name: string; cells: string[]; run: boolean }[],
  frozen: GameState
): { name: string; tiles: { cell: string | null; value: TileVal; ghost: boolean; jokerValue?: number }[] }[] {
  const seen = new Set<string>();
  return combos.map((c) => {
    const cells = c.run
      ? [...c.cells].sort(
          (a, b) => ((frozen.cells.get(a)?.tile ?? 0) as number) - ((frozen.cells.get(b)?.tile ?? 0) as number)
        )
      : c.cells;
    // a joker Core in the combo lines up as the mineral it mirrored (still in
    // its purple ring) — the mirror must never silently revert mid-ceremony
    const mineral = c.cells.map((k) => frozen.cells.get(k)?.tile).find((t) => t != null && t !== GLINT && t !== CORE) as number | undefined;
    return {
      name: c.name,
      tiles: cells.map((k) => {
        const ghost = seen.has(k);
        seen.add(k);
        const v = (frozen.cells.get(k)?.tile ?? 1) as TileVal;
        return { cell: k, value: v, ghost, jokerValue: v === CORE ? mineral : undefined };
      }),
    };
  });
}

// The engine removes late-isolated tiles from `committed`, but the collapse/
// reshuffle animations run BEFORE they fly off — so build a view that still shows
// them (they lift off during animateLateResolution).
function withLateTiles(committed: GameState): GameState {
  const li = committed.lastResolved.lateIsolated;
  const ld = committed.lastResolved.lateDiscarded;
  if (!li.banked.length && !li.toHand.length && !li.buried.length && !ld.length) return committed;
  const cells = new Map(committed.cells);
  const readd = (key: string, value: number) => {
    const c = committed.cells.get(key);
    if (c) cells.set(key, { coord: c.coord, tile: value as TileVal, inert: false, buried: null });
  };
  ld.forEach((t) => readd(t.key, t.value)); // bust-wake discards poof AFTER the reshuffle shows them
  li.banked.forEach((t) => readd(t.key, t.value));
  li.toHand.forEach((t) => readd(t.key, t.value));
  li.buried.forEach((t) => readd(t.key, t.value));
  return { ...committed, cells };
}

// Apply the engine's nudge drifts forward onto a frozen view — used to rebuild
// the PRE-collapse board a bust's wake discards flashed on (the engine nudges,
// then discards, then collapses; the discard keys are post-nudge positions).
function applyNudges(g: GameState, moves: { from: string; to: string }[]): GameState {
  if (moves.length === 0) return g;
  const cells = new Map(g.cells);
  for (const { from, to } of moves) {
    const src = cells.get(from);
    const dst = cells.get(to);
    if (!src || !dst) continue;
    cells.set(to, { coord: dst.coord, tile: src.tile, inert: src.inert, buried: src.buried });
    cells.set(from, { coord: src.coord, tile: null, inert: false, buried: null });
  }
  return { ...g, cells };
}

// The primary pointer is coarse (a finger) → a touch device. The thick-thumbs
// rescue only applies here; a desktop mouse click is precise and never snapped.
function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
}

// THICK-THUMBS RESCUE — when the tapped cell would bust, find the best adjacent
// cell to snap to: a legal, non-bust placement that isn't part of a glowing combo,
// nearest to where the finger actually landed (falls back to preferring a bank).
function findRescueCell(
  state: GameState,
  clickedKey: string,
  tap: { x: number; y: number } | undefined,
  mapper: Mapper | null
): string | null {
  const neighbours = state.adj.get(clickedKey) ?? [];
  // describePlace clones the whole board, so compute each neighbour's outcome
  // kind AT MOST ONCE and reuse it for both the filter and the bank-preference
  // sort (the old sort re-cloned per comparison — O(n log n) clones).
  const kinds = new Map<string, string>();
  const kindOf = (k: string) => {
    let v = kinds.get(k);
    if (v === undefined) { v = describePlace(state, k).kind; kinds.set(k, v); }
    return v;
  };
  const candidates = neighbours.filter((k) => !state.activatedCells.includes(k) && kindOf(k) !== "bust");
  if (candidates.length === 0) return null;
  if (tap && mapper) {
    let best: string | null = null;
    let bestD = Infinity;
    for (const k of candidates) {
      const c = mapper(k);
      if (!c) continue;
      const d = (c.x - tap.x) ** 2 + (c.y - tap.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best) return best;
  }
  // no tap coords: prefer a bank over a plain activation
  const rank = (k: string) => (kindOf(k) === "bank" ? 2 : 1);
  return [...candidates].sort((a, b) => rank(b) - rank(a))[0];
}

// A short blip per tile flying to the hand (Dross gets the negative sound),
// staggered to match the visual fly delays.
function playHandSounds(tiles: { value: number }[]) {
  tiles.forEach((t, i) => setTimeout(() => (t.value === GLINT ? sfx.gainDross() : sfx.tileToHand()), i * 70));
}
// A clear sound for each special tile (Dross / Nebulite) resolving to the score.
function playClearSounds(tiles: { value: number }[]) {
  tiles.forEach((t, i) => {
    if (t.value === GLINT || t.value === CORE) setTimeout(() => sfx.clearSpecial(t.value), i * 70);
  });
}

// Approximate hand origin in screen coords (the "NOW PLACING" tile lives bottom-left).
function handOrigin(): { x: number; y: number } {
  return { x: 120, y: window.innerHeight - 120 };
}

// Where the multiplier tile parks: just left of the score box, near the top.
// (Resolved live in the overlay via the "multiplier" target; this is the start
// position for the final fly-into-score, approximated at top-centre.)
function parkedXY(): { x: number; y: number } {
  return { x: window.innerWidth / 2 - 120, y: 130 };
}

// A shallow view of `state` but with a given tile forced into a cell, for the
// freeze frame that shows the placed tile before it lifts on a bust.
function withTileAt(state: GameState, key: string, val: TileVal): GameState {
  const cells = new Map(state.cells);
  const c = cells.get(key)!;
  cells.set(key, { coord: c.coord, tile: val, inert: false, buried: c.buried });
  return { ...state, cells };
}

// A freeze-frame with recovered buried minerals REVEALED in their cells: as the
// departing Dross/Core lifts away, the gem that was always underneath is already
// sitting there (it then flies to the hand from that cell) — nothing ever looks
// "added" to the board.
function revealBuried(state: GameState, recovered: { key: string; value: number }[]): GameState {
  if (recovered.length === 0) return state;
  const cells = new Map(state.cells);
  for (const { key, value } of recovered) {
    const c = cells.get(key);
    if (c) cells.set(key, { coord: c.coord, tile: value as TileVal, inert: false, buried: null });
  }
  return { ...state, cells };
}

// A "clean" pre-collapse board: the given board with all already-cleared cells emptied
// and the activation glow removed — so a COLLAPSE contracts only the surviving tiles
// (no banked tiles briefly reappearing, no leftover green rings).
function boardWithout(state: GameState, cleared: Set<string>): GameState {
  const cells = new Map(state.cells);
  for (const k of cleared) {
    const c = cells.get(k);
    if (c) cells.set(k, { coord: c.coord, tile: null, inert: false, buried: null });
  }
  return { ...state, cells, activatedCells: [], activatedCombos: [] };
}

/** Remove cells ENTIRELY (prism and all) — the post-SINGULARITY frozen board. */
function dropCells(state: GameState, keys: Set<string>): GameState {
  const cells = new Map(state.cells);
  for (const k of keys) cells.delete(k);
  return { ...state, cells, order: state.order.filter((k) => !keys.has(k)) };
}
