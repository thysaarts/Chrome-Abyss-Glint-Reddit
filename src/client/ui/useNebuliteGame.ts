import { useCallback, useEffect, useRef, useState } from "react";
import {
  newGame,
  place,
  bankClusterNow,
  clusterCombosFor,
  coopEndTurn,
  versusEndTurn,
  claimCluster,
  describePlace,
  placeAlternatives,
  logOnly,
  visibleTile,
  cashOut,
  offerCashOut,
  resolveCashOut,
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
import { ceremonyCluster } from "./bankCeremony";
import { recordMoveTrace, recordBankTrace, clearTrace, beatStart, beat, beatEnd } from "../game/trace";
import { isCoarsePointer } from "../theme/theme";
import { applyNetMove, NetMove } from "../net/moves";
import { seatForEntry, isMyTurn, Entry } from "../net/seats";
import type { MatchMode } from "../net/netMatch";
import type { BoardShape } from "../game/hex";
import { logText, chainLabel } from "../content/content";
import { sfx } from "../audio/sfx";
import { haptic } from "../game/haptics";
import { gameOptions } from "./settings";
import { loadStats } from "../game/stats";
import { abilityUnlocked } from "../game/challenges";
import { chainBonus, ComboName } from "../game/combos";

/** Total length of the Zenith arrival flourish — the hold mid-screen plus the fly
 *  into the hand. The commitFinal choreography waits this long; the ZenithArrival
 *  overlay runs its own timeline against the same budget. */
const ZENITH_ARRIVAL_MS = 2100;

/** The UNCOVER beat for a bonus gem dug out of the board: how long one gem's
 *  grow-and-rise runs (matched by the `gl-uncover` keyframes in index.css), and
 *  the gap between gems when a single action uncovers more than one. */
const UNCOVER_MS = 1100;
const UNCOVER_STAGGER_MS = 200;

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
// ONLINE: how long the WATCHER holds before a collapse / singularity / end-card,
// to re-sync with the active player (whose full animation runs longer than the
// watcher's quick disappear). A flat delay — good enough for same-room play.
const SPECTATE_SYNC_MS = 2000;

// COMBO CHOICE — when a placement could resolve more than one way, the best
// option pre-lights blue and auto-confirms after a per-difficulty window
// (gameOptions.choiceWindowMs — easy 3000, medium/hard 2000); tap the amber
// alternative to switch (resets the window) or tap the blue to commit instantly.

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
  shrinking?: { phase: number; scale: number; vanishing: Set<string>; final?: boolean; fromCells: number; toCells: number; reveal?: boolean } | null;
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
  // ZENITH ARRIVAL — after GLINT RUSH, the dealt Zenith floats mid-screen under a
  // light overlay, then flies into the active hand slot. While true, the footer
  // hides the (incoming) active gem so the flying one is the only Zenith on screen.
  zenithArrival?: boolean;
  // BONUS GEM UNCOVERED — a Resurrect / Quadriant that was buried under the tile
  // this action just cleared. The board has already resolved it away, so the
  // reveal gets its own beat AT THE CELL: the gem grows out of the hex and rises
  // (the placement drop played backwards) before the effect's flight follows.
  // `delay` staggers a multi-uncover so they announce themselves one at a time.
  bonusUncover?: { key: string; gem: TileVal; delay: number }[] | null;
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

// Staggered SFX scheduled alongside animation beats. The awaited chain aborts via
// `pause`, but a raw setTimeout is DETACHED — restarting mid-animation would still
// fire the old run's sounds over the new game. `sfxAt` skips the sound if a new
// game has started since it was scheduled (start() bumps the epoch).
let sfxEpoch = 0;
function sfxAt(fn: () => void, ms: number): void {
  const e = sfxEpoch;
  setTimeout(() => { if (sfxEpoch === e) fn(); }, ms);
}

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
  // GLINT VERSUS: the tap-to-claim window — picker-style. After your activating
  // placement a countdown circle appears in your colour; tapping the combo
  // again claims it, silence lets it lapse (3s, like the BANK NOW rhythm).
  const [claimOffer, setClaimOffer] = useState<{ cellKey: string; n: number } | null>(null);
  const claimSeqRef = useRef(0);
  const claimOfferRef = useRef(claimOffer);
  claimOfferRef.current = claimOffer;
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeClaimOffer = () => {
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    claimTimerRef.current = null;
    setClaimOffer(null);
  };
  const openClaimOffer = (cellKey: string) => {
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    // n re-keys the countdown ring so its drain RESTARTS for every fresh window
    setClaimOffer({ cellKey, n: ++claimSeqRef.current });
    claimTimerRef.current = setTimeout(() => setClaimOffer(null), 3000);
  };

  const mapperRef = useRef<Mapper | null>(null);
  const busyRef = useRef(false);
  // cells whose buried bonus gem has already taken its UNCOVER bow in THIS
  // resolve — the choreography plays it at the seam, commitFinal's net skips it
  const playedUncoversRef = useRef<Set<string>>(new Set());
  // this RUN mutes the combo picker (start()'s suppressPicker — the tutorial's
  // mid-way practice board, played before the blue/amber lesson exists)
  const suppressPickerRef = useRef(false);
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;
  // ONLINE PLAY: when set, this device is one seat of a networked match. `entry`
  // is its slot (0 = host, 1 = guest); `onLocal` reports a committed local move
  // to the transport. Followers (not their turn) are blocked from input and from
  // auto-behaviours; only the active device acts and emits. `applyingRemoteRef`
  // guards the apply path so a replayed opponent move never re-emits.
  const netRef = useRef<{ entry: Entry; onLocal: (m: NetMove) => void } | null>(null);
  const applyingRemoteRef = useRef(false);
  // is online input allowed right now? (solo/hot-seat: always; online: my turn)
  const canActRef = useRef(true);
  const online = () => netRef.current !== null;
  const myTurn = (s: GameState) => !netRef.current || isMyTurn(s, netRef.current.entry);
  // emit a committed local move to the transport (seat filled from my entry)
  const emitLocal = (m: Omit<NetMove, "seq" | "seat">) => {
    const net = netRef.current;
    if (!net || applyingRemoteRef.current) return;
    net.onLocal({ ...m, seq: 0, seat: seatForEntry(stateRef.current, net.entry) });
  };
  // ANTI-CHEAT RECORDER: while set, every committed local action is appended so a
  // daily run's whole move stream can be replayed & scored server-side. Records
  // the RESOLVED cell/choice, so the rescue-snap and combo-picker replay exactly.
  const recordRef = useRef<NetMove[] | null>(null);
  const record = (m: Omit<NetMove, "seq" | "seat">) => {
    const rec = recordRef.current;
    if (rec && !applyingRemoteRef.current) rec.push({ ...m, seq: rec.length, seat: 0 });
  };
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
  // the resolved options of the CURRENT run — what a Beat-my-board link carries
  const lastStartRef = useRef<{
    seed: number; side: number; collapseAt1: number; collapseAt2: number;
    singularityAt: number; revealAt: number; rescueMode: "off" | "easy" | "medium"; handSize: number;
    nebuliteRig?: boolean;
  } | null>(null);

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

  // monotonic per-started-game counter — App keys per-game one-shots (the
  // reveal EYE) to it, since GameState itself carries no stable run identity
  const [runSeq, setRunSeq] = useState(0);
  const start = useCallback((opts: NewGameOpts & { countdown?: boolean; exact?: boolean; resumeMoves?: NetMove[]; suppressPicker?: boolean } = {}) => {
    setRunSeq((n) => n + 1);
    // per-run picker mute (the tutorial's mid-way practice board runs before the
    // blue/amber lesson): auto-resolve the best combo regardless of the setting
    suppressPickerRef.current = opts.suppressPicker === true;
    netRef.current = null; // leave any online session (startOnline re-arms it after)
    applyingRemoteRef.current = false;
    recordRef.current = null; // stop any prior recording; the daily re-arms it after
    clearTrace(); // fresh dev play-by-play per run (?debug=1)
    seqGenRef.current++; // abort any in-flight animation sequence (see `pause`)
    sfxEpoch++; // and silence its detached staggered SFX timers (see `sfxAt`)
    if (choiceRef.current?.timer) clearTimeout(choiceRef.current.timer);
    choiceRef.current = null;
    busyRef.current = false;
    playedUncoversRef.current.clear(); // an aborted sequence must not mute the next run's uncovers
    shrinkAnimatedRef.current = false;
    singularityAnimatedRef.current = false;
    if (offerTimerRef.current) clearTimeout(offerTimerRef.current);
    setEarlyBankOffer(null);
    closeClaimOffer();
    setSettling(false);
    // A resolved seed for EVERY game — Beat-my-board needs to know which board
    // this was, so the seed is decided here, never left to the engine's default.
    const seed = opts.seed ?? ((Math.random() * 0x7fffffff) | 0 || 1);
    let ns: GameState;
    if (opts.exact) {
      // EXACT mode — the caller's values verbatim, no difficulty shift. Two users:
      // BEAT MY BOARD / dailies (bonus gems forced OFF so an unlocked Zenith never
      // tilts a shared board), and SOLO runs pre-resolved via runOpts() for the
      // anti-cheat replay (those pass their own bonusGems, honoured here).
      ns = buildInitial({
        side: 6,
        ...opts,
        seed,
        bonusGems: opts.bonusGems ?? { resurrect: false, quadriant: false, zenith: false },
      });
    } else {
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
      ns = buildInitial({
        side: 6,
        ...opts,
        seed,
        collapseAt1: Math.max(4, (opts.collapseAt1 ?? 30) + shift),
        collapseAt2: Math.max(3, (opts.collapseAt2 ?? 15) + shift),
        singularityAt: Math.max(6, (opts.singularityAt ?? 45) + shift),
        // the hand-reveal threshold and the bust rescue are difficulty-driven;
        // the ENGINE owns both (reveal hysteresis + the invisible rescue)
        revealAt: gameOptions.revealAt,
        rescueMode: gameOptions.difficulty === "hard" ? "off" : gameOptions.difficulty,
        bonusGems,
      });
    }
    // what a Beat-my-board link needs to reproduce this run, captured RESOLVED
    lastStartRef.current = {
      seed,
      side: ns.side,
      collapseAt1: ns.collapseAt1,
      collapseAt2: ns.collapseAt2,
      singularityAt: ns.singularityAt,
      revealAt: ns.revealAt,
      rescueMode: ns.rescueMode,
      handSize: ns.startHandSize,
      // the refine rig reshapes the deal — a link that drops it would rebuild a
      // DIFFERENT board from the same seed (rigged dailies + campaign refine levels)
      ...(opts.nebuliteRig ? { nebuliteRig: true } : {}),
    };
    // RESUME (async): replay the whole move history NOW and load the board in its
    // CURRENT state — no opening rain / countdown, and no fresh-board flash (a single
    // setState straight to the caught-up board).
    if (opts.resumeMoves && opts.resumeMoves.length) {
      const resumed = opts.resumeMoves.reduce((acc, m) => applyNetMove(acc, m), ns);
      performedSideRef.current = resumed.side;
      setState(resumed);
      setAnim(IDLE);
      return;
    }
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
        // EXTRA GEMS (depth reward + Easy's bonus) ride the SAME volley as the
        // Dross/Nebulite drops — the tail of the starting hand, always different
        // minerals — so the player sees what they were dealt without the opening
        // running any longer than it already does.
        const extras = ns.startExtraGems ?? 0;
        const extraFlights: FlyingTile[] = ns.hand.slice(ns.hand.length - extras).map((v, i) => ({
          id: `entry-extra-${i}`,
          value: v as TileVal,
          fromKey: null,
          fromCentre: true,
          to: "hand" as const,
          delay: 200 + i * 240, // launched with the volley, home before the last special lands
          fast: true,
          glow: "#c084fc",
        }));
        extraFlights.forEach((f) => sfxAt(() => sfx.tileToHand(), f.delay + T.toHandFly));
        setAnim((a) => ({
          ...a,
          entryDrop: false,
          flying: specials.map((k, i): FlyingTile => {
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
          }).concat(extraFlights),
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

  // THE UNCOVER, played INSIDE the choreography that dug the gem out: the moment
  // the covering tile leaves its cell, the Resurrect / Quadriant under it grows
  // back out of the empty hex and rises (its placement drop, backwards) under one
  // discovery sparkle. It has to happen HERE — a bank that waits for the lineup
  // and the score to come and go announces the find long after the moment.
  //
  // `cells` is the set of cells whose cover has JUST left: a gem is only allowed
  // to rise from a hex the player has already seen empty. Everything else waits
  // for a later seam, or for commitFinal's safety net. playedUncoversRef holds
  // what this resolve already showed, so the net can't announce a gem twice.
  const uncoverBeat = useCallback(async (
    revealed: { key: string; gem: TileVal }[] | undefined,
    cells: Set<string> | null,
    view?: GameState | null
  ) => {
    const items = (revealed ?? [])
      .filter((r) => (r.gem === RESURRECT || r.gem === QUADRIANT)
        && r.key !== "hand" && r.key !== "collapsed"
        && !playedUncoversRef.current.has(r.key)
        && (!cells || cells.has(r.key))
        && mapperRef.current?.(r.key))
      .map((r, i) => ({ key: r.key, gem: r.gem as TileVal, delay: i * UNCOVER_STAGGER_MS }));
    if (!items.length) return 0;
    for (const it of items) playedUncoversRef.current.add(it.key);
    const keys = new Set(items.map((i) => i.key));
    // the cover has gone and the gem was never a tile: the cell reads EMPTY under
    // the rising gem — but it KEEPS its bank light-up (a Quadriant hiding under a
    // gold-lit tile must not punch a dark hole in the glowing cluster)
    setAnim((a) => ({
      ...a,
      playing: true,
      freezeState: view ?? a.freezeState,
      hiddenCells: new Set([...a.hiddenCells, ...keys]),
      bonusUncover: items,
    }));
    sfx.bonusUncover();
    await pause(UNCOVER_MS + (items.length - 1) * UNCOVER_STAGGER_MS);
    setAnim((a) => ({ ...a, bonusUncover: null }));
    return items.length;
  }, []);

  // EAGER HUD COMMITS — each HUD element reacts the moment ITS OWN beat lands
  // (hearts on the bust discard, bank pips at BANK NOW, the hand count at the
  // placement, hand arrivals as they land) instead of waiting for the whole
  // ceremony's commitFinal. Only presentation fields move mid-flight; the full
  // engine truth still lands wholesale at commitFinal.
  const hudCommit = useCallback((patch: (s: GameState) => Partial<GameState>) => {
    setState((s) => (s.phase !== "playing" ? s : { ...s, ...patch(s) }));
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
    // ZENITH ARRIVAL: at GLINT RUSH the Zenith is dealt to the FRONT of the hand.
    // Play its arrival flourish — it floats mid-screen under a light overlay, then
    // flies into the active slot (footer hides the incoming gem meanwhile). Detected
    // from the "hand" reveal with no bonus (a deal, not a bank).
    const zenithArrived = (next.lastResolved?.bonusRevealed ?? []).some((r) => r.key === "hand" && r.gem === ZENITH && !r.bonus);
    if (zenithArrived && next.phase === "playing") {
      setAnim((a) => ({ ...a, playing: true, freezeState: null, zenithArrival: true }));
      sfx.zenithReveal();
      await pause(ZENITH_ARRIVAL_MS);
      setAnim((a) => ({ ...a, playing: false, zenithArrival: false }));
    }
    // ACHIEVEMENT BONUS GEM reveals: the special sound + a flourish flight to the
    // slot the effect landed in (heart → busts, Quadriant → score, Zenith → score
    // when it banked / already in hand when it was dealt).
    const reveals = (next.lastResolved?.bonusRevealed ?? []).filter((r) => r.key !== "hand" || r.bonus);
    if (reveals.length && next.phase === "playing") {
      const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
      const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
      // a reveal's key is the BOARD CELL it came out of — except the bookkeeping
      // pseudo-keys ("hand" = dealt, "collapsed" = swept up by a contraction),
      // which have no cell to rise from.
      const cellOf = (key: string) => (key !== "hand" && key !== "collapsed" ? mapperRef.current?.(key) ?? null : null);
      // THE UNCOVER — SAFETY NET only. Every staged choreography plays it at the
      // seam where the cover left (see uncoverBeat); this catches a gem surfaced
      // by a path that goes straight to commit, so a reveal can never arrive with
      // no visual at all. Gems already announced are skipped by their key.
      const uncovers = await uncoverBeat(reveals, null, next);
      const flights: FlyingTile[] = [];
      reveals.forEach((rev, i) => {
        // the heart flies FROM the cell it was just uncovered at (screen centre
        // only when there is no cell — a deal, or a gem the collapse swallowed)
        const at = cellOf(rev.key);
        if (rev.gem === RESURRECT) { sfx.resurrectReveal(); flights.push({ id: `rev-res-${i}`, value: RESURRECT as TileVal, fromKey: null, fromXY: at ?? { x: cx, y: cy }, to: "bust", delay: i * 220, glow: "#ff6e8e" }); }
        else if (rev.gem === QUADRIANT) { sfx.quadriantReveal(); /* its overview line + the score carry the visual — no extra flight */ }
        else { sfx.zenithReveal(); flights.push({ id: `rev-zen-${i}`, value: ZENITH as TileVal, fromKey: null, fromXY: { x: cx, y: cy }, to: "score", delay: i * 220, glow: "#e4ff6b" }); }
      });
      if (flights.length) {
        setAnim((a) => ({ ...a, playing: true, freezeState: next, flying: flights }));
        await pause(1000 + flights.length * 220);
        setAnim(IDLE);
      } else if (uncovers) {
        // a Quadriant-only reveal: the uncover WAS the beat — hand the board back
        setAnim(IDLE);
      }
    }
    // this resolve is over: the next one may uncover a gem at the same cell
    playedUncoversRef.current.clear();
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
    if (!myTurn(s)) return; // online: only the active device reorders
    if (s.phase !== "playing" || s.hand.length > 3 || i <= 0 || i >= s.hand.length) return;
    sfx.click();
    emitLocal({ kind: "swap", index: i }); // relay so both hands stay in sync
    record({ kind: "swap", index: i });
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
    if (!myTurn(s)) return; // online: only the active device reorders
    if (s.phase !== "playing") return;
    if (i <= 0 || i >= s.hand.length) return;
    emitLocal({ kind: "rotate", index: i }); // relay so both hands stay in sync
    record({ kind: "rotate", index: i });
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
    if (!myTurn(s)) return; // online: only the active device cashes out
    if (s.phase !== "playing" || !s.deathMatch) return;
    // DEFERRED CASH-OUT: the OTHER player already offered and I chose "Continue
    // playing" (so the turn came to me for one last move). If I now decide to cash
    // out too, don't open a fresh offer they'd have to answer — they've already
    // committed to ending, so just COMMIT the pending cash-out right here.
    if (s.pendingCashout?.deferred) {
      sfx.bankScore();
      emitLocal({ kind: "cashoutAccept" });
      setState(resolveCashOut(s, true));
      setSettling(true);
      setTimeout(() => setSettling(false), 700);
      return;
    }
    // ONLINE CO-OP: cash-out is a JOINT end the partner can block — OFFER it (both
    // cash out unless blocked); don't end here. VERSUS is NOT joint: cashing out is
    // PERSONAL — you lock in your score and the opponent plays the board out (the
    // race decides at the true end), so it falls through to the individual path.
    if (online() && s.coop) {
      sfx.click();
      emitLocal({ kind: "cashoutOffer" });
      setState(offerCashOut(s));
      return;
    }
    sfx.bankScore();
    emitLocal({ kind: "cashout" });
    record({ kind: "cashout" });
    setState(cashOut(s));
    setSettling(true);
    setTimeout(() => setSettling(false), 700);
  }, []);
  // ONLINE: the WATCHER answers a pending cash-out offer — accept (both cash out)
  // or decline (block it, play resumes). Emitted by the non-active player.
  const respondCashOut = useCallback((accept: boolean) => {
    const s = stateRef.current;
    if (!s.pendingCashout) return;
    sfx.click();
    emitLocal({ kind: accept ? "cashoutAccept" : "cashoutDecline" });
    setState(resolveCashOut(s, accept));
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
    if (!myTurn(st)) return; // online: only the active device banks
    if (!st.activatedCells.includes(offer.cellKey)) return;

    sfx.bankNowClick();
    emitLocal({ kind: "bank", cell: offer.cellKey });
    record({ kind: "bank", cell: offer.cellKey });
    closeClaimOffer(); // banking resolves the cluster — the claim window is moot
    void runBankAnimationRef.current(st, offer.cellKey);
  }, []);

  // THE BANK CHOREOGRAPHY, extracted so a REMOTE bank (the opponent's BANK NOW,
  // arriving over the wire) plays the IDENTICAL animation on the watcher's device.
  // Called via a ref (runBankAnimationRef) so bankNow above reaches it TDZ-free.
  const runBankAnimation = useCallback(async (st: GameState, cellKey: string, spectateVersus = false) => {
      try {
      busyRef.current = true;
      recordBankTrace(st, cellKey); // BANK NOW play-by-play (?debug=1) — closes the
      // score/banks "gap" the placement-only tracer would otherwise leave here
      // one engine commit up front (reused below): the BANKS pips react the
      // moment the bank is initiated, not when the ceremony ends
      const committed = bankClusterNow(st, cellKey);
      const eager = myTurn(st) && !spectateVersus; // never move another seat's HUD
      if (eager) hudCommit(() => ({ freeBanksLeft: committed.freeBanksLeft, banks: committed.banks }));
      const order = st.order;

      // the connected activated cluster from the bank cell (the tiles that bank) —
      // claim-aware, extracted pure and pinned by bankCeremony.test.ts so the
      // ceremony can never again walk cells the engine refuses to bank
      const clusterOrder = ceremonyCluster(st, cellKey);

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

      // VERSUS WATCHER: the points are the OTHER player's (tallied in their box +
      // the name-tagged log), so we DON'T fly the lineup to this device's score —
      // the lit gems simply DISAPPEAR from the board. The collapse / reshuffle and
      // final commit still play, in sync with the active device.
      if (spectateVersus) {
        const committedV = bankClusterNow(st, cellKey);
        const resV = committedV.lastResolved;
        const goneV = new Set<string>([
          ...clusterOrder,
          ...resV.isolatedToScore.map((t) => t.key),
          ...resV.strandToHand.map((t) => t.key),
          ...resV.pairToHand.map((t) => t.key),
        ]);
        setAnim((a) => ({ ...a, playing: true, freezeState: st, litCells: new Set(), hiddenCells: goneV, flying: [], comboLineup: null }));
        await pause(280);
        const cwV = withLateTiles(committedV);
        // SYNC: the watcher's quick disappear finished sooner than the active
        // player's full fly-to-score, so a collapse / singularity would fire too
        // early. Hold a beat so it lands roughly together (also collapse → RUSH).
        if (resV.shrunk || resV.singularity) await pause(SPECTATE_SYNC_MS);
        const preShrinkV = await singularityBeat(boardWithout(st, goneV), resV);
        if (resV.shrunk) {
          await animateShrink(preShrinkV, resV.shrunk.mapping, cwV, resV.shrunk.final, undefined, { deferRush: true });
        } else if (resV.reshuffled || resV.nudged.length > 0) {
          await animateReshuffle(cwV);
        }
        await animateLateResolution(committedV);
        if (resV.shrunk?.final) await playRushTitle(cwV);
        await commitFinal(committedV); // sets the full state incl. the active player's score
        setAnim(IDLE);
        busyRef.current = false;
        return;
      }

      // Phase C: THE COMBO LINEUP — the cluster's activated combos form up in
      // named rows under the score, linger, then dive in (same as a placement
      // bank, base value, no multiplier).
      const cleared = new Set<string>(clusterOrder);
      // the DEDUPED entries the engine will actually score — the lineup and the
      // chain label must show exactly those (a Pentad's Trips/Quad history is
      // not three combos, and never a phantom Harmony)
      const combosIn = clusterCombosFor(st, cellKey);
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
      const ebResolved = committed.lastResolved;
      const ebBuried = ebResolved.buriedToHand.filter((t) => ebClusterSet.has(t.key));
      const ebBuriedKeys = new Set(ebBuried.map((t) => t.key));
      // a joker-Core inside the cluster is COLLECTED — it flies to the wallet
      // rather than leaving silently with the lineup
      const ebCores: FlyingTile[] = clusterOrder
        .filter((k) => st.cells.get(k)?.tile === CORE)
        .map((k, i) => ({ id: `eb-core-${k}`, value: CORE as TileVal, fromKey: k, to: "wallet" as const, delay: nTiles * LINEUP_T.stagger + i * 90 }));
      // BANK NOW's own uncover, at the same seam as a placement bank: the claimed
      // tile lifts off its cell and the gem underneath rises, before the lineup.
      await uncoverBeat(ebResolved.bonusRevealed, ebClusterSet, st);
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

      // The hoisted commit above already learned what the bank resolved.
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
        if (eager) hudCommit((s) => ({ hand: [...s.hand, ...res.strandToHand.map((t) => t.value as TileVal), ...res.pairToHand.map((t) => t.value as TileVal), ...res.buriedToHand.map((t) => t.value as TileVal)] }));
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
        await animateShrink(preShrinkEB, res.shrunk.mapping, cwEB, res.shrunk.final, undefined, { deferRush: true });
      }
      // RESHUFFLE from a Glint clear / nudge during the early bank — always animated,
      // the word before the tiles move.
      if (!res.shrunk && (res.reshuffled || res.nudged.length > 0)) {
        await animateReshuffle(cwEB);
      }

      // tiles isolated by a collapse / glint-clear reshuffle during the early bank
      await animateLateResolution(committed);
      if (res.shrunk?.final) await playRushTitle(cwEB);

      await commitFinal(committed); // plays COLLAPSE / GLINT RUSH first if the board came down
      setAnim(IDLE);
      busyRef.current = false;
      } catch (e) {
        // a restart mid-animation aborted this sequence — the new game owns the screen
        if (e !== ABORT) throw e;
      }
  }, [commitFinal]);
  // latest runBankAnimation, so bankNow (declared above) and the remote-move queue
  // can invoke it without a temporal-dead-zone reference to the const.
  const runBankAnimationRef = useRef(runBankAnimation);
  runBankAnimationRef.current = runBankAnimation;

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

  // GLINT RUSH — announce the final round: the title sweeps in from the side with
  // its own whoosh + stinger (see RushOverlay / gl-rush-slide). Played AFTER the
  // collapse's stray tiles have flown (the rush is the LAST beat of the order:
  // bust → singularity → collapse → strays → rush).
  const playRushTitle = async (revealState: GameState) => {
    sfx.boardCleared(); // a bright fanfare as the smaller board settles
    await pause(120);
    sfx.rushRise(); // the whoosh that carries the title in from the side
    setAnim((a) => ({ ...a, freezeState: revealState, rushTitle: true }));
    await pause(3000);
    setAnim((a) => ({ ...a, rushTitle: false }));
  };

  const animateShrink = async (
    frozen: GameState,
    _mapping: { from: string; to: string }[],
    revealState: GameState,
    isFinal = false,
    keepHidden: Set<string> = new Set(), // cells held back on the REVEALED board (e.g. a bust's forced tile, dropped as its own beat afterwards)
    opts?: {
      // a bust's wake discards on a collapse turn: they fall as PART of the
      // collapse (banner → flash → drop → contraction). They left the board
      // before the remap, so they have no cell on the smaller board — the
      // abyss claiming them mid-collapse is the only truthful staging.
      doomed?: Set<string>;
      // callers that animate the collapse's stray tiles afterwards defer the
      // GLINT RUSH title and play it themselves, last
      deferRush?: boolean;
    }
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

    // THE COLLAPSE CLAIMS ITS TILES — the doomed wake discards flash and fall
    // into the abyss under the banner, BEFORE the contraction: the player sees
    // the collapse take them, never a premature exit on the old layout.
    if (opts?.doomed && opts.doomed.size > 0) {
      setAnim((a) => ({ ...a, shake: false, redCells: new Set(opts.doomed) }));
      await pause(520);
      [...opts.doomed].forEach((_, i) => sfxAt(() => sfx.poof(), 130 + i * 70));
      setAnim((a) => ({ ...a, fallCells: new Set(opts.doomed), fallGo: true }));
      await pause(760);
      setAnim((a) => ({ ...a, freezeState: boardWithout(frozen, opts.doomed!), redCells: new Set(), fallCells: null, fallGo: false }));
      await pause(120);
    }

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
    // `reveal:true` DISABLES the transform transition for this frame so the board
    // SNAPS from the contracted scale straight to the new layout at full size — the
    // new positions never bleed onto the still-shrinking board (a cross-browser
    // transition-carryover was letting the new gems scale up in place). `keepHidden`
    // cells stay held back: they get their own entrance beat after.
    setAnim((a) => ({ ...a, freezeState: revealState, shrinking: { ...shr(5, 1), reveal: true }, hiddenCells: new Set(keepHidden), redCells: new Set(), shake: false }));
    await pause(isFinal ? 260 : 420);
    setAnim((a) => ({ ...a, shrinking: null }));

    if (isFinal && !opts?.deferRush) await playRushTitle(revealState);
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
    // a shuffle of NOTHING isn't a moment: when the resolve emptied the board
    // (a clear that also reshuffled the unrevealed hand), the banner would slam
    // over bare hexes — skip the whole beat and let the finish own the screen
    if (![...committed.cells.values()].some((c) => c.tile !== null)) return;
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

    beat("reshuffle: settleOut (zoom out)", { nudged: nudged.length });
    await settleOut(); // reshuffle runs on a zoomed-OUT board
    // word appears, tiles still in old spots
    sfx.reshuffle();
    setAnim((a) => ({ ...a, playing: true, hiddenCells: new Set(keepHidden), flying: [], freezeState: preNudge, banner: "RESHUFFLE", shake: true }));
    beat("reshuffle: banner up, OLD positions shown", { view: "pre-nudge" });
    await pause(1000);
    // now reveal the moved tiles (board contracts to committed); keep the word a beat longer
    setAnim((a) => ({ ...a, freezeState: committed, shake: true }));
    beat("reshuffle: reveal NEW positions", { view: "committed" });
    await pause(450);
    setAnim((a) => ({ ...a, banner: null, shake: false }));
    beat("reshuffle: banner down (done)");
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
    // `remote` = this placement is the OPPONENT's move arriving over the wire; it
    // replays through the identical animation but skips all the local-input gates
    // (turn ownership, the picker, claim taps) and never re-emits.
    // `spectateVersus` = the watcher in a VERSUS match: a bank's gems DISAPPEAR
    // instead of flying to this device's score (the points are the other player's).
    async (cellKey: string, tap?: { x: number; y: number }, remote = false, spectateVersus = false) => {
      try {
      // a tap while the combo picker is open drives the picker, nothing else
      if (!remote && choiceRef.current) { choiceTap(cellKey); return; }
      // VERSUS: a tap on the fresh combo while the claim window is open CLAIMS it
      if (!remote && claimOfferRef.current && stateRef.current.versus) {
        const offerCell = claimOfferRef.current.cellKey;
        if (stateRef.current.activatedCells.includes(cellKey)) {
          sfx.activateTile(0);
          emitLocal({ kind: "claim", cell: offerCell });
          closeClaimOffer();
          setState((s) => claimCluster(s, offerCell));
        }
        return; // the turn is spent either way — other taps do nothing
      }
      if (!remote && busyRef.current) return;
      if (!remote && !myTurn(state)) return; // online: a follower's taps do nothing (spectating)
      if (state.phase !== "playing") return;
      if (!remote && (state.coop?.moved || state.versus?.moved)) return; // TOGETHER: one placement per turn
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
      if (outcome.kind === "bust" && isCoarsePointer() && !online()) {
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
      // ANTI-CHEAT: record the RESOLVED placement (post-rescue-snap cell + the chosen
      // combo index) so a server replay reproduces this exact move.
      record({ kind: "place", cell: cellKey, choice: choiceIdx });
      // the placed tile is SPENT now — the hand count (and the next tile) update
      // at the placement itself; later arrivals land back one by one below.
      // EXCEPT an activation that swaps onto a covered mineral/Dross: that gem
      // returns to the hand, so the count never really changes — updating early
      // would show a one-beat dip to a number that was never true.
      if (!remote && !(outcome.kind === "activate" && outcome.coveredToHand)) hudCommit((s) => ({ hand: s.hand.slice(1) }));

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
            sfxAt(() => sfx.tileToHand(), 200 + i * 70);
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
          await animateShrink(preShrinkA, next.lastResolved.shrunk.mapping, nextCw, next.lastResolved.shrunk.final, undefined, { deferRush: true });
        } else if (next.lastResolved.reshuffled || next.lastResolved.nudged.length > 0) {
          await animateReshuffle(nextCw);
        }
        await animateLateResolution(next); // tiles isolated by the collapse / reshuffle
        if (next.lastResolved.shrunk?.final) await playRushTitle(nextCw);
        await commitFinal(next); // plays COLLAPSE / GLINT RUSH first if the board came down
        setAnim(IDLE); // action + animation done -> zoom back out
        busyRef.current = false;
        // OPTION 3: offer an early bank of the cluster just made — LOCAL player only
        // (a remote replay must never pop the watcher's BANK NOW / claim window).
        if (!remote && next.phase === "playing" && next.activatedCells.includes(cellKey)) {
          openEarlyBankOffer(cellKey);
          // VERSUS: the tap-to-claim window opens alongside (one claim, strictly)
          if (next.versus && !next.versus.claims[next.versus.turn]) {
            openClaimOffer(cellKey);
          }
        }
        return;
      }

      // BANK
      if (outcome.kind === "bank") {
        busyRef.current = true;
        // VERSUS WATCHER: a placement that banks — the points are the OTHER player's,
        // so skip the fly-to-score ceremony. Drop the tile in, light the cluster up
        // one-by-one, then let the gems DISAPPEAR; the collapse still plays, and the
        // final commit carries the (active player's) score, which this device's HUD
        // masks with its own total. The name-tagged log says what they scored.
        if (spectateVersus) {
          const placedV = withTileAt(state, cellKey, tile);
          const committedV = place(state, cellKey, choiceIdx);
          const resV = committedV.lastResolved;
          setAnim({ ...IDLE, playing: true, focused: true, dropCell: cellKey, freezeState: placedV });
          await pause(T.bankHoldGlow);
          const litV = new Set<string>();
          for (let i = 0; i < outcome.bankOrder.length; i++) {
            litV.add(outcome.bankOrder[i]);
            sfx.bankTile(i);
            setAnim((a) => ({ ...a, playing: true, freezeState: placedV, litCells: new Set(litV) }));
            await pause(T.bankLightStep);
          }
          const goneV = new Set<string>([
            ...outcome.bankOrder,
            ...resV.isolatedToScore.map((t) => t.key),
            ...resV.strandToHand.map((t) => t.key),
            ...resV.pairToHand.map((t) => t.key),
          ]);
          setAnim((a) => ({ ...a, playing: true, freezeState: placedV, litCells: new Set(), hiddenCells: goneV, flying: [], comboLineup: null }));
          await pause(300);
          const cwV = withLateTiles(committedV);
          if (resV.shrunk || resV.singularity) await pause(SPECTATE_SYNC_MS); // sync the collapse w/ the active side
          const preShrinkV = await singularityBeat(boardWithout(placedV, goneV), resV);
          if (resV.shrunk) {
            await animateShrink(preShrinkV, resV.shrunk.mapping, cwV, resV.shrunk.final, undefined, { deferRush: true });
          } else if (resV.reshuffled || resV.nudged.length > 0) {
            await animateReshuffle(cwV);
          }
          await animateLateResolution(committedV);
          if (resV.shrunk?.final) await playRushTitle(cwV);
          await commitFinal(committedV);
          setAnim(IDLE);
          busyRef.current = false;
          return;
        }
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

        // Phase B½: THE UNCOVER — a bonus gem buried under one of the tiles this
        // bank just claimed. Its cover leaves the board HERE, so the gem rises
        // here: before the lineup forms and the score plate stamps in, not after
        // the whole ceremony has come and gone. (Gems under tiles that are still
        // standing — an isolated special, a collapse stray — wait for their own
        // exit below, or for commitFinal's net.)
        await uncoverBeat(res.bonusRevealed, new Set(order), placedFrozen);

        // Phase C: THE COMBO LINEUP — the banked tiles fly up and form their
        // combos in rows just under the score (a ghost copy stands in where one
        // tile completed two combos), each row named; they linger a beat so the
        // player reads WHAT they banked, then dive into the score together.
        // Keep the parked multiplier tile present alongside.
        const rows = lineupRows(
          outcome.bankCombos,
          placedFrozen,
          outcome.placedAs != null ? { cell: cellKey, value: outcome.placedAs } : undefined
        );
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
          if (!remote) hudCommit((s) => ({ hand: [...s.hand, ...res.strandToHand.map((t) => t.value as TileVal)] }));
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
          if (!remote) hudCommit((s) => ({ hand: [...s.hand, ...res.pairToHand.map((t) => t.value as TileVal), ...res.buriedToHand.map((t) => t.value as TileVal)] }));
        }

        // …and a gem that was under one of the tiles the ISOLATION passes just
        // flew off gets its beat now, at the same rule: it rises once its cover
        // has actually left. (`cleared` is every cell emptied so far.)
        await uncoverBeat(res.bonusRevealed, cleared);

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
          await animateShrink(preShrinkB, res.shrunk.mapping, cwb, res.shrunk.final, undefined, { deferRush: true });
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
        if (res.shrunk?.final) await playRushTitle(cwb);

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
        // #7 instrumentation (?debug=1): a timestamped timeline of every bust beat,
        // tagged with this device's role + mode, so we can see whether the board
        // reaches its committed positions before the RESHUFFLE beat plays.
        beatStart(`BUST ${frozen.coop ? "coop" : frozen.versus ? "versus" : "solo"}/${remote ? "follower" : "active"}`);

        const placedFrozen = withTileAt(frozen, cellKey, tile);

        // BUST moment — the placed tile drops in, then a red "BUST" stamps in with a
        // shake + cracks the instant you bust, BEFORE anything reshuffles.
        setAnim({ ...IDLE, playing: true, focused: true, dropCell: cellKey, freezeState: placedFrozen });
        await pause(300);
        await settleOut(); // the BUST stamp (and everything after) runs zoomed OUT
        sfx.bust();
        haptic("bust");
        setAnim((a) => ({ ...a, banner: "BUST", shake: true }));
        beat("BUST stamp", { view: "placedFrozen" });
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
        beat("phase A: placed + covered lift to BUSTS");
        await pause(T.bustLift + T.bustFly + floaters.length * T.bustFlyStagger);
        // the heart goes out the moment the busted tile lands in the box — except
        // the LAST life, whose tear-out IS the final-heart beat below
        if (!remote && frozen.livesLeft > 1) hudCommit(() => ({ livesLeft: frozen.livesLeft - 1 }));

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
          [...discardCells].forEach((_, i) => sfxAt(() => sfx.poof(), 130 + i * 70));
          beat("discarded combo falls", { cells: discardCells.size });
          await pause(760);
          // the gems are gone now — remove them from the board so the rest of the
          // bust cleanup (fly-outs, reshuffle) never re-shows them
          setAnim((a) => ({ ...a, freezeState: boardWithout(placedFrozen, discardCells), fallCells: null, fallGo: false, hiddenCells: new Set([cellKey]) }));
        }

        // Compute committed result to know what the bust resolved.
        const committed = place(frozen, cellKey);
        recordMoveTrace(state, committed, cellKey, choiceIdx); // dev play-by-play (?debug=1)
        const bres = committed.lastResolved;
        beat("committed resolved", {
          reshuffled: bres.reshuffled, shrunk: !!bres.shrunk, nudged: bres.nudged.length,
          isoScore: bres.isolatedToScore.length, pairHand: bres.pairToHand.length,
          buriedHand: bres.buriedToHand.length, lateDiscarded: bres.lateDiscarded.length,
          gameOver: committed.phase !== "playing",
        });

        // THE THIRD BUST — the run is over, immediately: the engine skipped the
        // forced tile and the reshuffle. The final heart tears out of the BUSTS
        // box, flies to the centre of the screen and BURSTS; then the end card.
        if (committed.phase !== "playing" && committed.livesLeft <= 0) {
          beat("THIRD BUST — run over (no reshuffle/collapse)");
          beatEnd();
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

        // THE UNCOVER: the bust cell and the forfeited combo have just left the
        // board, so a bonus gem under any of them rises HERE — before the wreckage
        // is cleared away. (A gem the isolation sweeps free later is caught by
        // commitFinal's net, still at its own cell.)
        await uncoverBeat(bres.bonusRevealed, new Set([...frozen.activatedCells, cellKey]));

        // Rule 2: every tile isolated by the bust flies UP to the score (minerals,
        // Core for 500, Glint for 0).
        const isoFly: FlyingTile[] = bres.isolatedToScore.map((t, i) => ({
          id: `iso-${t.key}`, value: t.value as TileVal, fromKey: t.key, to: "score", delay: i * 70,
        }));
        if (isoFly.length > 0) {
          const hide = new Set(bres.isolatedToScore.map((t) => t.key));
          playClearSounds(bres.isolatedToScore);
          setAnim((a) => ({ ...a, hiddenCells: hide, flying: isoFly }));
          beat("isolated → score fly", { n: isoFly.length });
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
          beat("bust → hand fly", { n: bustToHand.length });
          await pause(T.toHandFly + bustToHand.length * 70 + 100);
          if (!remote) hudCommit((s) => ({ hand: [...s.hand, ...bres.pairToHand.map((t) => t.value as TileVal), ...bres.buriedToHand.map((t) => t.value as TileVal)] }));
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
          beat("forced tile drops", { view: "preWithDrop" });
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
          beat("→ animateReshuffle (drift)");
          await animateReshuffle(cw);
        } else {
          beat("(no reshuffle drift)", { shrunk: !!bres.shrunk, reshuffled: bres.reshuffled, nudged: bres.nudged.length });
        }

        // THE WAKE DISCARDS — resolved BEFORE any collapse now. Without a
        // collapse the reshuffle beat above already showed the nudge drift, so
        // the committed view's coordinates match the screen. WITH a collapse the
        // reshuffle beat never played: the player last saw the PRE-nudge board,
        // so the flash and the contraction both run on it. (Pre-applying the
        // nudges here snapped every drifted gem to — mostly — its final spot one
        // frame early, and the collapse then appeared to move nothing.) The
        // discard keys are post-nudge, so pull each back to where the player
        // still sees that tile.
        let collapseBase = preWithDrop;
        // where the player SEES each doomed tile: on a collapse turn the nudge
        // drift is still invisible, so pull post-nudge discard keys back to
        // pre-nudge; without a collapse the reshuffle beat above already showed
        // the drift, so the keys match the screen as-is
        const seenKeyOf = (k: string) => (bres.shrunk ? (bres.nudged.find((m) => m.to === k)?.from ?? k) : k);
        const doomedKeys = new Set(bres.lateDiscarded.map((t) => seenKeyOf(t.key)));
        if (bres.lateDiscarded.length > 0 && !bres.shrunk) {
          // NO collapse this turn: the wake discards get their own beat on the
          // settled (post-drift) board. On a collapse turn they ride the
          // collapse instead — banner, flash, fall, contraction — inside
          // animateShrink, so nothing ever exits before the collapse announces.
          setAnim((a) => ({ ...a, playing: true, freezeState: cw, flying: [], redCells: doomedKeys, hiddenCells: new Set() }));
          beat("wake discards flash RED", { n: doomedKeys.size });
          await pause(520);
          // …then they DROP off the board, exactly like a forfeited activated
          // combo — they don't bank, so they share its exit. Never a silent poof.
          [...doomedKeys].forEach((_, i) => sfxAt(() => sfx.poof(), 130 + i * 70));
          setAnim((a) => ({ ...a, redCells: new Set(), fallCells: doomedKeys, fallGo: true }));
          await pause(760);
          collapseBase = boardWithout(collapseBase, doomedKeys);
          setAnim((a) => ({ ...a, freezeState: boardWithout(cw, doomedKeys), fallCells: null, fallGo: false }));
          await pause(100);
        }

        // THE ABYSS COLLAPSES — the order the player reads: SINGULARITY wedges,
        // the COLLAPSE banner, the doomed wake tiles falling into the abyss,
        // the contraction, the reveal (nudges + remap in one move), the strays
        // the collapse cut off flying to score/hand, and GLINT RUSH last.
        {
          const preShrinkC = await singularityBeat(collapseBase, bres);
          if (bres.shrunk) {
            beat("→ animateShrink (collapse)", { doomed: doomedKeys.size });
            await animateShrink(preShrinkC, bres.shrunk.mapping, cw, bres.shrunk.final, undefined, { doomed: doomedKeys, deferRush: true });
          }
        }
        await animateLateResolution(committed);
        if (bres.shrunk?.final) await playRushTitle(cw);

        beat("commitFinal (final state on screen)", { view: "committed" });
        await commitFinal(committed); // plays COLLAPSE / GLINT RUSH first if the board came down
        setAnim(IDLE);
        beat("DONE — setAnim(IDLE)");
        beatEnd();
        busyRef.current = false;
        return;
      }
      }; // end resolveMove

      // AMBIGUITY GATE — when the placement could resolve more than one way,
      // stage the pre-select-and-confirm picker instead of resolving now: the
      // best option lights blue, the alternatives amber; it auto-confirms after
      // the choice window (gameOptions.choiceWindowMs) unless the player switches
      // (which restarts the window)
      // or taps the blue to commit instantly. Never appears for a single
      // resolution, a bust, a Dross or a wild Nebulite. When the player has
      // turned the combo picker OFF, skip staging entirely and auto-resolve the
      // best option (index 0) — the very same option the picker pre-selects.
      // online: the picker is skipped entirely (both devices must resolve the
      // SAME way, so we always take index 0 — the pick's own default choice)
      if (gameOptions.comboPicker && !suppressPickerRef.current && outcome.kind !== "bust" && !online()) {
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

      // online: emit the placement (covers activate / bank / bust alike) before it
      // resolves locally — the opponent replays the same cell through the engine
      emitLocal({ kind: "place", cell: cellKey });
      await resolveMove(0, outcome);
      } catch (e) {
        // a restart mid-animation aborted this sequence — the new game owns the screen
        if (e !== ABORT) throw e;
      }
    },
    [state]
  );
  // latest onPlace, so the remote-move queue always replays through the current
  // render's closure (fresh state) after each animated step commits.
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  // ONLINE: boot a networked match identically on both devices — the match seed
  // verbatim (via `exact`, which also forces bonus gems off), the shared shape,
  // and the seat mode. `entry` is this device's slot; `onLocal` relays each
  // committed local move to the transport.
  const startOnline = useCallback((opts: { seed: number; mode: MatchMode; shape: BoardShape; names: [string, string]; entry: Entry; onLocal: (m: NetMove) => void; catchUp?: NetMove[] }) => {
    const modeOpt = opts.mode === "coop" ? { coop: { names: opts.names } } : { versus: { names: opts.names } };
    // RESUME: `start` replays the whole history in one shot and loads the board in
    // its current state — no opening ceremony, no fresh-board flash.
    start({ exact: true, seed: opts.seed, side: 6, shape: opts.shape, ...modeOpt, resumeMoves: opts.catchUp });
    netRef.current = { entry: opts.entry, onLocal: opts.onLocal }; // arm AFTER start (which clears it)
  }, [start]);

  // ONLINE: opponent moves arrive over the wire and are ANIMATED on the watcher's
  // device through the SAME choreography the active player saw — a place replays
  // through onPlace (activation lights up cell-by-cell, banks fly, the board
  // collapses on BOTH sides at once), an explicit BANK NOW replays the bank
  // animation. They queue and play strictly one at a time, so the watcher follows
  // the play and the end-of-game summary waits for the animation to finish (rather
  // than snapping to the result before the active side has resolved).
  const remoteQueueRef = useRef<NetMove[]>([]);
  const remotePumpingRef = useRef(false);
  const pumpRemote = useCallback(async () => {
    if (remotePumpingRef.current) return;
    remotePumpingRef.current = true;
    applyingRemoteRef.current = true; // suppress re-emit for the whole drain
    try {
      while (remoteQueueRef.current.length > 0) {
        const move = remoteQueueRef.current.shift()!;
        if (stateRef.current.phase !== "playing") break; // game already ended locally
        const spectateVersus = !!stateRef.current.versus; // watcher in a versus match
        if (move.kind === "place") {
          await onPlaceRef.current(move.cell!, undefined, true, spectateVersus);
        } else if (move.kind === "bank") {
          await runBankAnimationRef.current(stateRef.current, move.cell!, spectateVersus);
        } else {
          // pass / claim / cashout / rotate / swap — a pure state step, no board anim
          setState((s) => applyNetMove(s, move));
        }
        // yield so React flushes this move's commit before the next one reads
        // stateRef/onPlaceRef (also paces the turn-label / hand update)
        await pause(70);
      }
      // SYNC (#7): in versus the watcher's quick replay reaches game-over sooner
      // than the active player's full animation — hold the end card a beat so the
      // two summaries appear roughly together. (Co-op replays full-speed already.)
      if (stateRef.current.phase !== "playing" && stateRef.current.versus) {
        setSettling(true);
        await pause(SPECTATE_SYNC_MS);
        setSettling(false);
      }
    } catch (e) {
      if (e !== ABORT) throw e;
    } finally {
      applyingRemoteRef.current = false;
      remotePumpingRef.current = false;
    }
  }, []);
  const applyRemoteMove = useCallback((move: NetMove) => {
    remoteQueueRef.current.push(move);
    void pumpRemote();
  }, [pumpRemote]);

  const isFollower = netRef.current ? !isMyTurn(state, netRef.current.entry) : false;

  return {
    state, anim, settling, onPlace, start, setMapper, earlyBankOffer, bankNow, swapHand, rotateHand, cashOutNow, handRevealed, runSeq, setBoardHeld,
    getLastStart: () => lastStartRef.current,
    // pass emits online (only the active device) so the opponent's turn begins
    coopPass: () => { const s = stateRef.current; if (!myTurn(s)) return; emitLocal({ kind: "pass" }); setState((st) => coopEndTurn(st)); },
    versusPass: () => { const s = stateRef.current; if (!myTurn(s)) return; emitLocal({ kind: "pass" }); setState((st) => versusEndTurn(st)); },
    claimOffer,
    startOnline, applyRemoteMove, respondCashOut,
    // inject a system log line (async step-away / return) — into the log + it floats
    injectLog: (text: string, kind: "info" | "bust" = "info") =>
      setState((s) => (s.phase !== "playing" ? s : { ...s, log: [{ text, kind, sticky: false }, ...s.log].slice(0, 40) })),
    // ANTI-CHEAT: arm move recording for a daily run; read the stream at run-end
    startRecording: () => { recordRef.current = []; },
    getRecordedMoves: (): NetMove[] => recordRef.current ?? [],
    online: netRef.current !== null,
    isFollower,
  };
}

// ---- helpers ----

// Build the COMBO LINEUP rows from the bank's combo decomposition: resolve each
// cell to the tile shown on the frozen board, order run rows by value (so a
// Drift reads 1-2-3-4), and mark a cell's SECOND appearance as a ghost — a
// visual aid showing the tile also completed that combo; it is not banked twice.
export function lineupRows(
  combos: { name: string; cells: string[]; run: boolean }[],
  frozen: GameState,
  // the value a just-placed WILDCARD counted as (outcome.placedAs) — the frozen
  // board still shows the raw Zenith/Nebulite there, which would sort a Drift
  // row as 10/7 and shove the gem to the end instead of its true slot
  placedAs?: { cell: string; value: number }
): { name: string; tiles: { cell: string | null; value: TileVal; ghost: boolean; jokerValue?: number }[] }[] {
  const seen = new Set<string>();
  const effVal = (k: string): number =>
    placedAs && k === placedAs.cell ? placedAs.value : ((frozen.cells.get(k)?.tile ?? 0) as number);
  return combos.map((c) => {
    const cells = c.run ? [...c.cells].sort((a, b) => effVal(a) - effVal(b)) : c.cells;
    // a joker Core in the combo lines up as the mineral it mirrored (still in
    // its purple ring) — the mirror must never silently revert mid-ceremony.
    // Only true minerals qualify (a Zenith's 10 must never be "the mineral").
    const mineral = c.cells.map(effVal).find((t) => t >= 1 && t <= 6);
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

// (isCoarsePointer — the thick-thumbs rescue gate — now lives in theme.ts,
// shared with App/Tutorial/share instead of four copies.)

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
  tiles.forEach((t, i) => sfxAt(() => (t.value === GLINT ? sfx.gainDross() : sfx.tileToHand()), i * 70));
}
// A clear sound for each special tile (Dross / Nebulite) resolving to the score.
function playClearSounds(tiles: { value: number }[]) {
  tiles.forEach((t, i) => {
    if (t.value === GLINT || t.value === CORE) sfxAt(() => sfx.clearSpecial(t.value), i * 70);
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
