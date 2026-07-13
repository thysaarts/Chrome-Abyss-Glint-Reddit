import { memo } from "react";
import { GLINT, CORE, TileVal } from "../game/engine";
import { MineralValue } from "../theme/theme";

/**
 * The faceted "Foundry-cut" gem set, ported 1:1 from the design handoff
 * (`design_handoff_glint/Gem.dc.html`). Every gem is a lit crystal built from
 * layered SVG polygons on a fixed 0 0 100 100 viewBox: a silhouette (mid hue) →
 * a darkened lower facet for depth → a lit table (light hue) → a white specular
 * catch → a thin rim. We render at the native 100×100 and scale via width/height,
 * so the geometry stays pixel-faithful at any size.
 *
 * Shape encodes value (1 circle · 2 almond · 3 triangle · 4 diamond · 5 pentagon
 * · 6 hexagon · Dross step-cut octagon · Nebulite rounded-square Core).
 */

type GemType =
  | "duneglass"
  | "vigilite"
  | "chromite"
  | "verdite"
  | "umbrite"
  | "nuracite"
  | "dross"
  | "nebulite"
  | "resurrect"
  | "quadriant"
  | "superluminal";

const TYPE_OF: Record<number, GemType> = {
  1: "duneglass",
  2: "vigilite",
  3: "chromite",
  4: "verdite",
  5: "umbrite",
  6: "nuracite",
  0: "dross", // GLINT
  7: "nebulite", // CORE
  8: "resurrect", // RESURRECT — heart
  9: "quadriant", // QUADRIANT — ruby radiant
  10: "superluminal", // SUPERLUMINAL — elongated hex
};

interface TileGemProps {
  value: TileVal;
  size: number; // px footprint
  dim?: boolean; // inert / non-interactive look
  jokerValue?: number; // if this is a Nebulite mirroring a mineral, the mineral value (1-6)
}

// Memoized: a pure function of its four scalar props, and the board renders up
// to ~91 of these per frame during animations — unchanged gems skip their whole
// SVG subtree.
// The three ACHIEVEMENT BONUS GEMS carry a bright halo in a lighter tone of the
// gem, so they read as special wherever they render (board, achievements case,
// flying overlay). Suppressed when the gem is dimmed (a locked achievement).
const BONUS_GLOW: Record<number, string> = {
  8: "#FF6E8E", // Resurrect — lighter red
  9: "#FF8496", // Quadriant — lighter ruby
  10: "#E4FF6B", // Zenith — lighter lime
};

export const TileGem = memo(function TileGem({ value, size, dim, jokerValue }: TileGemProps) {
  // A Nebulite acting as a joker renders the mimicked mineral's gem, wrapped in
  // the purple Core ring so it still reads as a Nebulite.
  const isJoker = value === CORE && jokerValue != null;
  const type: GemType = isJoker ? TYPE_OF[jokerValue as MineralValue] : TYPE_OF[value as number];
  const glow = !dim ? BONUS_GLOW[value as number] : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        display: "block",
        overflow: "visible",
        opacity: dim ? 0.42 : 1,
        filter: glow ? `drop-shadow(0 0 4px ${glow}) drop-shadow(0 0 9px ${glow})` : undefined,
      }}
    >
      {GEMS[type]}
      {isJoker && <JokerRing />}
    </svg>
  );
});

/** The purple Core ring + orbiting sparkle dots, drawn over a mirrored gem. */
function JokerRing() {
  return (
    <>
      <rect x="12" y="12" width="76" height="76" rx="22" fill="none" stroke="#E0BBFF" strokeWidth="2.2" opacity="0.85" />
      <rect x="7" y="7" width="86" height="86" rx="26" fill="none" stroke="#C99CFF" strokeWidth="1.6" opacity="0.45" />
      <circle cx="50" cy="8" r="2.2" fill="#F4E6FF" opacity="0.9" />
      <circle cx="92" cy="50" r="2.2" fill="#F4E6FF" opacity="0.7" />
      <circle cx="50" cy="92" r="2.2" fill="#F4E6FF" opacity="0.5" />
      <circle cx="8" cy="50" r="2.2" fill="#F4E6FF" opacity="0.7" />
    </>
  );
}

