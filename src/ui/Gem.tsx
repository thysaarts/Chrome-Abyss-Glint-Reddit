/**
 * A faceted collectible GEM — used for the reward badges on the Achievements
 * page. Cut shapes deliberately distinct from the game's flat matte tiles, with
 * light-shaded facets for depth and a periodic shimmer sweep + twinkle for glint.
 * Earned = vivid colour + glow + shimmer; locked = grey, dimmed, with a lock.
 */

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return "#" + [f(r), f(g), f(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function ngon(count: number, cx: number, cy: number, r: number, rot = 0): [number, number][] {
  const p: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = ((rot + (i * 360) / count - 90) * Math.PI) / 180;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
}
const CX = 25, CY = 27;
const SHAPES: Record<string, [number, number][]> = {
  hexagon: ngon(6, CX, CY, 18),
  heptagon: ngon(7, CX, CY, 19),
  nonagon: ngon(9, CX, CY, 19),
  octagon: ngon(8, CX, CY, 18, 22.5),
  invtri: [[6, 15], [44, 15], [25, 47]],
  kite: [[16, 10], [34, 10], [42, 24], [25, 47], [8, 24]],
  marquise: [[25, 4], [36, 27], [25, 50], [14, 27]],
  emerald: [[13, 10], [37, 10], [44, 17], [44, 37], [37, 44], [13, 44], [6, 37], [6, 17]],
  lozenge: [[25, 10], [45, 27], [25, 44], [5, 27]],
  pear: [[25, 5], [34, 15], [38, 29], [31, 42], [19, 42], [12, 29], [16, 15]],
  // trillion cut — a soft triangle (the Harmonizer chain badge)
  trillion: [[25, 7], [43, 22], [37, 44], [13, 44], [7, 22]],
  // square cut — the Four Corners full-square-board badge (slightly rectangular)
  square: [[9, 12], [41, 12], [41, 42], [9, 42]],
  // an uncut stone — the Milestoner badge: half the size of the cut gems,
  // so it clearly reads as a humble pebble among jewels
  stone: [[20.2, 16.8], [28.7, 15.8], [33.7, 21.2], [33.2, 29.2], [27.7, 34.8], [19.7, 33.2], [15.2, 25.8], [16.7, 19.2]],
};

let gemUid = 0;

export function Gem({ shape, color, earned, size = 52, index = 0 }: { shape: string; color: string; earned: boolean; size?: number; index?: number }) {
  const pts = SHAPES[shape] ?? SHAPES.hexagon;
  const col = earned ? color : "#3a3d5a";
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const ptsStr = pts.map((p) => p.join(",")).join(" ");
  const uid = `gem${gemUid++}`;

  // light from the top-left — facets facing it are brighter, giving cut depth
  const L: [number, number] = [-0.55, -0.83];
  const facets = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
    const len = Math.hypot(mx, my) || 1;
    const b = (mx / len) * L[0] + (my / len) * L[1];
    return { tri: `${cx},${cy} ${p[0]},${p[1]} ${q[0]},${q[1]}`, fill: shade(col, earned ? 0.34 * b : 0.18 * b) };
  });

  return (
    <svg
      viewBox="0 0 50 56"
      width={size}
      height={Math.round((size * 56) / 50)}
      style={{ filter: earned ? `drop-shadow(0 0 7px ${col}88) drop-shadow(0 2px 3px rgba(0,0,0,0.5))` : "none", opacity: earned ? 1 : 0.62, overflow: "visible" }}
    >
      <defs>
        <clipPath id={`${uid}c`}>
          <polygon points={ptsStr} />
        </clipPath>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.65" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* faceted body */}
      {facets.map((f, i) => (
        <polygon key={i} points={f.tri} fill={f.fill} />
      ))}
      {/* facet edges (culet spokes) */}
      {pts.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke={shade(col, 0.42)} strokeWidth={0.5} opacity={earned ? 0.5 : 0.35} />
      ))}
      {/* rim */}
      <polygon points={ptsStr} fill="none" stroke={shade(col, earned ? 0.5 : 0.3)} strokeWidth={1.3} strokeLinejoin="round" />
      {/* table specular */}
      <ellipse cx={cx - 4.5} cy={cy - 7} rx={4.5} ry={2.6} fill="#fff" opacity={earned ? 0.5 : 0.14} transform={`rotate(-24 ${cx - 4.5} ${cy - 7})`} />

      {/* shimmer sweep + twinkle (earned only) */}
      {earned && (
        <>
          <g clipPath={`url(#${uid}c)`}>
            <g transform={`rotate(16 ${cx} ${cy})`}>
              <rect className="gl-gem-shim" x={cx - 26} y={cy - 34} width={13} height={68} fill={`url(#${uid}s)`} style={{ animationDelay: `${(index % 6) * 0.5}s` }} />
            </g>
          </g>
          <g className="gl-gem-twinkle" transform={`translate(${cx + 6}, ${cy - 9})`} style={{ animationDelay: `${1 + (index % 5) * 0.7}s` }}>
            <path d="M0 -3 L0.8 -0.8 L3 0 L0.8 0.8 L0 3 L-0.8 0.8 L-3 0 L-0.8 -0.8 Z" fill="#fff" />
          </g>
        </>
      )}

      {/* lock pip (unearned) */}
      {!earned && (
        <g transform={`translate(${CX + 11}, ${CY + 13})`} opacity={0.9}>
          <rect x={-4.5} y={-2} width={9} height={7} rx={1.6} fill="#0b0d16" stroke="#6b6690" strokeWidth={1} />
          <path d="M-2.6 -2 v-1.6 a2.6 2.6 0 0 1 5.2 0 v1.6" fill="none" stroke="#6b6690" strokeWidth={1} />
        </g>
      )}
    </svg>
  );
}
