import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT, DEFAULT_CONTENT } from "../content/content";
import { Backdrop } from "./Backdrop";
import { GameState, TileVal, newGame, LogEntry, GLINT, cashOutValue } from "../game/engine";
import { Board } from "./Board";
import { HUD, Footer, TileLegend, ComboLegend, LogPanel } from "./Panels";
import { FlyingOverlay } from "./FlyingOverlay";
import { FlyingTile, Mapper, LINEUP_T } from "./useNebuliteGame";
import { gameOptions } from "./settings";
import { ComboLineupOverlay } from "./ComboLineupOverlay";
import { RushOverlay } from "./RushOverlay";
import {
  BigBanner,
  BankedPlate,
  FloatingToast,
  LogDrawer,
  BannerKind,
  FOOTER_POKE,
  boardPanel,
  boardGlow,
  boardCastShadow,
  toastBand,
  hudBankOverlay,
  sheenClip,
  sheenBar,
} from "./gameChrome";
import { CashOutButton, CashOutCeremony } from "./CashOut";
import { TileGem } from "./TileGem";
import { GameHeader } from "./GameHeader";
import { sfx } from "../audio/sfx";

/**
 * THE SCRIPTED TUTORIAL LEVEL (Level 0) — design_handoff_glint_tutorial_level.
 *
 * A fully scripted, interactive walkthrough on the smallest (37-cell) board. The
 * screen is IDENTICAL to the real game screen — top bar, HUD, tilted board, footer —
 * so the player learns the game AND the UI at once. The only tutorial-specific
 * element is the violet text panel under the footer. One `step` integer (0–16)
 * drives everything, with three gate types:
 *   - button-gated  (Next / Continue in the text panel; the board is inert)
 *   - forced placement (exactly ONE pulsing target cell is tappable)
 *   - free placement (anywhere on the board; a non-connecting pick busts + retries)
 * Placements RESOLVE like the real game: the placed gem pops in, a replaced tile
 * flies to the hand (the hand advances immediately), activation rings reveal one
 * by one, and banked tiles light up one by one before flying to the score.
 * The final Continue hands off into a normal Level-0 run (App starts the real
 * engine game) — the dynamic playthrough that closes the tutorial.
 */

// mineral values by name, for readable board data
const DG = 1 as TileVal; // Duneglass (1)
const VG = 2 as TileVal; // Vigilite (2)
const CH = 3 as TileVal; // Chromite (3)
const VD = 4 as TileVal; // Verdite (4)
const UM = 5 as TileVal; // Umbrite (5)
const NU = 6 as TileVal; // Nuracite (6)

type ScriptBoard = Record<string, TileVal | null>;

// Board A — the opener: 3 connected Chromite (0,-2 · 0,-1 · 1,-2), an Umbrite pair
// (0,1 · 1,0) one tile away, the Nuracite multiplier between them (0,0), and the
// Duneglass Quad target at -1,-1.
const BOARD_A: ScriptBoard = {
  "-3,0": VD, "-3,1": DG, "-3,2": VG, "-3,3": UM,
  "-2,-1": NU, "-2,0": VG, "-2,1": VD, "-2,2": DG, "-2,3": CH,
  "-1,-2": VG, "-1,-1": DG, "-1,0": VD, "-1,1": DG, "-1,2": VG, "-1,3": VD,
  "0,-3": DG, "0,-2": CH, "0,-1": CH, "0,0": NU, "0,1": UM, "0,2": VD, "0,3": DG,
  "1,-3": UM, "1,-2": CH, "1,-1": DG, "1,0": UM, "1,1": VG, "1,2": DG,
  "2,-3": VD, "2,-2": DG, "2,-1": VG, "2,0": NU, "2,1": UM,
  "3,-3": VG, "3,-2": UM, "3,-1": DG, "3,0": VD,
};

// Board B — the combos lesson: a Drift 1→2→3→4 down the -2 column (its Duneglass
// end adjacent to two more Duneglass for the Accord), and a Full Drift 1–6 down
// the 1 column. 0,-1 is Umbrite (NOT a 2) so the Accord's placed Duneglass can't
// also start an unintended run through the Full Drift column; 3,0 is Chromite
// (NOT a 2) so the Full Drift placement has exactly ONE 1–6 chain — no second
// tail through 2,0 → 3,0 → 2,1 that the real engine would offer as a choice.
const BOARD_B: ScriptBoard = {
  "1,-3": DG, "1,-2": VG, "1,-1": CH, "1,0": VD, "1,1": UM, "1,2": NU,
  "-2,-1": NU, "-2,0": DG, "-2,1": VG, "-2,2": CH, "-2,3": VD,
  "-1,0": VG, "0,0": DG,
  "-3,0": VG, "-3,1": CH, "-3,2": DG, "-3,3": UM,
  "-1,-2": CH, "-1,-1": VD, "-1,1": UM, "-1,2": VG, "-1,3": NU,
  "0,-3": UM, "0,-2": VD, "0,-1": UM, "0,1": CH, "0,2": VG, "0,3": VD,
  "2,-3": DG, "2,-2": UM, "2,-1": VD, "2,0": CH, "2,1": DG,
  "3,-3": VD, "3,-2": CH, "3,-1": UM, "3,0": CH,
};

// Board C — the banking / busting sandbox: only a central cluster remains.
// After the free bank clears the Vigilite, the leftovers (Umbrite · Nuracite ·
// Duneglass · Chromite) are ALL different values — so however the post-bust
// reshuffle scatters them, no matching pair can ever sit there demanding to be
// resolved by the isolation rules just taught.
const BOARD_C: ScriptBoard = {
  "0,-1": VG, "1,-1": VG, "0,0": VG, "-1,0": VG,
  "1,0": UM, "0,1": NU, "-1,1": DG,
  "-1,2": CH,
};

// Board D — CLEARING part 1: a Nuracite surrounded by five Vigilite with ONE gap
// (the highlighted target). Completing the ring banks the Hex and ISOLATES the
// Nuracite, which then banks at face value.
const BOARD_D: ScriptBoard = {
  "0,0": NU,
  "1,0": VG, "1,-1": VG, "0,-1": VG, "-1,0": VG, "-1,1": VG,
};

// Board E — CLEARING part 2: a Dross fully ringed by Duneglass. Any Duneglass
// (or a gap touching one) completes the combo; the isolated Dross clears for
// nothing — it's worthless gold.
const BOARD_E: ScriptBoard = {
  "0,0": GLINT as TileVal,
  "1,0": DG, "1,-1": DG, "0,-1": DG, "-1,0": DG, "-1,1": DG, "0,1": DG,
};

// Board P — the COMBOS Pentad lesson: a straight row of Umbrite split by one
// Verdite (UM UM [VD] UM UM). Placing an Umbrite on the Verdite spot makes a
// Pentad (5); a 6th Umbrite in any gap touching it becomes a Hex and auto-banks.
// Two SOLO Umbrite sit apart so "the others are solo".
const BOARD_P: ScriptBoard = {
  "0,-3": DG, "1,-3": VG, "2,-3": CH, "3,-3": UM,
  "-1,-2": VG, "0,-2": CH, "1,-2": VD, "2,-2": DG, "3,-2": VG,
  "-2,-1": CH, "-1,-1": VG, "2,-1": CH, "3,-1": DG,
  "-3,0": VG, "-2,0": UM, "-1,0": UM, "0,0": VD, "1,0": UM, "2,0": UM, "3,0": DG,
  "-3,1": CH, "-2,1": DG, "1,1": VG, "2,1": CH,
  "-3,2": VG, "-2,2": CH, "-1,2": DG, "0,2": VD, "1,2": VG,
  "-3,3": UM, "-2,3": VG, "-1,3": CH, "0,3": DG,
};
// the Pentad's 5 cells, ordered from the placed centre outward (reveal order)
const PENTAD = ["0,0", "1,0", "-1,0", "2,0", "-2,0"];

// Board PR — the CLEARING pair-isolation lesson: an activated Drift (down the -1
// column) beside a Chromite pair, itself touching a Nuracite pair. Dropping a
// Chromite next to the pair isolates the two Nuracite — one banks, one to hand.
const BOARD_PR: ScriptBoard = {
  "-1,0": DG, "-1,1": VG, "-1,2": CH, "-1,3": VD, // the activated Drift (1→2→3→4)
  "0,-2": CH, "0,-1": CH, // the Chromite pair (moved up one; its old bottom spot is now a Nuracite)
  "0,0": NU, "1,-1": NU, "1,0": NU, // a TRIANGLE of Nuracite — covering either of the two that touch the pair leaves the other two isolated as a PAIR
};
const PR_DRIFT = ["-1,0", "-1,1", "-1,2", "-1,3"];
const PR_CH = ["0,-2", "0,-1"]; // the Chromite pair the cover completes into a Trips
const PR_NU_TRI = ["0,0", "1,-1", "1,0"]; // the Nuracite triangle
const PR_ELIGIBLE = ["0,0", "1,-1"]; // the two Nuracite that TOUCH the Chromite pair — the only legal covers ("1,0" doesn't touch it)

// Board X — the COMBO CHOICE lesson: the placed Nuracite (0,0 target) can end
// TWO different 3-4-5-6 Drifts that SHARE the Umbrite at 0,-1 — sharing a tile
// is exactly what forces a pick. Chain A runs up-left, chain B up-right. ONLY
// the two options are on the board — any extra tile would be one the rules say
// should eventually clear.
const BOARD_X: ScriptBoard = {
  "0,-1": UM, // the shared 5
  "-1,-1": VD, "-2,-1": CH, // chain A: 4, 3
  "1,-2": VD, "2,-3": CH, // chain B: 4, 3
};
// The chapter banners are CMS copy (Admin › Tutorial › Segment banners); a
// publish made before the field shipped falls back to the bundled names.
const SEGMENTS = CONTENT.tutorialLevel.segments ?? DEFAULT_CONTENT.tutorialLevel.segments;

