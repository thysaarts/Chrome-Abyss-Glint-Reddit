/**
 * PLAYER SETTINGS — persisted in localStorage, applied globally.
 *
 * `theme` and `reduceMotion` are applied as attributes on <html> (data-theme /
 * data-motion), which drive CSS variable overrides and animation freezes in
 * index.css. `sfxVolume` drives the Web Audio master gain (audio/sfx.ts).
 *
 * LIGHT MODE is deliberately NOT a full light theme — the Abyss stays dark. It
 * lifts the board wells, page background and secondary text a notch so the game
 * is readable in daylight / outdoors. See :root[data-theme="light"] in the CSS.
 */
import { readVersioned, writeVersioned } from "../game/storage";
import { DIFFICULTY_KNOBS } from "../game/runConfig";
import { sfx } from "../audio/sfx";
import { music, MUSIC_THEMES } from "../audio/music";
import type { MusicTheme } from "../audio/music";

export interface DecorOverride {
  option?: string; // size (props/patterns) or density/intensity (particles/lights)
  depth?: string;  // props: far | mid | near (parallax plane)
  x?: number;      // props: horizontal position 0–100%
  color?: string;  // particles / lights: tint hex
}

/** A player's per-element tweaks for the 3D Ascent scene (Settings › Decor),
 *  keyed by the element's item key. Absent key/field = the CMS-published value;
 *  the Reset button clears the whole record. */
export interface SceneOverride {
  intensity?: number; // × multiplier — backgrounds + light effects (0.2–1.6)
  tone?: "warm" | "natural" | "cool"; // light effects — preset tints, not free colour
  density?: number; // × multiplier — particles (0.2–1.6)
  speed?: number; // × multiplier — particles (0.3–2)
  x?: number; // props: lateral position (-1..1, absolute)
  y?: number; // props: height up the column (0..1, absolute)
  depth?: number; // props: near/far (-1..1, absolute)
}

export interface Settings {
  theme: "dark" | "light";
  reduceMotion: boolean; // MASTER — see the motion note below
  // ADVANCED motion toggles (Settings › Visual › Advanced). Each is only in effect
  // while reduceMotion is off; read the EFFECTIVE values off `visualOptions` /
  // data-tilt / data-ambient, never these fields directly.
  boardZoom: boolean; // the camera lean-in on every placement / bank / activation
  boardTilt: boolean; // the 3D board surface sway + the board's idle "breathe"
  ambientFx: boolean; // drifting fog, dust, parallax, glimmers, light sweeps
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1 — the subtle generative background track
  musicGeneric: MusicTheme; // the track for menus / quick games / blank levels (equipped from Collection)
  musicInterstellar: MusicTheme; // the track while browsing the Sticker Book
  boardTheme: string; // an equipped region key (from Collection), tints quick / blank boards; "" = standard
  // Settings › Themes region swaps: campaign region -> the REGIONS key / track
  // played in its place (an owned faction pack's). Absent key = standard.
  regionThemes: Record<string, string>;
  regionMusic: Record<string, MusicTheme>;
  // the 3D Ascent scene IS the standard background; Reduce Motion switches to the classic backdrop
  sceneOff: string[]; // names of Ascent scene elements switched OFF (owned elements default on)
  sceneConfig: Record<string, SceneOverride>; // per-element tweaks over the CMS scene (Settings › Decor)
  decor: string[]; // decor keys switched ON for the Ascent (owned + enabled)
  // per-decor player overrides on top of the CMS defaults (Settings › Decor). An
  // absent key/field falls back to the item's CMS value. Reset clears this.
  decorConfig: Record<string, DecorOverride>;
  // GAME options
  difficulty: "easy" | "medium" | "hard"; // the dial the other game options key off
  comboPicker: boolean; // show the combo picker when a placement has >1 combo option; off = auto-bank the best
  choiceTimer: boolean; // timed combo picker: blue auto-confirms after the window; off = the picker waits for a tap
  bankWindow: 3 | 5; // how many seconds the BANK NOW countdown runs
  // board shudder on busts / collapses / reshuffles. Lives with the ADVANCED motion
  // toggles in the UI (Visual › Advanced) — a comfort setting, not a gameplay one —
  // but stays in this block for save-file compatibility.
  screenShake: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  reduceMotion: false,
  boardZoom: true,
  boardTilt: true,
  ambientFx: true,
  sfxVolume: 0.6, // 60 — the balance that reads nicest for a new player
  musicVolume: 0.2, // 20 — subtle background bed by default
  musicGeneric: "generic",
  musicInterstellar: "Interstellar",
  boardTheme: "",
  regionThemes: {},
  regionMusic: {},
  sceneOff: [],
  sceneConfig: {},
  decor: [],
  decorConfig: {},
  difficulty: "medium",
  comboPicker: true,
  choiceTimer: true,
  bankWindow: 3,
  screenShake: true,
};

