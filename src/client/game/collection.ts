/**
 * COLLECTION — what the player owns.
 *
 * The catalogue (board themes, music tracks, the sticker book's sectors + stickers)
 * is CMS content (content.json → `collection`, edited at /admin.html). "Owned"
 * comes from two places, OR-ed together:
 *   1. the item's `unlocked` flag in the CMS — the designer can grant/preview, and
 *      it seeds the starter set every player begins with; and
 *   2. a per-device grant ledger in localStorage — where future reward-granting
 *      (a completed challenge earns its sticker) writes. The plumbing lives here so
 *      that wiring is a one-liner later; nothing calls grant*() yet.
 *
 * EQUIPPING lives in Settings, not here: which music track fills the generic /
 * interstellar slots, and which board theme tints quick / blank boards.
 */
import { readVersioned, writeVersioned, removeStored } from "./storage";
import { CONTENT } from "../content/content";
import type { MusicTheme } from "../audio/music";
import { measureRun } from "./challenges";
import type { ObjectiveType } from "./challenges";
import type { FinishedRun, LifetimeStats } from "./stats";
import { storedFrontier } from "../levels/progress";

// the feat that auto-earns a collectible (same vocabulary as daily challenges).
// scope "run" = achieved in a single game; "total" = a lifetime tally/flag.
export interface Trigger {
  trigger: string; // an ObjectiveType, or "" for no auto-grant
  target: number;
  scope: string; // "run" | "total"
}

// where a collectible lives: won in the Collection, or bought in the Shop
export interface Sourced {
  source: string; // "collection" | "shop"
  price: number; // Nebulite cost when source === "shop"
}

export interface ThemeItem extends Trigger, Sourced {
  key: string;
  name: string;
  region: string; // a REGIONS key, or "" for the standard violet board
  unlocked: boolean;
  standard?: boolean; // part of the factory set the player starts with
  image?: string; // CMS thumbnail — replaces the procedural preview when set
  desc?: string; // short shop-detail blurb (CMS-editable)
}
export interface MusicItem extends Trigger, Sourced {
  key: string;
  name: string;
  sub: string;
  theme: MusicTheme;
  unlocked: boolean;
  standard?: boolean;
  image?: string; // CMS thumbnail — replaces the note icon when set
  desc?: string; // short shop-detail blurb (CMS-editable)
}
export interface DecorItem {
  key: string;
  name: string;
  effect: string; // a built-in render key, or "customProp"/"customPattern" for CMS art
  kind: string; // "prop" | "particle" | "light" | "pattern"
  price: number;
  image: string; // custom art URL (props / patterns)
  unlocked: boolean;
  standard?: boolean; // baseline item — free and hidden from the Shop (Ascent elements)
  color?: string; // the effect's tint (CMS colour box; default violet #9d7bff)
  // one kind-specific dial: particle density / light intensity = "high"|"medium"|"low";
  // pattern tile size / prop size = "big"|"medium"|"small"
  option?: string;
  // 3D props: a .glb model URL (textures embedded). When set on a prop it
  // renders in 3D instead of the flat image; `anim` picks its idle motion.
  model?: string;
  anim?: string; // "spin" | "bob" | "spin-bob" | "fly-x" | "fly-y" | "fly-around" | "none" (default spin)
  // fly animations must know which way the model's NOSE points, so it can face
  // its direction of travel: an axis of the model file ("+x" … "-z")
  front?: string;
  // prop placement on the Ascent: anchor as a percent of the view (a per-key
  // scatter when unset), and the parallax plane it scrolls on
  x?: number; // 0–100, horizontal centre
  y?: number; // 0–100, vertical anchor
  depth?: string; // "far" | "mid" | "near" (default mid)
  desc?: string; // short shop-detail blurb (CMS-editable)
}

/** Shop display order: unowned first (the 2 priciest — the "premiums" — leading,
 *  then the rest woven low↔high so cheap and dear alternate), owned sink to the
 *  bottom. `price` is the premium signal, per the pricing model. */