const CHIP_DRAIN_MS = 2000; // the chip drain — matches the MEDIUM picker window
const CHOICE_A = ["0,0", "0,-1", "-1,-1", "-2,-1"]; // the engine's default pick
const CHOICE_B = ["0,0", "0,-1", "1,-2", "2,-3"];

// the ring around the centre cell, ordered from the CLEARING-1 gap outward
const CLEAR_RING = ["0,1", "1,0", "1,-1", "0,-1", "-1,0", "-1,1"];

// focus zoom — the same lean-in the real game plays on every action (App.tsx)
const COARSE_POINTER = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const ZOOM_BASE = COARSE_POINTER ? 1.0 : 1.05;
const ZOOM_IN = COARSE_POINTER ? 1.28 : 1.18;

// combo cell lists, ordered from the placed tile outward (the reveal order)
const QUAD = ["-1,-1", "0,-1", "0,-2", "1,-2"];
const CONVERGENCE = ["0,0", "0,1", "1,0", "0,-1", "0,-2", "-1,-1", "1,-2"];
const DRIFT = ["-2,3", "-2,2", "-2,1", "-2,0"];
const ACCORD = ["-1,0", "0,0", "-2,0", "-2,1", "-2,2", "-2,3"];
const FULL_DRIFT = ["1,2", "1,1", "1,0", "1,-1", "1,-2", "1,-3"];

const COMBO_NAME: Record<number, string> = { 2: "Echo", 3: "Trips", 4: "Quad", 5: "Pentad", 6: "Hex" };
const COMBO_BASE: Record<number, number> = { 2: 300, 3: 300, 4: 400, 5: 500, 6: 600 };

// step texts — CMS content (seeded verbatim from the handoff script); edited
// from the admin page under TUTORIAL LEVEL. The script's step indices are only
// meaningful against THIS build's step count — published content from an older
// build (different count) would misalign, so it falls back to the bundle.
const TEXTS =
  CONTENT.tutorialLevel.steps.length === DEFAULT_CONTENT.tutorialLevel.steps.length
    ? CONTENT.tutorialLevel.steps
    : DEFAULT_CONTENT.tutorialLevel.steps;

// which steps show the panel button, and what it reads as
const GATE_LABEL: Record<number, string> = { 0: "Next", 2: "Next", 3: "Next", 5: "Next", 8: "Next", 11: "Next", 13: "Next", 19: "Next", 22: "Next", 25: "Continue" };

type BankState = "hidden" | "disabled" | "armed";