// Each entry is the gem's layered facet content (ported from Gem.dc.html).
const GEMS: Record<GemType, JSX.Element> = {
  duneglass: (
    <>
      <circle cx="50" cy="51" r="47" fill="#C8D2E1" opacity="0.05" />
      <circle cx="50" cy="51" r="43" fill="#C8D2E1" opacity="0.09" />
      <circle cx="50" cy="50" r="40" fill="#AEB6C2" />
      <circle cx="48" cy="46" r="33" fill="#C2C9D5" opacity="0.92" />
      <circle cx="46" cy="43" r="22" fill="#E2E7EF" opacity="0.85" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="#EFF3F8" strokeWidth="0.7" opacity="0.22" />
      <ellipse cx="42" cy="37" rx="9" ry="5.4" fill="#ffffff" opacity="0.78" transform="rotate(-32 42 37)" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#EAEEF4" strokeWidth="1.1" opacity="0.35" />
    </>
  ),
  vigilite: (
    <>
      <path d="M50,3 Q80,50 50,97 Q20,50 50,3 Z" fill="#F2C97A" opacity="0.07" />
      <path d="M50,8 Q74,50 50,92 Q26,50 50,8 Z" fill="#C8922F" />
      <path d="M50,8 Q74,50 50,92 L50,8 Z" fill="#6E4E18" opacity="0.6" />
      <path d="M50,15 Q60,50 50,85 Q40,50 50,15 Z" fill="#F6D789" opacity="0.85" />
      <path d="M50,18 Q55,50 50,82 Q46,50 50,18 Z" fill="#FFF0C8" opacity="0.7" />
      <ellipse cx="47" cy="26" rx="3.4" ry="7" fill="#ffffff" opacity="0.6" transform="rotate(-14 47 26)" />
      <path d="M50,8 Q74,50 50,92 Q26,50 50,8 Z" fill="none" stroke="#F6D789" strokeWidth="1" opacity="0.4" />
    </>
  ),
  chromite: (
    <>
      <polygon points="50,2 94,77 6,77" fill="#E2E8F0" opacity="0.06" />
      <polygon points="50,7 90,74 10,74" fill="#C2CAD6" />
      <polygon points="50,7 90,74 50,74" fill="#8A93A3" opacity="0.55" />
      <polygon points="50,25 71,65 29,65" fill="#FFFFFF" opacity="0.9" />
      <polygon points="50,25 71,65 50,65" fill="#C8CFDA" opacity="0.7" />
      <line x1="50" y1="7" x2="50" y2="74" stroke="#8A93A3" strokeWidth="0.8" opacity="0.4" />
      <polygon points="50,18 39,40 47,42" fill="#ffffff" opacity="0.75" />
      {/* CHROMIUM read: a DOUBLE outline — a black edge haloed in white — so it
          stands off the dark board and reads as chrome, apart from Duneglass */}
      <polygon points="50,7 90,74 10,74" fill="none" stroke="#F4F7FB" strokeWidth="3.4" opacity="0.92" />
      <polygon points="50,7 90,74 10,74" fill="none" stroke="#1B2028" strokeWidth="1.7" opacity="0.98" />
    </>
  ),
  verdite: (
    <>
      <polygon points="50,1 89,50 50,99 11,50" fill="#5FF0A6" opacity="0.07" />
      <polygon points="50,5 85,50 50,95 15,50" fill="#2FD27C" />
      <polygon points="15,50 50,95 85,50 66,50 50,72 34,50" fill="#138A4E" opacity="0.6" />
      <polygon points="50,28 66,50 50,72 34,50" fill="#9CFFC8" opacity="0.9" />
      <polygon points="50,28 66,50 50,50 34,50" fill="#C8FFE2" opacity="0.7" />
      <g stroke="#138A4E" strokeWidth="0.8" opacity="0.4">
        <line x1="50" y1="28" x2="50" y2="5" />
        <line x1="66" y1="50" x2="85" y2="50" />
        <line x1="50" y1="72" x2="50" y2="95" />
        <line x1="34" y1="50" x2="15" y2="50" />
      </g>
      <polygon points="50,30 37,49 44,50 50,40" fill="#ffffff" opacity="0.7" />
      <polygon points="50,5 85,50 50,95 15,50" fill="none" stroke="#7BFFB8" strokeWidth="1" opacity="0.4" />
    </>
  ),
  umbrite: (
    <>
      <polygon points="50,1 95.5,34.4 78,89 22,89 4.5,34.4" fill="#C68BFF" opacity="0.07" />
      <polygon points="50,6 91.8,36.4 75.9,85.6 24.1,85.6 8.2,36.4" fill="#A24DF0" />
      <polygon points="24.1,85.6 75.9,85.6 61.2,65.4 38.8,65.4" fill="#6A24A8" opacity="0.6" />
      <polygon points="50,31 68.1,44.1 61.2,65.4 38.8,65.4 31.9,44.1" fill="#D6A6FF" opacity="0.9" />
      <polygon points="50,31 31.9,44.1 45,52 50,40" fill="#EBD4FF" opacity="0.7" />
      <g stroke="#6A24A8" strokeWidth="0.8" opacity="0.4">
        <line x1="50" y1="31" x2="50" y2="6" />
        <line x1="68.1" y1="44.1" x2="91.8" y2="36.4" />
        <line x1="61.2" y1="65.4" x2="75.9" y2="85.6" />
        <line x1="38.8" y1="65.4" x2="24.1" y2="85.6" />
        <line x1="31.9" y1="44.1" x2="8.2" y2="36.4" />
      </g>
      <polygon points="50,31 31.9,44.1 40,47 50,37" fill="#ffffff" opacity="0.6" />
      <polygon points="50,6 91.8,36.4 75.9,85.6 24.1,85.6 8.2,36.4" fill="none" stroke="#D08BFF" strokeWidth="1" opacity="0.4" />
    </>
  ),
  nuracite: (
    <>
      <polygon points="50,2 92.4,26 92.4,74 50,98 7.6,74 7.6,26" fill="#7FEAF5" opacity="0.08" />
      <polygon points="50,8 86.4,29 86.4,71 50,92 13.6,71 13.6,29" fill="#3FD3E6" />
      <polygon points="13.6,71 50,92 86.4,71 66.5,59.5 50,69 33.5,59.5" fill="#1E8E9E" opacity="0.6" />
      <polygon points="50,31 66.5,40.5 66.5,59.5 50,69 33.5,59.5 33.5,40.5" fill="#C5FBFF" opacity="0.92" />
      <polygon points="50,31 66.5,40.5 50,50 33.5,40.5" fill="#E8FEFF" opacity="0.7" />
      <g stroke="#1E8E9E" strokeWidth="0.8" opacity="0.4">
        <line x1="50" y1="31" x2="50" y2="8" />
        <line x1="66.5" y1="40.5" x2="86.4" y2="29" />
        <line x1="66.5" y1="59.5" x2="86.4" y2="71" />
        <line x1="50" y1="69" x2="50" y2="92" />
        <line x1="33.5" y1="59.5" x2="13.6" y2="71" />
        <line x1="33.5" y1="40.5" x2="13.6" y2="29" />
      </g>
      <polygon points="50,31 33.5,40.5 41,44 50,37" fill="#ffffff" opacity="0.72" />
      {/* a BRIGHT blue outline so Nuracite reads as blue, apart from the near-whites */}
      <polygon points="50,8 86.4,29 86.4,71 50,92 13.6,71 13.6,29" fill="none" stroke="#4FB4FF" strokeWidth="2.1" opacity="1" />
    </>
  ),
  dross: (
    <>
      <polygon points="67.2,2 97,30 97,70 67.2,98 32.8,98 3,70 3,30 32.8,2" fill="#FFD24A" opacity="0.14" />
      <polygon points="67.2,5 92.5,30 92.5,70 67.2,95 32.8,95 7.5,70 7.5,30 32.8,5" fill="#FFCB3A" opacity="0.12" />
      <polygon points="67.2,8.4 91.6,32.8 91.6,67.2 67.2,91.6 32.8,91.6 8.4,67.2 8.4,32.8 32.8,8.4" fill="#E2B440" />
      <polygon points="8.4,67.2 32.8,91.6 67.2,91.6 91.6,67.2 70.8,58.6 58.6,70.8 41.4,70.8 29.2,58.6" fill="#A8801E" opacity="0.5" />
      <polygon points="63.76,16.72 83.28,36.24 83.28,63.76 63.76,83.28 36.24,83.28 16.72,63.76 16.72,36.24 36.24,16.72" fill="#EFC94E" />
      <polygon points="36.24,16.72 63.76,16.72 58.6,29.2 41.4,29.2" fill="#FDEDB0" opacity="0.92" />
      <polygon points="58.6,29.2 70.8,41.4 70.8,58.6 58.6,70.8 41.4,70.8 29.2,58.6 29.2,41.4 41.4,29.2" fill="#F8DC82" />
      <polygon points="58.6,29.2 70.8,41.4 50,50 41.4,29.2" fill="#FFF4CC" opacity="0.66" />
      <path d="M43,33 L45,40.5 L52.5,42.5 L45,44.5 L43,52 L41,44.5 L33.5,42.5 L41,40.5 Z" fill="#ffffff" opacity="0.92" />
      <path d="M55,33 L60,47 L56,60" fill="none" stroke="#7A5A12" strokeWidth="1.1" opacity="0.45" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points="61,61 70.8,58.6 64,72 56,67" fill="#8F8458" opacity="0.34" />
      <polygon points="29.2,52 40,66 33,70 29.2,59" fill="#9FC24A" opacity="0.17" />
      <polygon points="67.2,8.4 91.6,32.8 91.6,67.2 67.2,91.6 32.8,91.6 8.4,67.2 8.4,32.8 32.8,8.4" fill="none" stroke="#FFD24A" strokeWidth="1.1" opacity="0.55" />
    </>
  ),
  // RESURRECT — a wide, DARK-RED faceted HEART (Invincible: recover a bust / add a life)
  resurrect: (
    <>
      <path d="M50,34 C50,20 28,9 16,24 C5,37 12,55 50,86 C88,55 95,37 84,24 C72,9 50,20 50,34 Z" fill="#C83048" opacity="0.1" />
      <path d="M50,33 C50,19 29,9 17,23 C6,36 12,54 50,85 C88,54 94,36 83,23 C71,9 50,19 50,33 Z" fill="#8E1228" />
      <path d="M17,46 C24,62 38,74 50,85 C62,74 76,62 83,46 C70,56 58,60 50,60 C42,60 30,56 17,46 Z" fill="#4A0812" opacity="0.55" />
      <path d="M50,40 C50,30 37,24 30,33 C24,41 32,53 50,71 C68,53 76,41 70,33 C63,24 50,30 50,40 Z" fill="#C23048" opacity="0.9" />
      <path d="M50,40 C50,31 40,26 33,32 C28,38 34,49 50,64 L50,40 Z" fill="#E05068" opacity="0.6" />
      {/* brilliant-heart facet lines (cf. the reference cut): cleft + lobe rays */}
      <g stroke="#4A0812" strokeWidth="0.9" opacity="0.5" strokeLinecap="round">
        <path d="M50,33 L50,71" fill="none" /><path d="M31,25 L50,50" fill="none" /><path d="M69,25 L50,50" fill="none" />
        <path d="M50,85 L50,58" fill="none" /><path d="M22,42 L44,52" fill="none" /><path d="M78,42 L56,52" fill="none" />
      </g>
      <ellipse cx="35" cy="34" rx="6.5" ry="3.6" fill="#ffffff" opacity="0.75" transform="rotate(-28 35 34)" />
      <path d="M50,33 C50,19 29,9 17,23 C6,36 12,54 50,85 C88,54 94,36 83,23 C71,9 50,19 50,33 Z" fill="none" stroke="#C23048" strokeWidth="1.2" opacity="0.55" />
    </>
  ),
  // QUADRIANT — a ruby EMERALD-CUT: a taller-than-wide octagon (Centurion turned
  // 90°) with step-cut facets; the brightest red
  quadriant: (
    <>
      <polygon points="38,3 62,3 79,22 79,78 62,97 38,97 21,78 21,22" fill="#FF7A8A" opacity="0.1" />
      <polygon points="39,8 61,8 75,24 75,76 61,92 39,92 25,76 25,24" fill="#D51E3C" />
      <polygon points="25,76 39,92 61,92 75,76 65,68 57,80 43,80 35,68" fill="#7C0E22" opacity="0.55" />
      <polygon points="43,20 57,20 65,30 65,70 57,80 43,80 35,70 35,30" fill="#FF4A62" opacity="0.9" />
      <polygon points="46,30 54,30 60,37 60,63 54,70 46,70 40,63 40,37" fill="#FF7A8C" opacity="0.85" />
      <polygon points="46,30 54,30 60,37 50,50 40,37" fill="#FFC2CC" opacity="0.7" />
      {/* step-cut corner facets — outer corners into the table */}
      <g stroke="#7C0E22" strokeWidth="0.8" opacity="0.4">
        <line x1="75" y1="24" x2="65" y2="30" /><line x1="75" y1="76" x2="65" y2="70" />
        <line x1="25" y1="24" x2="35" y2="30" /><line x1="25" y1="76" x2="35" y2="70" />
        <line x1="39" y1="8" x2="43" y2="20" /><line x1="61" y1="8" x2="57" y2="20" />
        <line x1="39" y1="92" x2="43" y2="80" /><line x1="61" y1="92" x2="57" y2="80" />
      </g>
      <path d="M47,34 L49,41 L56,43 L49,45 L47,52 L45,45 L38,43 L45,41 Z" fill="#ffffff" opacity="0.85" />
      <polygon points="39,8 61,8 75,24 75,76 61,92 39,92 25,76 25,24" fill="none" stroke="#FF9AA8" strokeWidth="1.1" opacity="0.55" />
    </>
  ),
  // ZENITH (Superluminal reward) — the elongated hexagon in a FLUORESCENT lime
  // that reads apart from every other tile
  superluminal: (
    <>
      <polygon points="50,1 77,28 77,72 50,99 23,72 23,28" fill="#DBFF66" opacity="0.14" />
      <polygon points="50,5 74,30 74,70 50,95 26,70 26,30" fill="#9BE00A" />
      <polygon points="26,70 50,95 74,70 63,60 50,72 37,60" fill="#3E5C00" opacity="0.55" />
      <polygon points="50,22 66,38 66,62 50,78 34,62 34,38" fill="#C6FF4D" opacity="0.92" />
      <polygon points="50,22 66,38 50,50 34,38" fill="#EEFFB0" opacity="0.75" />
      <g stroke="#3E5C00" strokeWidth="0.7" opacity="0.4">
        <line x1="50" y1="22" x2="50" y2="5" /><line x1="66" y1="38" x2="74" y2="30" />
        <line x1="66" y1="62" x2="74" y2="70" /><line x1="50" y1="78" x2="50" y2="95" />
        <line x1="34" y1="62" x2="26" y2="70" /><line x1="34" y1="38" x2="26" y2="30" />
      </g>
      <polygon points="50,24 39,39 46,42 50,32" fill="#ffffff" opacity="0.85" />
      <polygon points="50,5 74,30 74,70 50,95 26,70 26,30" fill="none" stroke="#EAFF8A" strokeWidth="1.2" opacity="0.6" />
    </>
  ),
  nebulite: (
    <>
      <rect x="6" y="6" width="88" height="88" rx="26" fill="#C99CFF" opacity="0.1" />
      <rect x="12" y="12" width="76" height="76" rx="22" fill="#B36BF5" />
      <rect x="12" y="50" width="76" height="38" rx="0" fill="#7E3FD0" opacity="0.5" />
      <polygon points="50,20 80,50 50,80 20,50" fill="#E9CCFF" opacity="0.88" />
      <polygon points="50,20 80,50 50,50 20,50" fill="#F4E6FF" opacity="0.65" />
      <circle cx="50" cy="50" r="11" fill="#FBF2FF" opacity="0.85" />
      <circle cx="50" cy="50" r="5" fill="#ffffff" />
      <rect x="12" y="12" width="76" height="76" rx="22" fill="none" stroke="#E0BBFF" strokeWidth="1.6" opacity="0.6" />
      <rect x="7" y="7" width="86" height="86" rx="26" fill="none" stroke="#C99CFF" strokeWidth="1.4" opacity="0.5" />
      <circle cx="50" cy="8" r="2.2" fill="#F4E6FF" opacity="0.9" />
      <circle cx="92" cy="50" r="2.2" fill="#F4E6FF" opacity="0.7" />
      <circle cx="50" cy="92" r="2.2" fill="#F4E6FF" opacity="0.5" />
      <circle cx="8" cy="50" r="2.2" fill="#F4E6FF" opacity="0.7" />
    </>
  ),
};

export { GLINT, CORE };
