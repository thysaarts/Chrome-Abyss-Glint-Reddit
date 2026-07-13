/**
 * getimg.ai thumbnail generation — client side of the Cloudflare Worker proxy
 * (worker/getimg-proxy.js). Builds the prompt in the game's signature style and
 * sends it to the proxy (which holds the key and calls getimg.ai). Returns the
 * finished image as a data-URI. Caller handles fallback when unconfigured.
 *
 * Recipe matches the batch that produced the shipped set: Nano Banana 2, the
 * bold black-outline sticker style referenced from three stickers, board themes
 * ABSTRACT and led by the theme's own colour, music DETAILED per track.
 */
import { REGIONS } from "../theme/regions";

export interface GetimgCfg {
  proxyUrl?: string;
  token?: string;
  model?: string;
  elements?: string; // comma-separated element ids (getimg-native models only)
  weight?: number;
  reference?: string; // override the default style references
}

export const getimgConfigured = (cfg: GetimgCfg): boolean => !!(cfg.proxyUrl && cfg.proxyUrl.trim());

// the game's own sticker art — used as style references so generations match the
// bold black-outline look. Public URLs (getimg fetches them server-side).
const STYLE_REFS = [
  "https://chrome-abyss-glint.onrender.com/stickers/ember-image.webp",
  "https://chrome-abyss-glint.onrender.com/stickers/asteroid-image.webp",
  "https://chrome-abyss-glint.onrender.com/stickers/asteroids-image.webp",
];

// "bold clean outline, crisp EVEN linework" (not "thick") keeps the outline
// tasteful rather than heavy on re-rolls.
const OUTLINE = "bold clean BLACK OUTLINES around every shape, crisp even medium-weight ink linework (not too thick), flat cel-shaded game-sticker illustration style matching the reference images";
const BASE = "crystalline gemstone accents, dark starfield background, centered composition";
const NOTEXT = ". Absolutely no text, words, letters, numbers, logos or typography — purely a visual illustration";

// hue → colour phrase, so a board theme's illustration is led by its own colour.
// Exported so the CMS can PRE-FILL the keyword field with it (editable).
export function colourPhrase(region?: string, keywords?: string): string {
  const kw = (keywords ?? "").toLowerCase();
  if (kw.includes("slate")) return "cool slate grey and soft violet";
  const KW: Record<string, number> = { candy: 330, arcade: 300, neon: 300, velvet: 322, lounge: 322, ice: 200, frost: 200, ocean: 205, solar: 34, sun: 40, gold: 45, ember: 20, forge: 22, fire: 12, jungle: 130, verdant: 130, toxic: 95, void: 278, cosmic: 265, gothic: 350, crimson: 354, requiem: 354, ruby: 348, shadow: 235, cyber: 190, nexus: 190 };
  let hue: number | null = null;
  for (const k in KW) if (kw.includes(k)) { hue = KW[k]; break; }
  if (hue == null && region && REGIONS[region]) hue = hexToHue(REGIONS[region].accent);
  if (hue == null) return "vibrant cosmic colour";
  const H = ((hue % 360) + 360) % 360;
  if (H < 16) return "crimson red and rose";
  if (H < 45) return "molten amber, ember orange and bronze";
  if (H < 70) return "gold and warm yellow";
  if (H < 160) return "emerald and lime green";
  if (H < 200) return "teal and aqua";
  if (H < 250) return "electric blue and cyan";
  if (H < 292) return "deep violet and purple";
  if (H < 330) return "hot magenta and neon pink";
  return "rose pink and magenta";
}
function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

const NOCHAR = ", no people, no human figures, no characters, no creatures";

function buildPrompt(kind: "theme" | "music", name: string, keywords?: string, region?: string): string {
  if (kind === "theme") {
    // the keyword field carries the colour (pre-filled, editable); fall back to
    // the auto-derived phrase if it's been cleared.
    const colour = (keywords && keywords.trim()) || colourPhrase(region, name);
    return `an ABSTRACT, minimalist thumbnail — a small cluster of a few large faceted gemstone shards and flowing colour, NOT a detailed scene, no machinery, low detail, generous negative space, dominated by ${colour}, ${OUTLINE}, soft cosmic colour flow, ${BASE}${NOCHAR}${NOTEXT}`;
  }
  const vibe = keywords && keywords.trim() ? ` — ${keywords.trim()}` : "";
  return `a detailed cover illustration evoking ${name}${vibe}, ${OUTLINE}, ${BASE}${NOCHAR}${NOTEXT}`;
}

export async function generateThumb(
  cfg: GetimgCfg,
  opts: { kind: "theme" | "music"; name: string; keywords?: string; region?: string; aspect: string; seed?: number }
): Promise<string> {
  const body: Record<string, unknown> = {
    model: (cfg.model && cfg.model.trim()) || "gemini-3-1-flash-image", // Nano Banana 2
    prompt: buildPrompt(opts.kind, opts.name, opts.keywords, opts.region),
    aspect_ratio: opts.aspect,
    output_format: "webp",
    resolution: "1K",
  };
  if (typeof opts.seed === "number") body.seed = opts.seed;
  const ids = (cfg.elements ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length) body.elements = ids.map((id) => ({ id, weight: cfg.weight ?? 0.85 }));
  const refs = cfg.reference && cfg.reference.trim() ? [cfg.reference.trim()] : STYLE_REFS;
  body.images = refs.map((url) => ({ url, role: "reference_image" }));

  const res = await fetch(cfg.proxyUrl as string, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cfg.token ? { "x-cms-token": cfg.token } : {}) },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { dataUri?: string; error?: string };
  if (!res.ok || !j.dataUri) throw new Error(j.error || `getimg proxy error (${res.status})`);
  return j.dataUri;
}