export function TutorialLevel({
  muted,
  onToggleMute,
  onExit,
  onHelp,
  onSettings,
  onInfo,
  onComplete,
  nebulite,
  onNebuliteClick,
}: {
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onInfo: () => void;
  onComplete: () => void;
  nebulite: number;
  onNebuliteClick?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [board, setBoard] = useState<ScriptBoard>(BOARD_A);
  const [hand, setHand] = useState<TileVal>(CH);
  // 10 = the CLEARING segment's two extra placements + the same 8-count journey
  // through COMBOS/BANKING the script always had
  const [upNext, setUpNext] = useState(10);
  const [act, setAct] = useState<string[]>([]);
  const [actReveal, setActReveal] = useState<Set<string>>(() => new Set());
  const [hint, setHint] = useState<Set<string> | undefined>(undefined);
  const [red, setRed] = useState<Set<string>>(() => new Set()); // Rule-1 overflow tiles (red danger ring)
  const [target, setTarget] = useState<string | null>(null);
  const [chips, setChips] = useState<Record<string, number> | undefined>(undefined);
  const [dropCell, setDropCell] = useState<string | undefined>(undefined);
  const [inertCell, setInertCell] = useState<string | null>(null);
  // wrong-click feedback: a 3s dark veil with a hole around where to click
  const [spot, setSpot] = useState<{ x: number; y: number; rx: number; ry: number; id: number } | null>(null);
  // the slow replaced-tile → hand flight (rises, lingers above UP NEXT, sinks in)
  const [handFlight, setHandFlight] = useState<{ id: number; value: TileVal; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  // the covered multiplier tile parked beside the score during a bank (×N label)
  const [multLabel, setMultLabel] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [freeBanks, setFreeBanks] = useState(3);
  const [lives, setLives] = useState(3);
  const [bank, setBank] = useState<BankState>("hidden");
  const [banner, setBanner] = useState<{ text: string; kind: BannerKind } | null>(null);
  const [bankedPlate, setBankedPlate] = useState<string | null>(null);
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [flying, setFlying] = useState<FlyingTile[]>([]);
  const [boardFx, setBoardFx] = useState<"none" | "clear" | "drop">("none");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  // focus zoom: lean in while an action plays, settle back out when it resolves
  const [focused, setFocused] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([{ text: CONTENT.tutorialLevel.intro, kind: "info" }]);
  const [toast, setToast] = useState<{ id: number; kind: LogEntry["kind"]; text: string } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  // the ending: GLINT RUSH flash, the shared Cash Out button + ceremony
  const [rush, setRush] = useState(false);
  const [cashOut, setCashOut] = useState<"hidden" | "armed">("hidden");
  const [cashConfirm, setCashConfirm] = useState(false);
  const [cashedOut, setCashedOut] = useState(false); // CONFIRM spent the hand
  // COMBO CHOICE lesson (steps 14-15): which Drift is picked, whether the
  // player has switched once (required before confirming), and the countdown
  // chip's anchor cell. The chip plays the real 1.6s drain then disappears —
  // the player SEES the timer UI, but here it never commits anything. Each
  // show/switch bumps chipRun so the drain restarts (and a stale auto-hide
  // from a previous run can't clip the new one).
  const [choicePick, setChoicePick] = useState<"A" | "B">("A");
  const [grey, setGrey] = useState<Set<string> | undefined>(undefined);
  const [choiceChip, setChoiceChip] = useState<string | null>(null);
  const [chipRun, setChipRun] = useState(0);
  const chipRunRef = useRef(0);
  const choiceSwitchedRef = useRef(false);
  /** Show (or restart) the chip at a cell: run the drain, then hide. */
  const runChoiceChip = (key: string) => {
    const run = ++chipRunRef.current;
    setChoiceChip(key);
    setChipRun(run);
    after(CHIP_DRAIN_MS + 220, () => {
      if (chipRunRef.current === run) setChoiceChip(null);
    });
  };
  // a consumed choice tap must not ALSO fire the wrong-click veil (the board
  // click bubbles to onBoardMiss right after onCell)
  const missMuteRef = useRef(false);

  // COMBO LINEUP — the banked tiles form named combo rows under the score (the
  // same moment as the real game; see ComboLineupOverlay)
  const [lineup, setLineup] = useState<{
    rows: { name: string; tiles: { cell: string | null; value: TileVal; ghost: boolean }[] }[];
    chain: string | null;
  } | null>(null);
  // the persistent instruction line ("Tap the Next button…" / "Place your tile…"):
  // shown 2s after a step becomes idle, and it STAYS until the player acts
  const [instruction, setInstruction] = useState<string | null>(null);

  // the free-bank combo from the BANKING free placement (cells + multiplier)
  const comboRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const flyIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const spotIdRef = useRef(0);
  const arrowRef = useRef<HTMLButtonElement | null>(null);
  const bankBoxRef = useRef<HTMLDivElement | null>(null);
  const cashBtnRef = useRef<HTMLButtonElement | null>(null);
  const upNextRef = useRef<HTMLDivElement | null>(null);
  const multValRef = useRef<TileVal | null>(null); // the parked multiplier's value
  const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);

  const timersRef = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const mapperRef = useRef<Mapper | null>(null);
  const handleMapper = useCallback((fn: Mapper) => { mapperRef.current = fn; }, []);
  const scoreRef = useRef<HTMLDivElement | null>(null);
  const bustRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const banksRef = useRef<HTMLDivElement | null>(null);

  const setBusyAll = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
    if (!v) setFocused(false); // action fully resolved → settle back out (game IDLE)
  };

  const say = useCallback((kind: LogEntry["kind"], text: string) => {
    setLog((l) => [{ text, kind }, ...l]);
    setToast({ id: ++toastIdRef.current, kind, text });
  }, []);

  // ---- the derived GameState the real HUD / Board / Footer render ----
  const template = useMemo(() => newGame({ side: 4, seed: 42, nebulites: 0, dross: 0 }), []);
  const gs: GameState = useMemo(() => {
    const cells = new Map(template.cells);
    for (const [k, c] of template.cells) cells.set(k, { ...c, tile: board[k] ?? null, inert: k === inertCell, buried: null });
    return {
      ...template,
      cells,
      activatedCells: act,
      activatedCombos: [],
      score,
      freeBanksLeft: freeBanks,
      livesLeft: lives,
      banks: 3 - freeBanks,
      busts: 3 - lives,
      // after the cash-out CONFIRM the hand is spent — it was converted to points
      hand: cashedOut ? [] : [hand, ...(Array(upNext).fill(DG) as TileVal[])],
      phase: "playing" as const,
      deathMatch: false,
      log,
    };
  }, [template, board, act, score, freeBanks, lives, hand, upNext, log, inertCell, cashedOut]);

  // ---- scripted primitives ----

  /** Place `gem` on `key`, resolving like the real game: the placed gem pops in,
   *  the hand advances to `nextHand` immediately, and — when the covered tile is
   *  NOT spent as a multiplier — the replaced tile flies to the hand and joins the
   *  stack (one revealed + one returned = UP NEXT unchanged). */
  const place = (key: string, gem: TileVal, nextHand: TileVal, replacedToHand: boolean) => {
    // SAFETY NET: the script gates input while sequences play, so any flight
    // still on screen when a NEW placement starts is a stale leftover (an
    // animation that never completed) — finish it instantly instead of letting
    // it linger over the rest of the walkthrough.
    setFlying([]);
    setHandFlight(null);
    // a correct placement must never trigger the wrong-click veil: the board click
    // bubbles to onBoardMiss right after this (and setTarget(null) below is async, so
    // the stale target would otherwise spotlight the cell we just placed on).
    missMuteRef.current = true;
    const covered = board[key] ?? null;
    setBoard((b) => ({ ...b, [key]: gem }));
    setDropCell(key);
    setFocused(true); // lean in on the action, exactly like the game
    setTarget(null);
    setHint(undefined);
    setHand(nextHand);
    if (replacedToHand && covered != null) {
      // slow, legible flight: the replaced tile rises off the cell, drifts to a
      // hover point above UP NEXT, lingers a beat, then sinks into the stack
      after(160, () => {
        const from = mapperRef.current?.(key);
        const un = upNextRef.current?.getBoundingClientRect();
        if (from && un) {
          setHandFlight({
            id: ++flyIdRef.current,
            value: covered,
            from,
            to: { x: un.left + un.width / 2, y: un.top + un.height * 0.3 },
          });
        }
      });
    } else {
      setUpNext((n) => Math.max(0, n - 1));
    }
    return covered;
  };

  /** Park the covered tile beside the score as the bank's ×N multiplier (game
   *  recipe: it lifts out at placement and dives into the score when the bank
   *  completes). Only when it actually multiplies (value > 1). */
  const parkMultiplier = (key: string, covered: TileVal | null) => {
    if (covered == null || (covered as number) <= 1) return;
    multValRef.current = covered;
    setMultLabel(`×${covered}`);
    setFlying((f) => [...f, { id: `tut-mult-${++flyIdRef.current}`, value: covered, fromKey: key, to: "multiplier" as const, delay: 0 }]);
  };

  /** Reveal the combo's white rings one by one from the placed tile outward,
   *  with the game's per-tile activation blips. Rings that are ALREADY lit stay
   *  lit throughout — like the real game, an earlier activated combo never
   *  loses its white outline; only the fresh cells ripple on. */
  const revealActivation = (cellsInOrder: string[], then: () => void) => {
    setBusyAll(true);
    const already = new Set([...actReveal].filter((k) => act.includes(k)));
    setAct(Array.from(new Set([...act, ...cellsInOrder])));
    setActReveal(new Set(already));
    const fresh = cellsInOrder.filter((k) => !already.has(k));
    fresh.forEach((k, i) =>
      after(150 + i * 110, () => {
        setActReveal((s) => new Set([...s, k]));
        sfx.activateTile(i);
      })
    );
    after(150 + fresh.length * 110 + 260, then); // per-tile + hold — the game's T.activateStep / T.activateHold
  };

  /** Gold rings light one by one → the COMBO LINEUP forms under the score (when
   *  `combos` names the rows — same moment as the real game: each combo lines up
   *  with its name, ghost copies for shared tiles, lingers, dives in) → commit,
   *  score, toast. Without `combos` the tiles fly straight to the score. */
  const bankOut = (
    keys: string[],
    pts: number,
    plate: string,
    toastText: string,
    then: () => void,
    combos?: { specs: { name: string; cells: string[]; run?: boolean }[]; chain?: string | null }
  ) => {
    setBusyAll(true);
    setBankedPlate(plate);
    // the game's bank beat: hold the white activated glow, THEN tick the gold on
    keys.forEach((k, i) =>
      after(400 + i * 180, () => {
        setLit((s) => new Set([...s, k]));
        sfx.bankTile(i);
      })
    );
    after(400 + keys.length * 180 + 120, () => {
      const b = boardRef.current;
      if (combos) {
        // COMBO LINEUP — build the rows (run rows ordered by value; a cell's
        // second appearance becomes a ghost) and let the shared overlay play.
        const seen = new Set<string>();
        const rows = combos.specs.map((c) => {
          const cells = c.run
            ? [...c.cells].sort((x, y) => ((b[x] ?? 0) as number) - ((b[y] ?? 0) as number))
            : c.cells;
          return {
            name: c.name,
            tiles: cells.map((k) => {
              const ghost = seen.has(k);
              seen.add(k);
              return { cell: k, value: (b[k] ?? DG) as TileVal, ghost };
            }),
          };
        });
        const n = rows.reduce((s, r) => s + r.tiles.length, 0);
        setHidden(new Set(keys));
        setLit(new Set());
        setLineup({ rows, chain: combos.chain ?? null });
        after(LINEUP_T.fly + n * LINEUP_T.stagger + LINEUP_T.linger, () => sfx.bankScore());
        after(LINEUP_T.fly + n * LINEUP_T.stagger + LINEUP_T.linger + LINEUP_T.dive + n * LINEUP_T.diveStagger + 150, () => {
          setLineup(null);
          commitBank();
        });
        return;
      }
      setFlying((f) => [
        ...f,
        ...keys.map((k, i) => ({
          id: `tut-fly-${++flyIdRef.current}`,
          value: (b[k] ?? DG) as TileVal,
          fromKey: k,
          to: "score" as const,
          delay: i * 55,
        })),
      ]);
      setHidden(new Set(keys));
      setLit(new Set());
      sfx.bankScore();
      after(820, commitBank);
      function commitBank() {
        setBoard((prev) => {
          const nb = { ...prev };
          keys.forEach((k) => { nb[k] = null; });
          return nb;
        });
        // the parked multiplier tile dives into the score last (game recipe)
        const mv = multValRef.current;
        if (mv != null) {
          multValRef.current = null;
          const sr = scoreRef.current?.getBoundingClientRect();
          setFlying([
            {
              id: `tut-multin-${++flyIdRef.current}`,
              value: mv,
              fromKey: null,
              fromXY: sr ? { x: sr.left + sr.width / 2 - 70, y: sr.top + sr.height / 2 } : undefined,
              to: "score" as const,
              delay: 0,
            },
          ]);
          after(800, () => {
            setFlying([]);
            setMultLabel(null);
          });
        } else {
          setFlying([]);
        }
        setHidden(new Set());
        setAct([]);
        setActReveal(new Set());
        setBankedPlate(null);
        setScore((v) => v + pts);
        say("bank", toastText);
        setBusyAll(false);
        then();
      }
    });
  };

  /** ISOLATION resolution (the CLEARING segment): the surrounded tile lifts off
   *  the board and parks beside the score (with an optional value tag), holds
   *  there a beat, then either dives INTO the score (a gem banking at face
   *  value) or poofs away (worthless Dross). */
  const isolateToScore = (
    key: string,
    value: TileVal,
    label: string | null,
    holdMs: number,
    pts: number,
    toastKind: LogEntry["kind"],
    toastText: string,
    end: "score" | "vanish",
    then: () => void,
    // fires the instant the isolated tile animates off its cell (the cell is now
    // empty) — used to reveal a gem buried underneath the moment it clears, the
    // way the live game does, rather than waiting for the park/poof to finish.
    onVacate?: () => void
  ) => {
    setBusyAll(true);
    setHidden(new Set([key]));
    setFlying([{ id: `tut-iso-${++flyIdRef.current}`, value, fromKey: key, to: "multiplier" as const, delay: 0 }]);
    if (label) setMultLabel(label);
    after(520, () => {
      setBoard((b) => ({ ...b, [key]: null }));
      setHidden(new Set());
      onVacate?.();
    });
    after(700 + holdMs, () => {
      if (end === "score") {
        const sr = scoreRef.current?.getBoundingClientRect();
        setFlying([
          {
            id: `tut-isoin-${++flyIdRef.current}`,
            value,
            fromKey: null,
            fromXY: sr ? { x: sr.left + sr.width / 2 - 70, y: sr.top + sr.height / 2 } : undefined,
            to: "score" as const,
            delay: 0,
            fast: true,
          },
        ]);
        sfx.bankScore();
        after(430, () => {
          setFlying([]);
          setMultLabel(null);
          if (pts) setScore((v) => v + pts);
          say(toastKind, toastText);
          then();
        });
      } else {
        sfx.poof();
        setFlying([]);
        setMultLabel(null);
        say(toastKind, toastText);
        then();
      }
    });
  };

  /** Stagger the old board out under a banner, then drop the new board in. */
  const clearAndRefill = (text: string, kind: BannerKind, nextBoard: ScriptBoard, then: () => void) => {
    setBusyAll(true);
    // SEGMENT BOUNDARY WIPE: nothing transient may carry across a segment — any
    // flight, lineup, plate or parked multiplier still visible is stale.
    setFlying([]);
    setHandFlight(null);
    setLineup(null);
    setBankedPlate(null);
    setMultLabel(null);
    setBanner({ text, kind });
    setBoardFx("clear");
    setDropCell(undefined);
    sfx.reshuffle();
    after(1900, () => {
      setBanner(null);
      setBoard(nextBoard);
      setBoardFx("drop");
      after(1300, () => {
        setBoardFx("none");
        setBusyAll(false);
        then();
      });
    });
  };

  /** The PRACTICE bust (the BANKING free placement): BUST stamps in, then Board C
   *  is restored and the step retries — no life lost. */
  const practiceBust = () => {
    setFocused(false); // the BUST stamp plays zoomed OUT, like the game
    after(380, () => {
    setBanner({ text: "BUST", kind: "red" });
    setShake(true);
    sfx.bust();
    });
    after(380 + 750, () => {
      setShake(false);
      setBanner(null);
      setBoard({ ...BOARD_C });
      setHand(VG);
      setUpNext(5); // rewind the attempt's spent tile
      setAct([]);
      setActReveal(new Set());
      setDropCell(undefined);
      say("info", "Try again — place your Vigilite touching the Vigilite cluster");
      setBusyAll(false);
    });
  };

  /** The FINAL scripted bust (step 15), resolved exactly like the real game:
   *  BUST stamps in and a life is spent → the busted tile (and the tile it
   *  covered) lift and fly UP to the BUSTS box → the next tile drops from the
   *  hand into the gap as the forced penalty tile (red inert outline) →
   *  RESHUFFLE → the closing text. */
  const finalBustSeq = (key: string, covered: TileVal | null) => {
    setFocused(false); // the BUST stamp (and everything after) plays zoomed OUT
    after(380, () => {
      setBanner({ text: "BUST", kind: "red" });
      setShake(true);
      sfx.bust();
      setLives((v) => v - 1);
    });
    after(380 + 750, () => {
      setBanner(null);
      setShake(false);
      // the busted tile floats above its cell, then flies to the BUSTS box —
      // the game's T.bustLift float before the flight
      setHidden(new Set([key]));
      const flights: FlyingTile[] = [
        { id: `bust-placed-${++flyIdRef.current}`, value: VD, fromKey: key, to: "bust", delay: 1000 },
      ];
      if (covered != null) {
        flights.push({ id: `bust-covered-${++flyIdRef.current}`, value: covered, fromKey: key, to: "bust", delay: 1120 });
      }
      setFlying((f) => [...f, ...flights]);
      after(2350, () => {
        // the loss is committed; the next tile drops from the hand into the gap
        setBoard((b) => ({ ...b, [key]: null }));
        setHidden(new Set());
        const handEl = handRef.current?.getBoundingClientRect();
        // Vigilite — with the leftovers all distinct values, the penalty tile
        // must be one too (a second Duneglass would make a pair the isolation
        // rules would owe a resolution for after the reshuffle).
        const nextVal = VG;
        setFlying([
          {
            id: `bust-next-${++flyIdRef.current}`,
            value: nextVal,
            fromKey: null,
            fromXY: handEl ? { x: handEl.left + handEl.width / 2, y: handEl.top + handEl.height / 2 } : undefined,
            to: "gap",
            toKey: key,
            delay: 0,
          },
        ]);
        setHand(VG);
        setUpNext((n) => Math.max(0, n - 1));
        after(640, () => sfx.place()); // thud as it lands
        after(790, () => {
          setFlying([]);
          setBoard((b) => ({ ...b, [key]: nextVal }));
          setInertCell(key); // the red outline — the bust's penalty tile
          after(500, () => {
            // A REAL reshuffle on the SAME board, like the game's post-bust one:
            // the banner sweeps, every gem plays the staggered 3D flip, and the
            // remaining tiles drift to neighbouring cells (the penalty tile keeps
            // its red marker wherever it lands). The drift is re-sampled until no
            // tile ends up cut off, so the board never contradicts the isolation
            // rules the player just learned. The final hand tile (Umbrite) can
            // join nothing here — no set, no run — so cashing out is the only way.
            setBanner({ text: "RESHUFFLE", kind: "violet" });
            setShake(true); // the game shakes the board through the shuffle
            sfx.reshuffle();
            after(1000, () => {
              const b = boardRef.current;
              // accept a layout only if (a) every tile still touches another —
              // no isolations to owe the player — and (b) the wild Nebulite is
              // NOT beside the Umbrite or Chromite, since either would hand the
              // final Umbrite a real combo (wild Trips / a 2-3-4-5) and break
              // the "cashing out is the only way" finale.
              const safeLayout = (bd: ScriptBoard) => {
                const tiles = Object.keys(bd).filter((c) => bd[c] != null);
                if (!tiles.every((t) => (template.adj.get(t) ?? []).some((n) => bd[n] != null))) return false;
                const nu = tiles.find((t) => bd[t] === NU);
                return !nu || !(template.adj.get(nu) ?? []).some((n) => bd[n] === UM || bd[n] === CH);
              };
              let nb: ScriptBoard = { ...b };
              let inertNew = key;
              for (let attempt = 0; attempt < 60; attempt++) {
                const cand: ScriptBoard = { ...b };
                let inertC = key;
                for (const k of Object.keys(cand).filter((c) => cand[c] != null)) {
                  const val = cand[k]!;
                  const empties = (template.adj.get(k) ?? []).filter((n) => cand[n] == null);
                  if (empties.length === 0) continue;
                  const dest = empties[Math.floor(Math.random() * empties.length)];
                  cand[dest] = val;
                  cand[k] = null;
                  if (k === inertC) inertC = dest;
                }
                if (safeLayout(cand)) {
                  nb = cand;
                  inertNew = inertC;
                  break;
                }
              }
              // repair pass: a tile left touching nothing (e.g. a far-corner bust's
              // penalty tile) is pulled onto the clump — a reshuffle may move a
              // tile several cells, so this still reads as part of the shuffle
              for (let guard = 0; guard < 10; guard++) {
                const tiles = Object.keys(nb).filter((c) => nb[c] != null);
                const lonely = tiles.find((t) => !(template.adj.get(t) ?? []).some((n) => nb[n] != null));
                if (!lonely) break;
                const anchor = tiles.find((t) => t !== lonely && (template.adj.get(t) ?? []).some((n) => nb[n] != null)) ?? tiles.find((t) => t !== lonely);
                const spot = anchor ? (template.adj.get(anchor) ?? []).find((n) => nb[n] == null) : undefined;
                if (!anchor || !spot) break;
                nb[spot] = nb[lonely]!;
                nb[lonely] = null;
                if (inertNew === lonely) inertNew = spot;
              }
              setDropCell(undefined);
              setBoard(nb);
              setInertCell(inertNew);
              setHand(UM); // the final tile — it matches nothing on this board
              setUpNext(0); // and it is the only tile left
              say("info", "Tiles in your stack are reshuffled.");
            });
            after(1450, () => {
              setBanner(null);
              setShake(false);
              // GLINT RUSH arms with the game's fanfare + whoosh, and the Cash Out
              // button appears — the run can only be ended by cashing out, since
              // the final tile can join nothing.
              sfx.boardCleared();
              after(120, () => sfx.rushRise());
              setRush(true);
              after(3000, () => setRush(false));
              setCashOut("armed");
              setStep(24);
              setBusyAll(false);
            });
          });
        });
      });
    });
  };

  /** Wrong-click feedback: a 3s dark veil over the screen with a clear hole
   *  around where the player is supposed to act. */
  const spotlight = (x: number, y: number, rx: number, ry: number) => {
    const id = ++spotIdRef.current;
    setSpot({ x, y, rx, ry, id });
    after(3050, () => setSpot((s) => (s && s.id === id ? null : s)));
  };

  /** Spotlight an ELEMENT: if it sits outside the viewport (e.g. the Next button
   *  below the fold on a scrolling screen), the page first scrolls it into view,
   *  and only then does the veil open its hole around it. */
  const scrollSpot = (el: Element | null, calc: (r: DOMRect) => [number, number]) => {
    if (!el) return;
    const r0 = el.getBoundingClientRect();
    const visible = r0.top >= 0 && r0.bottom <= window.innerHeight;
    if (!visible) el.scrollIntoView({ behavior: "smooth", block: "center" });
    after(visible ? 0 : 430, () => {
      const r = el.getBoundingClientRect();
      const [rx, ry] = calc(r);
      spotlight(r.left + r.width / 2, r.top + r.height / 2, rx, ry);
    });
  };

  /** Any click in the board area that produced no response points the player at
   *  the required action: the target cell, the CLEARING circle, the armed BANK
   *  NOW, or the panel's Next button. (Successful placements set busy
   *  synchronously, so they skip.) */
  const onBoardMiss = () => {
    if (missMuteRef.current) {
      missMuteRef.current = false; // the tap was consumed by the choice lesson
      return;
    }
    if (busyRef.current) return;
    if (target) {
      scrollSpot(document.querySelector(`g[data-ck="${target}"]`), (r) => {
        const rad = Math.max(r.width, r.height) * 1.15;
        return [rad, rad];
      });
      return;
    }
    if (step === 7) {
      // the Pentad claim: point at the HIGHEST-value tile touching the Pentad —
      // covering it spends it as the multiplier, the smartest way to claim
      let best: string | null = null;
      let bestV = -1;
      for (const k of Object.keys(boardRef.current)) {
        const v = boardRef.current[k];
        if (v == null || PENTAD.includes(k)) continue;
        if (!(template.adj.get(k) ?? []).some((n) => PENTAD.includes(n))) continue;
        if ((v as number) > bestV) {
          bestV = v as number;
          best = k;
        }
      }
      if (best) {
        scrollSpot(document.querySelector(`g[data-ck="${best}"]`), (r) => {
          const rad = Math.max(r.width, r.height) * 1.15;
          return [rad, rad];
        });
      }
      return;
    }
    if (step === 15) {
      // COMBO CHOICE: highlight the two candidate chains
      const pts = [...new Set([...CHOICE_A, ...CHOICE_B])].map((k) => mapperRef.current?.(k)).filter(Boolean) as { x: number; y: number }[];
      if (pts.length) {
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        spotlight((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.max(...xs) - Math.min(...xs)) / 2 + 70, (Math.max(...ys) - Math.min(...ys)) / 2 + 60);
      }
      return;
    }
    if (step === 17) {
      // CLEARING part 2: highlight the whole Duneglass circle (and its rim of gaps)
      const pts = ["0,0", ...CLEAR_RING].map((k) => mapperRef.current?.(k)).filter(Boolean) as { x: number; y: number }[];
      if (pts.length) {
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        spotlight(cx, cy, (Math.max(...xs) - Math.min(...xs)) / 2 + 78, (Math.max(...ys) - Math.min(...ys)) / 2 + 66);
      }
      return;
    }
    if (step === 18) {
      // CLEARING part 3: point at the two Nuracite that touch the Chromite pair — the
      // only legal covers (the third Nuracite doesn't touch the pair, so it can't).
      const pts = [...PR_ELIGIBLE, ...PR_CH].map((k) => mapperRef.current?.(k)).filter(Boolean) as { x: number; y: number }[];
      if (pts.length) {
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        spotlight(cx, cy, (Math.max(...xs) - Math.min(...xs)) / 2 + 72, (Math.max(...ys) - Math.min(...ys)) / 2 + 64);
      }
      return;
    }
    if (step === 21) {
      scrollSpot(bankBoxRef.current, (r) => [r.width * 0.62, r.height * 1.4]);
      return;
    }
    if (step === 24) {
      scrollSpot(cashBtnRef.current, (r) => [r.width * 0.7, r.height * 1.7]);
      return;
    }
    if (GATE_LABEL[step]) {
      scrollSpot(arrowRef.current, (r) => [r.width * 1.6, r.height * 1.6]);
    }
  };

  // ---- gates ----

  const onNext = () => {
    if (busyRef.current) return;
    sfx.click();
    switch (step) {
      case 0:
        setHint(new Set(["0,-2", "0,-1", "1,-2"]));
        setTarget("-1,-1");
        setStep(1);
        break;
      case 2:
        setStep(3);
        break;
      case 3:
        setHint(new Set(["0,1", "1,0"]));
        setTarget("0,0");
        setStep(4);
        break;
      case 5:
        // COMBOS part 2 — the Pentad demonstration on a fresh board
        clearAndRefill(SEGMENTS.combos, "violet", BOARD_P, () => {
          setBank("hidden");
          setHand(UM); // the Pentad is made with an Umbrite gem
          setHint(new Set(["-2,0", "-1,0", "1,0", "2,0"]));
          setTarget("0,0");
          setStep(6);
        });
        break;
      case 8:
        // DRIFTS — the sequence-combo board, and set up the Drift placement
        clearAndRefill(SEGMENTS.drifts, "violet", BOARD_B, () => {
          setBank("hidden");
          setHint(new Set(DRIFT));
          setTarget("-2,3");
          setStep(9);
        });
        break;
      case 11:
        setHint(new Set(FULL_DRIFT));
        setTarget("1,2");
        setStep(12);
        break;
      case 13:
        // the COMBO CHOICE lesson board drops in quietly (same chapter)
        setBusyAll(true);
        setBoard({ ...BOARD_X });
        setBoardFx("drop");
        sfx.reshuffle();
        after(1300, () => {
          setBoardFx("none");
          setTarget("0,0");
          setStep(14);
          setBusyAll(false);
        });
        break;
      case 19:
        clearAndRefill(SEGMENTS.banking, "gold", BOARD_C, () => {
          setStep(20);
        });
        break;
      case 22:
        setStep(23);
        break;
      case 25:
        onComplete();
        break;
    }
  };

  const onCell = (key: string) => {
    if (busyRef.current) return;
    switch (step) {
      case 1: {
        if (key !== "-1,-1") return;
        // the covered Duneglass goes to the hand; the hand advances to the Umbrite
        place(key, CH, UM, true);
        revealActivation(QUAD, () => {
          setBank("disabled");
          // the locked BANK NOW still counts down (silently), then disappears
          after(4400, () => setBank((b) => (b === "disabled" ? "hidden" : b)));
          say("info", "Quad activated · 4 / 6 tiles");
          setStep(2);
          setBusyAll(false);
        });
        break;
      }
      case 4: {
        if (key !== "0,0") return;
        // the covered Nuracite is the ×6 multiplier — it does NOT go to the hand:
        // it lifts out and parks beside the score with its ×6 label
        const covered4 = place(key, UM, VD, false);
        parkMultiplier(key, covered4);
        setBank("hidden");
        // (400 + 300) ×6 + Convergence 100 = 4,300 — the chain bonus lands AFTER the multiplier
        revealActivation(CONVERGENCE, () =>
          after(450, () =>
            bankOut(CONVERGENCE, 4300, "BANKED ×6", "+4,300 · Quad + Trips · Convergence ×6", () => setStep(5), {
              specs: [
                { name: "Quad", cells: QUAD },
                { name: "Trips", cells: CONVERGENCE.filter((k) => !QUAD.includes(k)) },
              ],
              chain: "Convergence",
            })
          )
        );
        break;
      }
      case 6: {
        // COMBOS part 2 — the Pentad: only the Verdite spot makes a five-of-a-kind.
        if (key !== "0,0") return;
        // the covered Verdite goes to the hand; the hand stays Umbrite for the claim
        place(key, UM, UM, true);
        revealActivation(PENTAD, () => {
          setBank("disabled");
          after(4400, () => setBank((b) => (b === "disabled" ? "hidden" : b)));
          say("info", "Pentad activated · 5 / 6 tiles");
          setStep(7);
          setBusyAll(false);
        });
        break;
      }
      case 7: {
        // claim it: ANY cell touching the Pentad — a gap or a tile — turns it
        // into a Hex, which auto-banks. Covering a tile spends it as the
        // multiplier (the smarter play — we just taught that); a gap fill
        // banks at base value, exactly like the real game.
        const touches7 = !PENTAD.includes(key) && (template.adj.get(key) ?? []).some((n) => PENTAD.includes(n));
        if (!touches7) return;
        const covered7 = board[key] ?? null;
        place(key, UM, VD, false); // the hand advances to the Verdite either way
        parkMultiplier(key, covered7); // ×N parks beside the score (no-op for a gap / a 1)
        const m7 = covered7 != null && (covered7 as number) > 1 ? (covered7 as number) : 1;
        const pts7 = 600 * m7;
        const hex7 = [key, ...PENTAD];
        setBank("hidden");
        revealActivation(hex7, () =>
          after(450, () =>
            bankOut(
              hex7,
              pts7,
              m7 > 1 ? `BANKED ×${m7}` : "BANKED",
              m7 > 1 ? `+${pts7.toLocaleString()} · Hex of Umbrite ×${m7}` : "+600 · Hex of Umbrite claimed",
              () => setStep(8),
              { specs: [{ name: "Hex", cells: hex7 }] }
            )
          )
        );
        break;
      }
      case 9: {
        if (key !== "-2,3") return;
        // the covered Verdite goes to the hand; the hand advances to the Duneglass
        place(key, VD, DG, true);
        revealActivation(DRIFT, () => {
          setChips({ "-2,0": 1, "-2,1": 2, "-2,2": 3, "-2,3": 4 });
          // the locked BANK NOW appears after every activation, like the real game
          setBank("disabled");
          after(4400, () => setBank((b) => (b === "disabled" ? "hidden" : b)));
          say("info", "Drift activated · 4 / 6 tiles");
          setTarget("-1,0");
          setStep(10);
          setBusyAll(false);
        });
        break;
      }
      case 10: {
        if (key !== "-1,0") return;
        // the covered Vigilite is the ×2 multiplier
        const covered10 = place(key, DG, NU, false);
        parkMultiplier(key, covered10);
        setChips(undefined);
        // (400 + 300) ×2 + Accord 200 = 1,600 — the chain bonus lands AFTER the multiplier.
        // The Duneglass at -2,0 sits in BOTH combos: the lineup shows it as a ghost
        // in the Trips row (the user-facing "shared tile" example).
        revealActivation(ACCORD, () =>
          after(450, () =>
            bankOut(ACCORD, 1600, "BANKED ×2", "+1,600 · Accord: Drift + Trips ×2", () => setStep(11), {
              specs: [
                { name: "Drift", cells: DRIFT, run: true },
                { name: "Trips", cells: ["-1,0", "0,0", "-2,0"] },
              ],
              chain: "Accord",
            })
          )
        );
        break;
      }
      case 12: {
        if (key !== "1,2") return;
        // the covered Nuracite is the ×6 multiplier
        const covered12 = place(key, NU, NU, false); // the NEXT Nuracite feeds the choice lesson
        parkMultiplier(key, covered12);
        revealActivation(FULL_DRIFT, () =>
          after(450, () =>
            bankOut(FULL_DRIFT, 4800, "BANKED ×6", "+4,800 · Full Drift ×6", () => setStep(13), {
              specs: [{ name: "Full Drift", cells: FULL_DRIFT, run: true }],
            })
          )
        );
        break;
      }
      case 14: {
        // COMBO CHOICE part 1: place the Nuracite — it fits BOTH Drifts, so the
        // picker stages: blue = the picked chain, amber dashed = the other, and
        // the countdown chip plays its real 1.6s drain then fades (here it
        // never commits — the player takes their time).
        if (key !== "0,0") return;
        place(key, NU, VG, false); // the hand advances to the Vigilite for CLEARING
        setChoicePick("A");
        choiceSwitchedRef.current = false;
        setHint(new Set(CHOICE_A)); // blue — the same ring the real picker uses
        setGrey(new Set(CHOICE_B.filter((k) => !CHOICE_A.includes(k))));
        runChoiceChip(key);
        setStep(15);
        break;
      }
      case 15: {
        // COMBO CHOICE part 2: tap amber to switch (required once), then tap the
        // blue combo to lock it in — which activates the picked Drift.
        const cur = choicePick === "A" ? CHOICE_A : CHOICE_B;
        const oth = choicePick === "A" ? CHOICE_B : CHOICE_A;
        if (oth.includes(key) && !cur.includes(key)) {
          // switch the pick (and back again, if they like)
          missMuteRef.current = true;
          const next = choicePick === "A" ? "B" : "A";
          setChoicePick(next);
          choiceSwitchedRef.current = true;
          sfx.click();
          setHint(new Set(oth));
          setGrey(new Set(cur.filter((k) => !oth.includes(k))));
          // a switch restarts the countdown — exactly like the real picker
          runChoiceChip("0,0");
          say("info", "Switched. Tap the blue combo to lock it in.");
          return;
        }
        if (cur.includes(key)) {
          if (!choiceSwitchedRef.current) {
            // feel the switch first — that's the lesson
            missMuteRef.current = true;
            say("info", "First, tap an amber tile to try switching the pick.");
            return;
          }
          // lock it in: the picked Drift activates, then CLEARING begins
          sfx.bankNowClick();
          const pickedCells = cur;
          setHint(undefined);
          setGrey(undefined);
          setChoiceChip(null);
          revealActivation(pickedCells, () => {
            setChips(undefined);
            say("info", "Drift locked in and activated · 4 / 6 tiles");
            after(900, () => {
              setAct([]);
              setActReveal(new Set());
              clearAndRefill(SEGMENTS.clearing, "violet", BOARD_D, () => {
                setTarget("0,1"); // the ring's one gap
                setStep(16);
                setBusyAll(false);
              });
            });
          });
          return;
        }
        break;
      }
      case 16: {
        // CLEARING part 1: fill the ring's gap. The Vigilite Hex banks, and the
        // surrounded Nuracite is ISOLATED — it banks at face value (+600).
        if (key !== "0,1") return;
        place(key, VG, DG, false);
        revealActivation(CLEAR_RING, () =>
          after(450, () =>
            bankOut(CLEAR_RING, 600, "BANKED", "+600 · Hex of Vigilite", () => {
              isolateToScore("0,0", NU, "+600", 2000, 600, "bank", "Isolated Nuracite banked for face value · +600", "score", () => {
                // the Dross circle drops in for part 2
                setBoard({ ...BOARD_E });
                setBoardFx("drop");
                sfx.reshuffle();
                after(1300, () => {
                  setBoardFx("none");
                  setStep(17);
                  setBusyAll(false);
                });
              });
            }, { specs: [{ name: "Hex", cells: CLEAR_RING }] })
          )
        );
        break;
      }
      case 17: {
        // CLEARING part 2: any Duneglass of the circle, or any gap touching one.
        // The Dross itself and unconnected gaps are dead — onBoardMiss points at
        // the circle. Completing it banks the Hex and clears the isolated Dross.
        const covering = board[key] === DG;
        const adjGap = (board[key] ?? null) == null && (template.adj.get(key) ?? []).some((n) => board[n] === DG);
        if (!covering && !adjGap) return;
        const b15: ScriptBoard = { ...board, [key]: DG };
        const cluster15: string[] = [];
        const seen15 = new Set([key]);
        const q15 = [key];
        while (q15.length) {
          const k = q15.shift()!;
          cluster15.push(k);
          for (const n of template.adj.get(k) ?? []) {
            if (!seen15.has(n) && b15[n] === DG) {
              seen15.add(n);
              q15.push(n);
            }
          }
        }
        place(key, DG, CH, false); // the hand advances to the Chromite for the pair lesson
        // RULE 1: ADDING a 7th Duneglass makes a strand of 7 — only the 6 nearest bank as
        // the Hex; the extra overflows to the hand (flashed red), exactly like the game.
        // (COVERING one keeps it a clean 6-tile Hex — no overflow.)
        const chain7 = cluster15.length >= 7;
        const hexCells = chain7 ? cluster15.slice(0, 6) : cluster15;
        const overflow17 = chain7 ? cluster15[6] : null;
        if (overflow17) setRed(new Set([overflow17]));
        // the Dross clear + buried-Verdite hand-off + hand-in of the pair board
        const clearDross = () =>
          isolateToScore("0,0", GLINT as TileVal, null, 1000, 0, "glint", "Dross isolated and cleared — no points.", "vanish", () => {
            setBusyAll(true);
            setHidden(new Set(["0,0"]));
            after(180, () => {
              const from = mapperRef.current?.("0,0");
              const un = upNextRef.current?.getBoundingClientRect();
              if (from && un) setHandFlight({ id: ++flyIdRef.current, value: VD, from, to: { x: un.left + un.width / 2, y: un.top + un.height * 0.3 } });
              setBoard((b) => ({ ...b, "0,0": null }));
              setHidden(new Set());
              setUpNext((n) => n + 1);
            });
            after(1100, () => {
              setBoard({ ...BOARD_PR });
              setAct(PR_DRIFT);
              setActReveal(new Set(PR_DRIFT));
              setBoardFx("drop");
              sfx.reshuffle();
              after(1300, () => {
                setBoardFx("none");
                setStep(18);
                setBusyAll(false);
              });
            });
          }, () => {
            // ONVACATE — expose the gem buried under the Dross the instant it leaves.
            setBoard((b) => ({ ...b, "0,0": VD }));
            setDropCell("0,0");
            sfx.place();
            say("info", "A Verdite was buried under the Dross — it returns to your hand.");
            after(700, () => setDropCell(undefined));
          });
        revealActivation(hexCells, () =>
          after(450, () =>
            bankOut(hexCells, 600, "BANKED", "+600 · Hex of Duneglass", () => {
              if (overflow17) {
                // the 7th Duneglass overflows to the hand, then the Dross resolves
                setBusyAll(true);
                setHidden(new Set([overflow17]));
                after(180, () => {
                  const from = mapperRef.current?.(overflow17);
                  const un = upNextRef.current?.getBoundingClientRect();
                  if (from && un) setHandFlight({ id: ++flyIdRef.current, value: DG, from, to: { x: un.left + un.width / 2, y: un.top + un.height * 0.3 } });
                  setBoard((b) => ({ ...b, [overflow17]: null }));
                  setRed(new Set());
                  setHidden(new Set());
                  setUpNext((n) => n + 1);
                });
                after(1000, () => {
                  say("info", "Seven of a kind: six bank as a Hex, the extra Duneglass overflows to your hand.");
                  clearDross();
                });
              } else {
                clearDross();
              }
            }, { specs: [{ name: "Hex", cells: hexCells }] })
          )
        );
        break;
      }
      case 18: {
        // CLEARING part 3 — isolate a PAIR, the in-game way: COVER one of the two
        // Nuracite that touch the Chromite pair (spending it as the ×6 multiplier) to
        // make a TRIPS, which activates and bridges the already-activated Drift into a
        // 7-tile cluster — the whole thing BANKS (Trips + Drift, Accord ×6). Only once
        // those clear are the OTHER two Nuracite isolated: one banks, one joins the hand.
        // (The third Nuracite that doesn't touch the pair isn't a legal cover.)
        if (!PR_ELIGIBLE.includes(key)) return;
        const covered18 = place(key, CH, VG, false); // cover the Nuracite (×6) — hand ends on the Vigilite for BANKING
        parkMultiplier(key, covered18); // the covered Nuracite is the ×6 multiplier
        const trips16 = [key, ...PR_CH];
        const cluster16 = [...trips16, ...PR_DRIFT];
        const pair = PR_NU_TRI.filter((k) => k !== key); // the two Nuracite left standing → the isolated pair
        // (Drift 400 + Trips 300) ×6 + Accord 200 = 4,400
        revealActivation(trips16, () =>
          after(450, () =>
            bankOut(cluster16, 4400, "BANKED ×6", "+4,400 · Accord: Drift + Trips ×6", () => {
              // ONLY NOW are the two remaining Nuracite cut off: one banks at face value…
              isolateToScore(pair[0], NU, "+600", 1400, 600, "bank", "Isolated Nuracite banked · +600", "score", () => {
                // …and the other lifts off and flies up into the hand stack
                setBusyAll(true);
                setHidden(new Set([pair[1]]));
                after(180, () => {
                  const from = mapperRef.current?.(pair[1]);
                  const un = upNextRef.current?.getBoundingClientRect();
                  if (from && un) setHandFlight({ id: ++flyIdRef.current, value: NU, from, to: { x: un.left + un.width / 2, y: un.top + un.height * 0.3 } });
                  setBoard((b) => ({ ...b, [pair[1]]: null }));
                  setHidden(new Set());
                  setUpNext((n) => n + 1);
                });
                after(1000, () => {
                  sfx.place();
                  say("bank", "One Nuracite banked, the other went to your hand.");
                  setStep(19);
                  setBusyAll(false);
                });
              });
            }, {
              specs: [
                { name: "Trips", cells: trips16 },
                { name: "Drift", cells: PR_DRIFT, run: true },
              ],
              chain: "Accord",
            })
          )
        );
        break;
      }
      case 20: {
        // free placement — anywhere on the board, gap or tile. Success = the placed
        // Vigilite touches the Vigilite cluster (a combo forms); otherwise BUST + retry.
        const covered = board[key] ?? null;
        const b2: ScriptBoard = { ...board, [key]: VG };
        const cluster: string[] = [];
        const seen = new Set([key]);
        const queue = [key];
        while (queue.length) {
          const k = queue.shift()!;
          cluster.push(k);
          for (const n of template.adj.get(k) ?? []) {
            if (!seen.has(n) && b2[n] === VG) {
              seen.add(n);
              queue.push(n);
            }
          }
        }
        place(key, VG, VD, true); // a covered tile joins the HAND — a free bank has no multiplier
        if (cluster.length >= 2) {
          comboRef.current = cluster;
          revealActivation(cluster, () => {
            setBank("armed");
            say("info", `${COMBO_NAME[cluster.length]} activated · ${cluster.length} tiles`);
            setStep(21);
            setBusyAll(false);
          });
        } else {
          setBusyAll(true);
          after(500, () => practiceBust());
        }
        break;
      }
      case 23: {
        // anywhere at all — gap or tile — this one always busts, and resolves
        // exactly like a real in-game bust, then arms GLINT RUSH + Cash Out. The
        // hand here is the Verdite carried over from the banking lesson.
        const covered21 = board[key] ?? null;
        place(key, VD, UM, false);
        setBusyAll(true);
        after(500, () => finalBustSeq(key, covered21));
        break;
      }
    }
  };

  const onBankTap = () => {
    if (busyRef.current || bank !== "armed" || step !== 21) return;
    sfx.bankNowClick();
    const cells = comboRef.current;
    const name = COMBO_NAME[cells.length] ?? "Combo";
    // the real free bank banks at base value — no multiplier (the covered tile
    // went to the hand at placement), plate shows the tile count like in-game
    const pts = COMBO_BASE[cells.length] ?? 500;
    setBank("hidden");
    setFreeBanks((v) => v - 1);
    bankOut(cells, pts, `BANKED ×${cells.length}`, `+${pts.toLocaleString()} · ${name} · free bank used`, () => setStep(22), {
      specs: [{ name, cells }],
    });
  };

  /** RESTART — rewind the whole script to step 0. */
  const reset = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setStep(0);
    setBoard(BOARD_A);
    setHand(CH);
    setUpNext(10);
    setAct([]);
    setActReveal(new Set());
    setHint(undefined);
    setRed(new Set());
    setTarget(null);
    setChips(undefined);
    setDropCell(undefined);
    setInertCell(null);
    setSpot(null);
    setScore(0);
    setFreeBanks(3);
    setLives(3);
    setBank("hidden");
    setBanner(null);
    setBankedPlate(null);
    setLit(new Set());
    setHidden(new Set());
    setFlying([]);
    setBoardFx("none");
    setShake(false);
    setBusyAll(false);
    setHandFlight(null);
    setMultLabel(null);
    multValRef.current = null;
    setRush(false);
    setCashOut("hidden");
    setCashConfirm(false);
    setCashedOut(false);
    setLineup(null);
    setChoicePick("A");
    setGrey(undefined);
    setChoiceChip(null);
    choiceSwitchedRef.current = false;
    setLog([{ text: CONTENT.tutorialLevel.intro, kind: "info" }]);
    setToast(null);
    setInstruction(null);
  };

  const forcedSteps = [1, 4, 6, 9, 10, 12, 14, 16];
  const freeSteps = [7, 15, 17, 18, 20, 23];
  const interactive = !busy && (forcedSteps.includes(step) || freeSteps.includes(step));
  const gateLabel = GATE_LABEL[step];

  // the persistent instruction: 2s after a step settles (not animating), tell the
  // player what KIND of action moves things forward — and keep it on screen until
  // they act (the step change or a new animation clears it)
  useEffect(() => {
    setInstruction(null);
    if (busy) return;
    const text = GATE_LABEL[step]
      ? "Tap the Next button to continue."
      : step === 15
      ? "Tap an amber tile to switch, then tap the blue combo to lock it in."
      : step === 21
      ? "Tap the BANK NOW button to continue."
      : step === 24
      ? "Tap the Cash Out button to continue."
      : forcedSteps.includes(step) || freeSteps.includes(step)
      ? "Place your tile on the board to continue."
      : null;
    if (!text) return;
    const t = window.setTimeout(() => setInstruction(text), 2000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, busy]);

  const anchorOf = (ref: React.RefObject<HTMLElement>) => () => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  return (
    <div className="gl-shell gl-screen-in" style={{ position: "relative", zIndex: 1 }}>
      <Backdrop />

      {/* header — the shared in-game top bar, so the tutorial matches the game exactly */}
      <GameHeader muted={muted} onToggleMute={onToggleMute} onHelp={onHelp} onSettings={onSettings} onExit={onExit} nebulite={nebulite} onNebuliteClick={onNebuliteClick} />

      {/* HUD with the scripted BANK NOW overlay (hidden / disabled / armed-frozen) */}
      <div style={{ position: "relative" }}>
        <HUD state={gs} scoreRef={scoreRef} bustRef={bustRef} banksRef={banksRef} />
        {bank !== "hidden" && (
          <div style={hudBankOverlay} ref={bankBoxRef}>
            <ScriptBankButton armed={bank === "armed"} onBank={onBankTap} />
          </div>
        )}
      </div>

      <div className="gl-grid">
        <div>
          <div className="gl-sheen-area">
            <div style={boardPanel}>
              <div style={boardGlow} />
              <div style={{ position: "relative" }} className={shake && gameOptions.screenShake ? "gl-shake" : undefined} onClick={onBoardMiss}>
                <div className="gl-board-viewport">
                  <div style={boardCastShadow} />
                  <div className="gl-board-tilt">
                    <div
                      style={{
                        // the game's focus zoom: lean in while the action plays,
                        // springy settle back out when it resolves
                        transform: `scale(${focused ? ZOOM_IN : ZOOM_BASE})`,
                        transformOrigin: "50% 45%",
                        transition: "transform 0.36s cubic-bezier(0.34, 1.26, 0.5, 1)",
                        touchAction: "manipulation",
                      }}
                    >
                      <div className="gl-breathe">
                        <div style={{ filter: banner ? "blur(2.5px) brightness(0.82)" : undefined, transition: "filter 0.28s ease" }}>
                          <Board
                            state={gs}
                            onPlace={onCell}
                            interactive={interactive}
                            litCells={lit}
                            redCells={red}
                            hiddenCells={hidden}
                            activatedFilter={actReveal}
                            dropCell={dropCell}
                            hintCells={hint}
                            greyCells={grey}
                            targetCell={target}
                            chipCells={chips}
                            spinCells={banner?.text === "RESHUFFLE"}
                            clearAll={boardFx === "clear"}
                            dropAll={boardFx === "drop"}
                            maxHeightCss="40vh"
                            onMapper={handleMapper}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {bankedPlate && <BankedPlate key={bankedPlate + step} text={bankedPlate} />}

                {/* the CASH OUT button — the same gold pill as the real game;
                    appears with GLINT RUSH and opens the shared ceremony */}
                {cashOut === "armed" && (
                  <CashOutButton value={cashOutValue(gs).total} onOpen={() => { missMuteRef.current = true; setCashConfirm(true); }} btnRef={cashBtnRef} />
                )}
              </div>
            </div>

            {/* FIELD-COVERING ANIMATION LAYER — a child of the sheen area, bled to the
                WHOLE game window (past the shell's 9px side padding and DOWN past NOW
                PLACING to the footer's top line), so the segment-transition banner's
                scrim reaches the screen edges with no margin, exactly like the real
                game. Previously the banner sat inside the board wrapper, so its inset:0
                scrim only filled the board and left a visible frame around it. */}
            <div style={{ position: "absolute", top: 0, left: -9, right: -9, bottom: -FOOTER_POKE, zIndex: 30, pointerEvents: "none" }}>
              {banner && <BigBanner text={banner.text} kind={banner.kind} />}
              {/* GLINT RUSH — hosted in this layer exactly like the real game, so the
                  announcement centres on the board viewport, not the whole screen */}
              {rush && <RushOverlay />}
            </div>

            <div style={toastBand}>
              {instruction ? (
                <FloatingToast key={`instr-${step}`} kind="info" text={instruction} stay />
              ) : (
                toast && <FloatingToast key={toast.id} kind={toast.kind} text={toast.text} />
              )}
            </div>

            <div style={sheenClip}>
              <div className="gl-sheen" style={sheenBar} />
            </div>
          </div>

          <div style={{ paddingTop: FOOTER_POKE, position: "relative", zIndex: 6 }}>
            <Footer state={gs} handRef={handRef} upNextRef={upNextRef} onRestart={reset} onInfo={onInfo} onLog={() => setLogOpen((v) => !v)} />
          </div>

          {/* the tutorial text panel — the ONLY tutorial-specific element */}
          <div style={panelWrap}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={panelKicker}>TUTORIAL</span>
              <span style={panelStep}>{step + 1} / {TEXTS.length}</span>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 12, marginTop: 6 }}>
              <div key={step} className="gl-fade" style={panelText}>
                {TEXTS[step]}
              </div>
              {gateLabel && (
                // when the button IS the required action, it nudges periodically
                <button ref={arrowRef} onClick={onNext} title={gateLabel} aria-label={gateLabel} className="gl-tut-nudge" style={arrowBtn}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* desktop side rail, same as the game */}
        <aside className="gl-siderail">
          <TileLegend />
          <ComboLegend />
          <LogPanel state={gs} />
        </aside>
      </div>

      <FlyingOverlay
        flying={flying}
        mapper={mapperRef.current}
        multiplierLabel={multLabel}
        scoreAnchor={anchorOf(scoreRef)}
        bustAnchor={anchorOf(bustRef)}
        handAnchor={anchorOf(handRef)}
        gapResolver={(key) => mapperRef.current?.(key) ?? null}
      />

      {/* COMBO CHOICE lesson — the countdown chip beside the staged tile plays
          the real 1.6s drain then disappears; here running out commits NOTHING
          (the player takes their time). A switch restarts it, like the game. */}
      {choiceChip && (() => {
        const at = mapperRef.current?.(choiceChip);
        if (!at) return null;
        const C = 2 * Math.PI * 9;
        return (
          <div key={`choice-chip-${chipRun}`} style={{ position: "fixed", left: at.x + 26, top: at.y - 40, zIndex: 40, pointerEvents: "none" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(10,14,24,0.85)", border: "1px solid rgba(77,163,255,0.5)", display: "grid", placeItems: "center", boxShadow: "0 0 12px rgba(77,163,255,0.35)" }}>
              <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(77,163,255,0.25)" strokeWidth="2.6" />
                <circle cx="11" cy="11" r="9" fill="none" stroke="#4da3ff" strokeWidth="2.6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={0}>
                  {/* keyed remount restarts the drain on every show/switch */}
                  <animate attributeName="stroke-dashoffset" from="0" to={C} dur={`${CHIP_DRAIN_MS}ms`} fill="freeze" />
                </circle>
              </svg>
            </div>
          </div>
        );
      })()}

      {/* COMBO LINEUP — the banked tiles form named combo rows under the score,
          exactly like the real game (ghost copies for tiles shared by two combos) */}
      {lineup && <ComboLineupOverlay lineup={lineup} mapper={mapperRef.current} scoreAnchor={anchorOf(scoreRef)} />}

      {/* the slow replaced-tile → hand flight (rises, lingers above UP NEXT, sinks in) */}
      {handFlight && (
        <HandFlight key={handFlight.id} value={handFlight.value} from={handFlight.from} to={handFlight.to} onDone={() => setHandFlight(null)} />
      )}

      {/* wrong-click veil: everything dims except a hole around the required action */}
      {spot && (
        <div
          key={spot.id}
          className="gl-tut-spot"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            pointerEvents: "none",
            background: `radial-gradient(ellipse ${spot.rx}px ${spot.ry}px at ${spot.x}px ${spot.y}px, rgba(0,0,0,0) 55%, rgba(2,3,8,0.7) 98%)`,
          }}
        />
      )}

      {/* CASH OUT ceremony — the SAME component as the real game: the counted
          lives / banks / hand gems gather into the tally, CONFIRM dives the
          total into the score, Cancel poofs it and play resumes */}
      {cashConfirm && (
        <CashOutCeremony
          state={gs}
          anchors={{ score: anchorOf(scoreRef), busts: anchorOf(bustRef), banks: anchorOf(banksRef), hand: anchorOf(handRef) }}
          onConfirm={() => {
            sfx.bankScore();
            setScore((v) => v + cashOutValue(gs).total);
            setCashConfirm(false);
            setCashOut("hidden");
            setCashedOut(true); // the hand was converted to points
            setStep(25);
          }}
          onCancel={() => {
            sfx.poof();
            setCashConfirm(false);
          }}
        />
      )}

      {/* full log — the same collapsing bottom drawer as the game */}
      <LogDrawer open={logOpen} onClose={() => setLogOpen(false)} state={gs} />
    </div>
  );
}