/** Live copy of the GAME options for non-React code (the game hook's callbacks,
 *  the BANK NOW button) — kept current by applySettings, so gameplay reads the
 *  player's choices without threading props through the animation machinery. */
export const gameOptions = {
  difficulty: DEFAULT_SETTINGS.difficulty as "easy" | "medium" | "hard",
  comboPicker: DEFAULT_SETTINGS.comboPicker,
  choiceTimer: DEFAULT_SETTINGS.choiceTimer,
  bankWindow: DEFAULT_SETTINGS.bankWindow as 3 | 5,
  // NB screenShake is NOT here — it's motion, so it lives on visualOptions where
  // Reduce Motion can gate it.
  // derived from difficulty (applySettings keeps these current):
  choiceWindowMs: 2000, // combo picker auto-confirm (easy 3000; medium/hard 2000)
  revealAt: 4, // hand-wheel reveal threshold (easy 5 / medium 4 / hard 3)
  collapseShift: 0, // added to collapse/singularity triggers (easy +2 / hard −1)
};

/** True when the DEVICE asks for reduced motion. CSS honours this via @media; the
 *  JS-driven board camera has to ask directly, so this is the one place it lives. */
export function osPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Motion should be calmed for ANY reason — the player's master toggle OR the device. */
export function motionReduced(s: Pick<Settings, "reduceMotion">): boolean {
  return s.reduceMotion || osPrefersReducedMotion();
}

/** Live copy of the EFFECTIVE motion toggles (master + OS preference folded in), for
 *  render paths that can't thread props — the board camera in App.tsx + the tutorial's
 *  replica. Kept current by applySettings. Read these; never the raw Settings booleans. */
export const visualOptions = {
  boardZoom: true,
  screenShake: true,
};

const asTheme = (v: unknown, fallback: MusicTheme): MusicTheme =>
  typeof v === "string" && (MUSIC_THEMES as string[]).includes(v) ? (v as MusicTheme) : fallback;

/** A string→string record with junk entries dropped; `check` vets each value. */
const asStrRecord = <T extends string>(v: unknown, check: (val: string) => boolean): Record<string, T> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, T> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val && check(val)) out[k] = val as T;
  }
  return out;
};

const KEY = "glint.settings.v1";
const SAVE_V = 1; // bump + pass a migrate() to readVersioned when Settings' shape changes