export function shopOrder<T>(items: T[], isOwned: (t: T) => boolean, priceOf: (t: T) => number): T[] {
  const owned = items.filter(isOwned).sort((a, b) => priceOf(a) - priceOf(b));
  const unowned = items.filter((t) => !isOwned(t)).sort((a, b) => priceOf(b) - priceOf(a)); // dear→cheap
  const premiums = unowned.slice(0, 2); // the two priciest unowned
  const rest = unowned.slice(2).sort((a, b) => priceOf(a) - priceOf(b)); // cheap→dear
  const mixed: T[] = [];
  let lo = 0, hi = rest.length - 1;
  while (lo <= hi) {
    mixed.push(rest[lo++]);
    if (lo <= hi) mixed.push(rest[hi--]);
  }
  return [...premiums, ...mixed, ...owned];
}
export interface Sector {
  id: string;
  name: string;
}
export interface Sticker {
  id: string;
  sector: string; // a Sector id
  puzzleId?: string; // permanent link to a puzzle level (see LevelDef.puzzleId)
  name: string;
  image: string; // earned art URL ("" → a built-in placeholder emblem)
  outline: string; // outline art URL ("" → a built-in dashed slot)
  requirement: string; // the short challenge hint shown in a locked slot
  unlocked: boolean;
  // the feat that auto-earns this sticker (same vocabulary as daily challenges).
  // scope "run" = achieved in a single game; "total" = a lifetime tally/flag.
  trigger: string; // an ObjectiveType, or "" for no auto-grant
  target: number;
  scope: string; // "run" | "total"
}

type Kind = "themes" | "music" | "stickers" | "decor";

const GRANT_KEY = "glint.collection.v1";
const SAVE_V = 1; // bump + pass migrate() to readVersioned when Grants shape changes

interface Grants {
  themes: string[];
  music: string[];
  stickers: string[];
  decor: string[];
}

function loadGrants(): Grants {
  const g = readVersioned<Grants>(GRANT_KEY, { themes: [], music: [], stickers: [], decor: [] }, SAVE_V);
  return {
    themes: Array.isArray(g.themes) ? g.themes : [],
    music: Array.isArray(g.music) ? g.music : [],
    stickers: Array.isArray(g.stickers) ? g.stickers : [],
    decor: Array.isArray(g.decor) ? g.decor : [],
  };
}

/** Wipe all earned grants (used by Settings › Reset progress). */
export function resetCollection(): void {
  removeStored(GRANT_KEY);
}

/** Grant an item on this device (idempotent). For future reward-granting. */
export function grant(kind: Kind, key: string): void {
  // storage failures are swallowed by writeVersioned — the CMS `unlocked` flags
  // still drive ownership without persistence
  const g = loadGrants();
  if (!g[kind].includes(key)) {
    g[kind] = [...g[kind], key];
    writeVersioned(GRANT_KEY, g, SAVE_V);
  }
}

const owns = (kind: Kind, key: string, flag: boolean): boolean => flag || loadGrants()[kind].includes(key);

/* --------------------------- catalogue accessors --------------------------- */

export const themes = (): ThemeItem[] => CONTENT.collection.themes as ThemeItem[];
export const musicTracks = (): MusicItem[] => CONTENT.collection.music as unknown as MusicItem[];
export const sectors = (): Sector[] => CONTENT.collection.sectors as Sector[];
export const stickers = (): Sticker[] => CONTENT.collection.stickers as Sticker[];

export const themeOwned = (t: ThemeItem): boolean => owns("themes", t.key, t.unlocked);
export const musicOwned = (m: MusicItem): boolean => owns("music", m.key, m.unlocked);
export const stickerOwned = (s: Sticker): boolean => owns("stickers", s.id, s.unlocked);

export const decorItems = (): DecorItem[] => (CONTENT.collection.decor ?? []) as unknown as DecorItem[];
export const decorOwned = (d: DecorItem): boolean => owns("decor", d.key, d.unlocked);