/* ---------- the slow replaced-tile → hand flight ---------- */

/** The replaced tile's journey to the hand, slowed down so it's legible: it
 *  rises off its cell, drifts to a hover point above the UP NEXT stack, lingers
 *  there a beat, then sinks into the stack and fades. */
function HandFlight({
  value,
  from,
  to,
  onDone,
}: {
  value: TileVal;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onDone: () => void;
}) {
  const [pos, setPos] = useState(from);
  const [sink, setSink] = useState(false);
  useEffect(() => {
    const t1 = window.setTimeout(() => setPos({ x: to.x, y: to.y - 62 }), 40); // drift up to the hover point
    const t2 = window.setTimeout(() => {
      setSink(true);
      setPos(to);
      sfx.tileToHand();
    }, 2100); // ~1s flight + ~1s linger
    const t3 = window.setTimeout(onDone, 2750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dur = sink ? 520 : 1000;
  return (
    <div
      style={{
        position: "fixed",
        left: pos.x - 21,
        top: pos.y - 21,
        width: 42,
        height: 42,
        zIndex: 100,
        pointerEvents: "none",
        transition: `left ${dur}ms cubic-bezier(0.4, 0, 0.3, 1), top ${dur}ms cubic-bezier(0.4, 0, 0.3, 1), opacity 480ms ease-in, transform ${dur}ms ease`,
        opacity: sink ? 0.1 : 1,
        transform: sink ? "scale(0.4)" : "scale(1)",
        filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5)) drop-shadow(0 0 12px rgba(192,132,252,0.35))",
      }}
    >
      <TileGem value={value} size={42} />
    </div>
  );
}

/* ---------- scripted BANK NOW ---------- */

const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

/** The scripted BANK NOW. Disabled: it plays the real 3-2-1 countdown (ring drain +
 *  digits, but silent) and the parent hides it when the count runs out. Armed
 *  (step 13): the countdown is FROZEN — decorative, it never expires. */
function ScriptBankButton({ armed, onBank }: { armed: boolean; onBank: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  const [drain, setDrain] = useState(false);

  useEffect(() => {
    if (armed) {
      setCount(null);
      setDrain(false);
      return;
    }
    let interval: number | undefined;
    const grace = window.setTimeout(() => {
      setCount(3);
      setDrain(true);
      sfx.countdownTick(3);
      let n = 3;
      interval = window.setInterval(() => {
        n -= 1;
        if (n <= 0) {
          window.clearInterval(interval);
          setCount(null);
        } else {
          setCount(n);
          sfx.countdownTick(n);
        }
      }, 1000);
    }, 1000);
    return () => {
      window.clearTimeout(grace);
      if (interval) window.clearInterval(interval);
    };
  }, [armed]);

  return (
    <button
      onClick={armed ? onBank : undefined}
      className={armed ? "gl-pulse" : undefined}
      style={{ ...bankWrap, opacity: armed ? 1 : 0.38, cursor: armed ? "pointer" : "not-allowed" }}
    >
      <span style={{ position: "relative", width: 30, height: 30, display: "grid", placeItems: "center" }}>
        <svg width="30" height="30" viewBox="0 0 30 30" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
          <circle cx="15" cy="15" r={RING_R} fill="none" stroke="rgba(232,181,63,0.25)" strokeWidth="2.5" />
          <circle
            cx="15"
            cy="15"
            r={RING_R}
            fill="none"
            stroke={theme.color.gold}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={armed ? RING_C * 0.25 : drain ? RING_C : 0}
            style={{ transition: !armed && drain ? "stroke-dashoffset 3000ms linear" : "none" }}
          />
        </svg>
        <span style={{ position: "relative", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14, color: theme.color.gold }}>
          {armed ? 3 : count ?? "✦"}
        </span>
      </span>
      <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 18, letterSpacing: "0.08em", color: theme.color.gold }}>
        BANK NOW
      </span>
      <span style={{ fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 11, color: theme.color.gold, opacity: 0.7 }}>
        tap to lock points
      </span>
    </button>
  );
}