export function loadSettings(): Settings {
  const parsed = readVersioned<Settings>(KEY, DEFAULT_SETTINGS, SAVE_V);
  // field-level validation on top of the shared parse/merge (see storage.ts)
  {
    return {
      theme: parsed.theme === "light" ? "light" : "dark",
      reduceMotion: parsed.reduceMotion === true,
      boardZoom: parsed.boardZoom !== false,
      boardTilt: parsed.boardTilt !== false,
      ambientFx: parsed.ambientFx !== false,
      sfxVolume: typeof parsed.sfxVolume === "number" ? Math.max(0, Math.min(1, parsed.sfxVolume)) : DEFAULT_SETTINGS.sfxVolume,
      musicVolume: typeof parsed.musicVolume === "number" ? Math.max(0, Math.min(1, parsed.musicVolume)) : DEFAULT_SETTINGS.musicVolume,
      musicGeneric: asTheme(parsed.musicGeneric, DEFAULT_SETTINGS.musicGeneric),
      musicInterstellar: asTheme(parsed.musicInterstellar, DEFAULT_SETTINGS.musicInterstellar),
      boardTheme: typeof parsed.boardTheme === "string" ? parsed.boardTheme : DEFAULT_SETTINGS.boardTheme,
      regionThemes: asStrRecord(parsed.regionThemes, () => true),
      regionMusic: asStrRecord<MusicTheme>(parsed.regionMusic, (val) => (MUSIC_THEMES as string[]).includes(val)),
      sceneOff: Array.isArray(parsed.sceneOff) ? parsed.sceneOff.filter((x) => typeof x === "string") : [],
      sceneConfig: parsed.sceneConfig && typeof parsed.sceneConfig === "object" ? (parsed.sceneConfig as Record<string, SceneOverride>) : {},
      decor: Array.isArray(parsed.decor) ? parsed.decor.filter((x) => typeof x === "string") : [],
      decorConfig: parsed.decorConfig && typeof parsed.decorConfig === "object" ? (parsed.decorConfig as Record<string, DecorOverride>) : {},
      difficulty: parsed.difficulty === "easy" || parsed.difficulty === "hard" ? parsed.difficulty : "medium",
      comboPicker: parsed.comboPicker !== false,
      choiceTimer: parsed.choiceTimer !== false,
      bankWindow: parsed.bankWindow === 5 ? 5 : 3,
      screenShake: parsed.screenShake !== false,
    };
  }
}

export function saveSettings(s: Settings): void {
  writeVersioned(KEY, s, SAVE_V);
}

/** Apply settings to the live document + audio. Safe to call before first paint
 *  (the data-* attributes only affect CSS, which reflows harmlessly). */
export function applySettings(s: Settings): void {
  // Reduce Motion (or the OS preference) wins over every advanced toggle, so the
  // effective values are computed once here and mirrored onto <html> / visualOptions.
  const reduced = motionReduced(s);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", s.theme);
    document.documentElement.setAttribute("data-motion", s.reduceMotion ? "reduced" : "full");
    // granular CSS gates — "off" only ever ADDS to what data-motion already freezes
    document.documentElement.setAttribute("data-tilt", !reduced && s.boardTilt ? "on" : "off");
    document.documentElement.setAttribute("data-ambient", !reduced && s.ambientFx ? "on" : "off");
  }
  visualOptions.boardZoom = !reduced && s.boardZoom;
  visualOptions.screenShake = !reduced && s.screenShake;
  sfx.setVolume(s.sfxVolume);
  music.setVolume(s.musicVolume);
  gameOptions.difficulty = s.difficulty;
  // HARD locks the pressure dials: 3s banking, combo picker + its timer always on.
  gameOptions.bankWindow = s.difficulty === "hard" ? 3 : s.bankWindow;
  gameOptions.comboPicker = s.difficulty === "hard" ? true : s.comboPicker;
  gameOptions.choiceTimer = s.difficulty === "hard" ? true : s.choiceTimer;
  gameOptions.choiceWindowMs = s.difficulty === "easy" ? 3000 : 2000;
  // engine-affecting knobs come from the SHARED difficulty table (runConfig.ts) —
  // the anti-cheat replay derives the same values server-side; they must never drift
  gameOptions.revealAt = DIFFICULTY_KNOBS[s.difficulty].revealAt;
  gameOptions.collapseShift = DIFFICULTY_KNOBS[s.difficulty].collapseShift;
}