/* ------------------------- Ascent scene elements -------------------------
 * The 3D Ascent scene's purchasable elements — the successor to the old decor
 * economy (whose items above are retired/archived). Each item maps 1:1 to a
 * scene element by name (`element`); placement/motion/effects live in the 3D
 * editor (demo.html), the CMS only sets name/description/price. Purchases
 * reuse the "decor" grants ledger. */

export interface AscentItem {
  key: string; // stable slug — the grants-ledger key
  element: string; // the scene object / atmosphere layer name in defaultScene()
  name: string;
  desc: string;
  price: number;
  unlocked: boolean;
  standard?: boolean; // part of the baseline background — free, never sold in the Shop
  image: string; // in-situ thumbnail (public/ascent-thumbs/<key>.webp)
}

// atmosphere layers (vs landmark objects) — used for grouping and shop labels
const ASCENT_PARTICLE = new Set(["dust", "comets", "gold-embers", "stardust-rain"]);
const ASCENT_LIGHT = new Set(["galaxy-glow", "aurora-veil", "solar-shafts"]);
const ASCENT_BG = new Set(["nebula", "stars", "crimson-drift", "emerald-abyss"]);
export const ascentIsSky = (a: AscentItem): boolean => ASCENT_PARTICLE.has(a.key) || ASCENT_LIGHT.has(a.key) || ASCENT_BG.has(a.key);
/** Which family an Ascent element belongs to — decides its Settings controls. */
export type AscentKind = "bg" | "light" | "particle" | "prop";
export const ascentKindOf = (key: string): AscentKind =>
  ASCENT_BG.has(key) ? "bg" : ASCENT_LIGHT.has(key) ? "light" : ASCENT_PARTICLE.has(key) ? "particle" : "prop";
/** The mutually-exclusive sky backgrounds (element names) — enabling one disables the others. */
export const ASCENT_BG_ELEMENTS = ["Nebula", "Crimson Drift", "Emerald Abyss"];
/** The baseline elements a reset returns to (the free standard background). */
export const ascentStandardElements = (): string[] => ascentItems().filter((a) => a.standard).map((a) => a.element);

export const ascentItems = (): AscentItem[] => (CONTENT.collection.ascent ?? []) as unknown as AscentItem[];
export const ascentOwned = (a: AscentItem): boolean => owns("decor", a.key, a.unlocked);

/** Ascent items shaped as DecorItems so the Shop's existing decor pipeline
 *  (cards, detail modal, buy flow) renders them without modification. */
export const ascentAsDecor = (): DecorItem[] =>
  ascentItems().map((a) => ({
    key: a.key,
    name: a.name,
    effect: "customProp",
    kind: ASCENT_PARTICLE.has(a.key) ? "particle" : ASCENT_LIGHT.has(a.key) ? "light" : ASCENT_BG.has(a.key) ? "pattern" : "prop",
    price: a.price,
    image: a.image,
    unlocked: a.unlocked,
    standard: a.standard,
    desc: a.desc,
  }));

/** Max simultaneously-active decor per kind. Each 3D prop is its own live
 *  WebGL context (browsers drop the oldest past ~16), so props are hard-capped;
 *  the full-screen effects (one background pattern / one particle field / one
 *  light) don't stack usefully and are limited to one each. Enforced both in the
 *  renderer (bounds contexts even for a pre-cap save) and the Decor settings UI. */
export const DECOR_LIMITS: Record<string, number> = { prop: 6, particle: 1, light: 1, pattern: 1 };

/** Trim an ordered list of active decor to the per-kind limits, keeping the
 *  earliest-enabled of each kind. */
export function capDecor<T extends { kind: string }>(list: T[]): T[] {
  const seen: Record<string, number> = {};
  return list.filter((d) => {
    const lim = DECOR_LIMITS[d.kind] ?? Infinity;
    const n = seen[d.kind] ?? 0;
    if (n >= lim) return false;
    seen[d.kind] = n + 1;
    return true;
  });
}