/* ---------- styles (mirroring the game screen's) ---------- */

const bankWrap: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  width: "100%",
  height: "100%",
  padding: "0 16px",
  borderRadius: 16,
  border: "1px solid rgba(232,181,63,0.5)",
  background: "linear-gradient(180deg, rgba(232,181,63,0.22), rgba(232,181,63,0.1))",
  overflow: "hidden",
};
// the tutorial text panel — violet-tinted card under the footer
const panelWrap: React.CSSProperties = {
  position: "relative",
  zIndex: 6,
  margin: "10px 0 0",
  padding: "13px 16px 14px",
  background: "linear-gradient(180deg, #131628, #0d0f1c)",
  border: "1px solid #34305c",
  borderRadius: 18,
  boxShadow: "0 -8px 30px -12px rgba(124,90,224,0.35)",
  minHeight: 100,
  display: "flex",
  flexDirection: "column",
};
const panelKicker: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontWeight: 700,
  fontSize: 8.5,
  letterSpacing: "0.24em",
  color: "#9d7bff",
};
const panelStep: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontSize: 9,
  color: "#524d78",
};
const panelText: React.CSSProperties = {
  flex: 1,
  fontFamily: theme.fonts.sans,
  fontWeight: 400,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "#cfc9ea",
};
const arrowBtn: React.CSSProperties = {
  flex: "none",
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(180deg, #cda6ff, #b06bf5)",
  borderBottom: "3px solid #7d3fc4",
  color: "#1a0b2e",
  cursor: "pointer",
  boxShadow: "0 8px 18px -6px rgba(176,107,245,0.6)",
};
