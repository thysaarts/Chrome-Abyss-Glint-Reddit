/**
 * Procedural thumbnail art for board themes + music tracks — an on-brand abstract
 * cosmic composition (nebula wash, a hero orb, a faceted gem, sparkles) rendered
 * as a self-contained SVG data-URI. No AI, no network, deterministic per
 * (key + keywords + salt) so a "regenerate" just re-rolls the salt and overwrites.
 *
 * THEMES take their palette from the theme's real colours (its region accent, or
 * a keyword hint), so the thumbnail's colour matches the theme. MUSIC is fully
 * decorative — palette from keywords, with a sound-ring motif instead of a gem.
 */
import { REGIONS } from "../theme/regions";

// ---- deterministic RNG (mulberry32 over an FNV-1a hash) ----
function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- colour ----
function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round((h % 360 + 360) % 360)},${Math.round(s)}%,${Math.round(l)}%)`;
}
function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return h * 60;
}
// a few keyword → hue hints so a designer can steer the vibe
const KW_HUE: Record<string, number> = {
  candy: 330, sweet: 330, pink: 330, arcade: 288, retro: 288, neon: 300, synth: 285,
  ice: 200, frost: 200, glacial: 200, ocean: 205, water: 205, deep: 215,
  solar: 34, sun: 40, gold: 45, ember: 22, forge: 20, fire: 12, lava: 10,
  jungle: 130, verdant: 130, forest: 135, toxic: 95, acid: 90,
  void: 278, cosmic: 265, nebula: 262, royal: 255, spire: 248,
  gothic: 350, crimson: 354, blood: 356, requiem: 350, ruby: 348,
  shadow: 250, noir: 230, cyber: 190, nexus: 186, digital: 195,
};
function keywordHue(keywords: string): number | null {
  const kw = keywords.toLowerCase();
  for (const k in KW_HUE) if (kw.includes(k)) return KW_HUE[k];
  return null;
}

export interface ThumbInput {
  kind: "theme" | "music";
  key: string;
  keywords?: string;
  region?: string; // themes only — its REGIONS accent seeds the palette
  salt?: number; // regenerate bumps this for a different take
}

function baseHue(inp: ThumbInput): number {
  const kw = keywordHue(inp.keywords ?? "");
  if (kw != null) return kw;
  if (inp.kind === "theme" && inp.region) {
    const h = hexToHue(REGIONS[inp.region]?.accent ?? "");
    if (h != null) return h;
  }
  return hash((inp.keywords || "") + "·" + inp.key) % 360;
}

/** Build the thumbnail as an SVG data-URI. Default frame: wide for themes
 *  (matches the region card), square for music. */
export function procArt(inp: ThumbInput, w = inp.kind === "theme" ? 512 : 400, h = inp.kind === "theme" ? 232 : 400): string {
  const salt = inp.salt ?? 0;
  const r = rng(hash(inp.kind + inp.key + (inp.keywords ?? "")) + salt * 2654435761);
  const H = baseHue(inp);
  const primary = hsl(H, 72, 60);
  const secondary = hsl(H + 42, 66, 56);
  const accent = hsl(H - 46, 82, 66);
  const rr = (a: number, b: number) => +(a + r() * (b - a)).toFixed(1);

  const parts: string[] = [];
  // dark base
  parts.push(`<rect width='${w}' height='${h}' fill='#08060f'/>`);
  // two soft nebula glows
  parts.push(`<circle cx='${rr(0.18, 0.42) * w}' cy='${rr(0.1, 0.4) * h}' r='${rr(0.4, 0.62) * h}' fill='url(#neb1)'/>`);
  parts.push(`<circle cx='${rr(0.62, 0.9) * w}' cy='${rr(0.5, 0.92) * h}' r='${rr(0.34, 0.54) * h}' fill='url(#neb2)'/>`);
  // hero orb (a planet) low + off-centre
  const ox = rr(0.58, 0.82) * w, oy = rr(0.62, 0.86) * h, orad = rr(0.26, 0.4) * h;
  parts.push(`<circle cx='${ox}' cy='${oy}' r='${orad}' fill='url(#orb)'/>`);
  parts.push(`<ellipse cx='${ox - orad * 0.24}' cy='${oy - orad * 0.32}' rx='${orad * 0.42}' ry='${orad * 0.26}' fill='#fff' opacity='0.18'/>`);

  if (inp.kind === "music") {
    // sound rings — concentric arcs, decorative
    const cx = rr(0.24, 0.4) * w, cy = rr(0.36, 0.5) * h;
    for (let i = 1; i <= 4; i++) {
      parts.push(`<circle cx='${cx}' cy='${cy}' r='${i * rr(11, 15)}' fill='none' stroke='${accent}' stroke-width='${(5 - i) * 0.7}' opacity='${0.5 - i * 0.08}'/>`);
    }
  } else {
    // a faceted gem — ties to the game's crystal set
    const gx = rr(0.2, 0.4) * w, gy = rr(0.34, 0.52) * h, s = rr(0.14, 0.2) * h;
    parts.push(`<polygon points='${gx},${gy - s} ${gx + s * 0.8},${gy} ${gx},${gy + s} ${gx - s * 0.8},${gy}' fill='${accent}' opacity='0.92'/>`);
    parts.push(`<polygon points='${gx},${gy - s} ${gx + s * 0.8},${gy} ${gx},${gy}' fill='#fff' opacity='0.28'/>`);
  }

  // sparkles
  const stars = Math.round(14 + r() * 10);
  for (let i = 0; i < stars; i++) {
    parts.push(`<circle cx='${rr(0, 1) * w}' cy='${rr(0, 1) * h}' r='${rr(0.5, 1.6)}' fill='#fff' opacity='${rr(0.25, 0.85)}'/>`);
  }
  // a soft top-down vignette for depth
  parts.push(`<rect width='${w}' height='${h}' fill='url(#vin)'/>`);

  const defs =
    `<defs>` +
    `<radialGradient id='neb1'><stop offset='0' stop-color='${primary}' stop-opacity='0.5'/><stop offset='1' stop-color='${primary}' stop-opacity='0'/></radialGradient>` +
    `<radialGradient id='neb2'><stop offset='0' stop-color='${secondary}' stop-opacity='0.42'/><stop offset='1' stop-color='${secondary}' stop-opacity='0'/></radialGradient>` +
    `<radialGradient id='orb' cx='0.38' cy='0.32'><stop offset='0' stop-color='${primary}'/><stop offset='0.7' stop-color='${secondary}'/><stop offset='1' stop-color='#120a24'/></radialGradient>` +
    `<radialGradient id='vin' cx='0.5' cy='0.42' r='0.75'><stop offset='0.55' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#04030a' stop-opacity='0.6'/></radialGradient>` +
    `</defs>`;

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${defs}${parts.join("")}</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// suggestion chips surfaced under the keyword field in the CMS
export const THUMB_KEYWORD_SUGGESTIONS = [
  "neon", "retro", "candy", "ice", "solar", "ember", "jungle", "ocean", "void", "gothic", "cyber", "royal",
];
