import defaults from "./content.json";

/**
 * CMS-backed game content. All player-facing copy (start screen, how-to-play
 * slides, combos legend, tutorial-level script, standard log lines) lives in
 * content.json, which is edited from the admin page (/admin.html) and published
 * as a git commit — Render redeploys and the game picks the new copy up here.
 *
 * DRAFT PREVIEW: the admin page saves unpublished edits to localStorage. When
 * the game is opened with ?cmspreview=1 (the admin's "Preview" button) those
 * drafts overlay the bundled defaults, so copy and levels can be play-tested
 * before publishing. Without the flag the game NEVER reads drafts.
 */
export type GameContent = typeof defaults;

// v2: v1 drafts predate draft/bundle reconciliation in the admin — a stale v1
// draft could pin old content (e.g. hide newly shipped how-to-play slides), so
// the key bump orphans them.
export const CONTENT_DRAFT_KEY = "glint.cms.draft.content.v2";
export const LEVELS_DRAFT_KEY = "glint.cms.draft.levels.v2";

export const DEFAULT_CONTENT: GameContent = defaults;

export function isCmsPreview(): boolean {
  try {
    return typeof location !== "undefined" && new URLSearchParams(location.search).has("cmspreview");
  } catch {
    return false;
  }
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Objects merge key-by-key; arrays and scalars replace wholesale. A draft is
 *  usually a FULL document, but merging keeps us safe when the bundled schema
 *  gained keys after the draft was saved. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (over === null || over === undefined) return base;
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== "object" || typeof over !== "object") {
    return over as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export const CONTENT: GameContent = (() => {
  if (!isCmsPreview()) return defaults;
  const draft = readDraft<Partial<GameContent>>(CONTENT_DRAFT_KEY);
  return draft ? deepMerge(defaults, draft) : defaults;
})();

/** Fill {placeholders} in a template. Unknown placeholders are left as-is so a
 *  typo in the CMS shows up literally instead of vanishing. */
export function fmt(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function logText(key: keyof GameContent["logTexts"], vars?: Record<string, string | number>): string {
  return fmt(CONTENT.logTexts[key] ?? DEFAULT_CONTENT.logTexts[key], vars);
}

/** Chain DISPLAY names come from the CMS (combos.chainsRows, positional) — the
 *  internal ChainName enum stays stable ("Sweep") for stored stats, while the
 *  player-facing label follows the CMS ("Turn"). */
const CHAIN_ROW_INDEX: Record<string, number> = { Convergence: 0, Harmony: 1, Accord: 2, Sweep: 3 };
export function chainLabel(name: string): string {
  const rows = CONTENT.combos?.chainsRows ?? DEFAULT_CONTENT.combos.chainsRows;
  const i = CHAIN_ROW_INDEX[name];
  return (i != null && rows[i]?.name) || name;
}

/** CMS-flagged STICKY log lines: their floating toast stays on screen until the
 *  next log entry replaces it (Admin › Logs, per-line checkbox; default off). */
export function logIsSticky(key: keyof GameContent["logTexts"]): boolean {
  const keys = (CONTENT as unknown as { logStickyKeys?: string[] }).logStickyKeys;
  return Array.isArray(keys) && keys.includes(key as string);
}
