/**
 * THEME — Chrome Abyss: Glint
 * ===========================
 * Hi-fi tokens from the design handoff (`design_handoff_glint/README.md`).
 * Dark mode is the hero; the values live as CSS custom properties in index.css
 * and are referenced here via var(). The per-gem hues are game content (constant
 * across themes) and are kept as literal hex.
 *
 *   Display — Chakra Petch (600/700): wordmark, score, headlines, big moments.
 *   Body    — Saira (300–700):        labels, descriptions, UI text.
 *   Mono    — Share Tech Mono (400):  kickers, values, technical labels.
 */

const v = (name: string) => `var(${name})`;

export const theme = {
  fonts: {
    /** display face — Chakra Petch */
    disp: `'Chakra Petch', system-ui, sans-serif`,
    /** body / base UI sans — Saira */
    sans: `'Saira', system-ui, sans-serif`,
    /** kickers + technical labels — Share Tech Mono */
    mono: `'Share Tech Mono', ui-monospace, monospace`,
    // kept for back-compat with any heading references
    heading: `'Chakra Petch', system-ui, sans-serif`,
  },

  color: {
    // surfaces
    bg: v("--bg"),
    panel: v("--panel"),
    panelHi: v("--panel-hi"),
    border: v("--border"),
    text: v("--text"),
    dim: v("--dim"),
    faint: v("--faint"),
    // brand & status
    accent: v("--accent"),
    gold: v("--gold"),
    good: v("--good"),
    bad: v("--bad"),
    pink: v("--pink"),
    shadow: v("--shadow"),
    // the holographic-chrome signature gradient (wordmark / big moments)
    gradient: "linear-gradient(100deg, #7fe9f5, #9d7bff 50%, #e08bff 85%)",
  },

  minerals: {
    1: { name: "Duneglass", shape: "circle" as const, hue: "#aeb6c2" },
    2: { name: "Vigilite", shape: "almond" as const, hue: "#c8922f" },
    3: { name: "Chromite", shape: "triangle" as const, hue: "#c2cad6" },
    4: { name: "Verdite", shape: "diamond" as const, hue: "#2fd27c" },
    5: { name: "Umbrite", shape: "pentagon" as const, hue: "#a24df0" },
    6: { name: "Nuracite", shape: "hexagon" as const, hue: "#3fd3e6" },
  },

  special: {
    /** value 0 — the gold trap; placing it always busts */
    glint: { name: "Dross", hue: "#e2b440" },
    /** value 7 — the prize Core / wildcard joker (+500) */
    core: { name: "Nebulite", hue: "#b36bf5" },
  },
} as const;

/* ---- depth-pass shared fragments (design_handoff_glint_depth §3) ----
   These read the --rg-* region-theme variables with the standard violet-slate
   look as the fallback, so a region level re-tints the whole chrome by setting
   CSS variables on the game shell (see theme/regions.ts). */

/** Beveled button: gradient face + rim + the thick dark bottom edge ("physical" depth). */
export const bevel = {
  background: "var(--rg-panel, linear-gradient(180deg,#1a1d2e,#101322))",
  border: "1px solid var(--rg-border, #2c2f4a)",
  borderBottom: "2.5px solid var(--rg-edge, #060810)",
  boxShadow: "0 6px 14px -4px rgba(0,0,0,0.6)",
} as const;

/** Beveled icon tile (inside footers / bars) — slightly lighter face. */
export const bevelIcon = {
  background: "var(--rg-tile, linear-gradient(180deg,#222639,#141726))",
  border: "1px solid var(--rg-border, #2c2f4a)",
  borderBottom: "2.5px solid var(--rg-edge, #060810)",
} as const;

/** Primary CTA bevel — the violet physical button with a glow shadow. */
export const bevelPrimary = {
  background: "linear-gradient(180deg,#e2c8ff,#b06bf5)",
  border: "none",
  borderBottom: "3px solid #7d3fc4",
  boxShadow: "0 10px 24px -6px rgba(176,107,245,0.7)",
  color: "#1a0b2e",
} as const;

/** Perspective card (no bevel): SCORE/BANKS/BUSTS, popups. */
export const cardFace = {
  background: "var(--rg-panel, linear-gradient(180deg,#1a1d2e,#101322))",
  border: "1px solid var(--rg-border, #2c2f4a)",
  borderRadius: 14,
  boxShadow: "0 12px 24px -8px rgba(0,0,0,0.7)",
} as const;

export type MineralValue = 1 | 2 | 3 | 4 | 5 | 6;
export type MineralShape = "circle" | "almond" | "triangle" | "diamond" | "pentagon" | "hexagon";