/** Music tracks the player can slot in Settings (owned only). */
export const ownedMusic = (): MusicItem[] => musicTracks().filter(musicOwned);

/* Collection vs Shop split (by the `source` flag). The Collection page shows its
 * own items PLUS any shop items you've bought, so bought themes/tracks stay
 * equippable there; the Shop shows only shop-source items. */
export const customiseThemes = (): ThemeItem[] => themes().filter((t) => t.source !== "shop" || themeOwned(t));
export const shopThemes = (): ThemeItem[] => themes().filter((t) => t.source === "shop");
export const customiseMusic = (): MusicItem[] => musicTracks().filter((m) => m.source !== "shop" || musicOwned(m));
export const shopMusic = (): MusicItem[] => musicTracks().filter((m) => m.source === "shop");

/** Find the track that carries a given theme (for showing its name in Settings). */
export const trackForTheme = (theme: MusicTheme): MusicItem | undefined => musicTracks().find((m) => m.theme === theme);

/** Sticker-book totals for the progress header. */
export function stickerProgress(): { owned: number; total: number } {
  const all = stickers();
  return { owned: all.filter(stickerOwned).length, total: all.length };
}

/* ------------------------------ auto-granting ------------------------------ */

// lifetime tally / flag behind a "total"-scope trigger
function statTotal(type: ObjectiveType, s: LifetimeStats): number {
  switch (type) {
    case "dross": return s.drossSwept;
    case "nebulite": return s.nebulitesAcquired;
    case "banks": return s.banksTotal;
    case "clear": return s.boardsCleared;
    case "fulldrift": return s.fullDrift ? 1 : 0;
    case "rush": return s.reachedRush ? 1 : 0;
    case "cashout": return s.cashedOut ? 1 : 0;
    case "score": return 0; // score is only meaningful per-run
    case "bankscore": return s.maxBankScore ?? 0; // lifetime BEST single bank
    case "convergence": return s.convergenceTotal ?? 0;
    case "harmony": return s.harmonyTotal ?? 0;
    case "accord": return s.accordTotal ?? 0;
    case "turn": return s.turnTotal ?? 0;
    default: return 0;
  }
}

// is a feat trigger satisfied by this run / the running tally?
function meets(t: { trigger: string; target: number; scope: string }, run: FinishedRun, stats: LifetimeStats): boolean {
  if (!t.trigger || !t.target) return false;
  // "level" — granted once the campaign has UNLOCKED level `target` (frontier ≥
  // target). Used by puzzle-board stickers: clearing the puzzle level unlocks the
  // next level, which grants its picture. Back-fills on any later run end too.
  if (t.trigger === "level") return storedFrontier() >= t.target;
  const type = t.trigger as ObjectiveType;
  return t.scope === "total" ? statTotal(type, stats) >= t.target : measureRun(type, run) >= t.target;
}

/** A collectible the player has just earned — drives the reward-reveal card. */
export interface EarnedReward {
  kind: "sticker" | "music" | "theme";
  key: string;
  name: string;
  image?: string; // sticker earned art / theme・music CMS thumbnail
  emblem?: number; // sticker placeholder-emblem index
  region?: string; // board-theme region (for the swatch)
}

/**
 * Called once a run has been folded into the lifetime stats: grant every
 * collectible (board theme, music track, sticker) whose feat is now satisfied —
 * run-scope by this game, or total-scope by the running tally. Idempotent:
 * already-owned items are skipped, so it also back-fills. Returns what was newly
 * earned, for the reward-reveal card.
 */
/**
 * Grant a specific Collection item by kind + id (used by a daily challenge whose
 * reward is a collectible). Returns the reward descriptor if it was newly granted,
 * or null if the item is unknown / already owned.
 */
export function earnItem(kind: "sticker" | "music" | "theme", id: string): EarnedReward | null {
  if (kind === "sticker") {
    const list = stickers();
    const i = list.findIndex((s) => s.id === id);
    if (i < 0 || stickerOwned(list[i])) return null;
    grant("stickers", id);
    return { kind: "sticker", key: list[i].id, name: list[i].name, image: list[i].image, emblem: i };
  }
  if (kind === "music") {
    const m = musicTracks().find((x) => x.key === id);
    if (!m || musicOwned(m)) return null;
    grant("music", id);
    return { kind: "music", key: m.key, name: m.name, image: m.image };
  }
  const t = themes().find((x) => x.key === id);
  if (!t || themeOwned(t)) return null;
  grant("themes", id);
  return { kind: "theme", key: t.key, name: t.name, region: t.region, image: t.image };
}

/** Display name for a collectible reward (for the Challenges list). */
export function itemName(kind: "sticker" | "music" | "theme", id: string): string {
  if (kind === "sticker") return stickers().find((s) => s.id === id)?.name ?? "Sticker";
  if (kind === "music") return musicTracks().find((m) => m.key === id)?.name ?? "Music track";
  return themes().find((t) => t.key === id)?.name ?? "Board theme";
}

/** Where a reward item currently LIVES for the player, so a Challenge/Milestone deep-link
 *  opens it on the right page: the Shop for an unowned shop-source item (it isn't in the
 *  Collection until owned), otherwise the Collection (stickers, won items, and any item
 *  the player already owns all live there). */
export function rewardTarget(kind: "sticker" | "music" | "theme", id: string): "shop" | "collection" {
  if (kind === "sticker") return "collection";
  if (kind === "music") {
    const m = musicTracks().find((x) => x.key === id);
    return m && m.source === "shop" && !musicOwned(m) ? "shop" : "collection";
  }
  const t = themes().find((x) => x.key === id);
  return t && t.source === "shop" && !themeOwned(t) ? "shop" : "collection";
}

/** Every Collection item referenced as a CHALLENGE reward (a daily's prize or a
 *  milestone tier's prize), as "kind:id". These items are granted by their
 *  challenge — their own feat trigger, if any, is ignored so a single source
 *  of truth decides when they arrive. */
export function challengeRewardRefs(): Set<string> {
  const refs = new Set<string>();
  const ch = CONTENT.challenges as {
    dailyBank?: { rewardKind?: string; rewardId?: string }[];
    milestones?: { tiers?: { rewardKind?: string; rewardId?: string }[] }[];
  };
  for (const b of ch?.dailyBank ?? []) {
    if (b.rewardKind && b.rewardKind !== "nebulite" && b.rewardId) refs.add(`${b.rewardKind}:${b.rewardId}`);
  }
  for (const m of ch?.milestones ?? []) {
    for (const t of m.tiers ?? []) {
      if (t.rewardKind && t.rewardKind !== "nebulite" && t.rewardId) refs.add(`${t.rewardKind}:${t.rewardId}`);
    }
  }
  return refs;
}

export function reconcileGrants(run: FinishedRun, stats: LifetimeStats): EarnedReward[] {
  const earned: EarnedReward[] = [];
  const challengeRefs = challengeRewardRefs(); // challenge-granted items skip feat evaluation
  themes().forEach((t) => {
    if (challengeRefs.has(`theme:${t.key}`)) return;
    if (!themeOwned(t) && meets(t, run, stats)) {
      grant("themes", t.key);
      earned.push({ kind: "theme", key: t.key, name: t.name, region: t.region, image: t.image });
    }
  });
  musicTracks().forEach((m) => {
    if (challengeRefs.has(`music:${m.key}`)) return;
    if (!musicOwned(m) && meets(m, run, stats)) {
      grant("music", m.key);
      earned.push({ kind: "music", key: m.key, name: m.name, image: m.image });
    }
  });
  stickers().forEach((s, i) => {
    if (challengeRefs.has(`sticker:${s.id}`)) return;
    if (!stickerOwned(s) && meets(s, run, stats)) {
      grant("stickers", s.id);
      earned.push({ kind: "sticker", key: s.id, name: s.name, image: s.image, emblem: i });
    }
  });
  return earned;
}
