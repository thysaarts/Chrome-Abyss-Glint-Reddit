import { useEffect, useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { TileGem } from "./TileGem";
import { sfx } from "../audio/sfx";

/**
 * PUZZLE INTRO — the one-time briefing that pops over the board the first time a
 * player launches a PUZZLE level. Mirrors the Academy briefing card, but its
 * emblem is a small LOOPING demo of the mechanic: a Drift of gems banks (gold
 * outline), the gems clear, the grey tile lids peel off, and a slice of the
 * first sticker image (bluegiant) is uncovered beneath. Copy is CMS content
 * (content.puzzleText.intro).
 */

const BLUEGIANT = "/stickers/bluegiant-image.webp";

// a compact 3-tile Drift (flat-top hexes, matching the board)
const R = 21;
const HEXES = [
  { x: 44, y: 52 },
  { x: 75.5, y: 34.5 },
  { x: 75.5, y: 69.5 },
];
const DRIFT_VALUE = 4; // Verdite — a bright, readable mid mineral

const hexV = (cx: number, cy: number, r: number): [number, number][] =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
const pts = (v: [number, number][]) => v.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const hexPts = (cx: number, cy: number, r: number) => pts(hexV(cx, cy, r));

const TIMELINE = [
  { phase: "gems", dur: 1050 },
  { phase: "banked", dur: 950 },
  { phase: "peel", dur: 780 },
  { phase: "revealed", dur: 1250 },
] as const;

function PuzzleDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setStep((s) => (s + 1) % TIMELINE.length), TIMELINE[step].dur);
    return () => clearTimeout(t);
  }, [step]);
  const phase = TIMELINE[step].phase;
  const showGems = phase === "gems" || phase === "banked";
  const banked = phase === "banked";
  const showLids = phase !== "revealed";
  const peeling = phase === "peel";

  return (
    <div style={demoWrap}>
      <svg viewBox="10 6 100 92" style={{ width: "100%", height: "100%", display: "block" }} aria-hidden>
        <defs>
          <clipPath id="pi-clip">
            {HEXES.map((h, i) => (
              <polygon key={i} points={hexPts(h.x, h.y, R * 0.99)} />
            ))}
          </clipPath>
        </defs>

        {/* the picture beneath the tiles (uncovered as the lids peel) */}
        <image href={BLUEGIANT} x={23} y={16} width={74} height={72} preserveAspectRatio="xMidYMid slice" clipPath="url(#pi-clip)" />

        {/* grey film + bevelled double outline — exactly like the live board */}
        {HEXES.map((h, i) => (
          <g key={`edge-${i}`}>
            <polygon points={hexPts(h.x, h.y, R * 0.99)} fill="rgba(16,16,24,0.30)" />
            <polygon points={hexPts(h.x, h.y + 0.8, R * 0.98)} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={1.2} />
            <polygon points={hexPts(h.x, h.y - 0.8, R * 0.98)} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          </g>
        ))}

        {/* the grey tile lids covering the image; keyed by step so the peel replays each loop */}
        {showLids && (
          <g key={peeling ? `peel-${step}` : "lids"}>
            {HEXES.map((h, i) => {
              const v = hexV(h.x, h.y, R * 0.98);
              return (
                <g
                  key={i}
                  className={peeling ? "gl-peel" : undefined}
                  style={peeling ? ({ ["--peel-rot"]: `${(i - 1) * 12}deg`, animationDelay: `${i * 70}ms`, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" } as React.CSSProperties) : undefined}
                >
                  <polygon points={pts(v)} fill="var(--tile-face)" />
                  <polygon points={pts([v[0], v[5], v[4], v[3]])} fill="var(--tile-facet)" opacity={0.42} />
                  <polygon points={pts([v[0], v[1], v[2], v[3]])} fill="#000000" opacity={0.2} />
                  <polygon points={pts(v)} fill="none" stroke="var(--tile-stroke)" strokeWidth={1.1} />
                </g>
              );
            })}
          </g>
        )}

        {/* the Drift of gems sitting on the lids */}
        {showGems &&
          HEXES.map((h, i) => (
            <g key={`gem-${i}`} transform={`translate(${h.x - 15}, ${h.y - 18})`}>
              <TileGem value={DRIFT_VALUE} size={30} />
            </g>
          ))}

        {/* the gold "banked" outline flashing round the Drift */}
        {banked && (
          <g style={{ filter: "drop-shadow(0 0 4px rgba(232,181,63,0.75))" }}>
            {HEXES.map((h, i) => (
              <g key={`ring-${i}`}>
                <polygon points={hexPts(h.x, h.y, R * 0.98)} fill="#e8b53f" opacity={0.14} />
                <polygon points={hexPts(h.x, h.y, R * 0.98)} fill="none" stroke="#ffd980" strokeWidth={2.4} opacity={0.97} />
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

export function PuzzleIntro({ onClose }: { onClose: () => void }) {
  const I = CONTENT.puzzleText.intro;
  return (
    <div style={scrim}>
      <div className="gl-fade" style={card}>
        <div style={kicker}>{I.kicker}</div>
        <PuzzleDemo />
        <div style={title}>{I.title}</div>
        <div style={lines}>
          {I.lines.map((line, i) => (
            <div key={i} style={lineRow}>
              <span style={bullet}>{i + 1}</span>
              <span style={lineText}>{line}</span>
            </div>
          ))}
        </div>
        <button style={btn} onClick={() => { sfx.click(); onClose(); }}>
          {I.button}
        </button>
      </div>
    </div>
  );
}

const scrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  background: "rgba(4,4,10,0.7)",
  backdropFilter: "blur(3px)",
  WebkitBackdropFilter: "blur(3px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 22,
};
const card: React.CSSProperties = {
  width: 380,
  maxWidth: "94vw",
  textAlign: "center",
  padding: "22px 22px 22px",
  borderRadius: 22,
  background: "linear-gradient(180deg, rgba(60,36,90,0.35), rgba(13,11,20,0.6)), #0c0e18",
  border: "1px solid rgba(157,123,255,0.4)",
  boxShadow: "0 40px 90px -24px rgba(0,0,0,0.8)",
};
const kicker: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.3em", color: theme.color.accent };
const demoWrap: React.CSSProperties = {
  width: 176,
  height: 152,
  margin: "12px auto 2px",
  borderRadius: 16,
  overflow: "hidden",
  background: "radial-gradient(120% 120% at 50% 0%, rgba(157,123,255,0.14), rgba(8,9,15,0.6))",
  border: "1px solid rgba(157,123,255,0.22)",
};
const title: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 24,
  letterSpacing: "0.02em",
  marginTop: 12,
  background: "linear-gradient(180deg,#ffffff,#c8b3ff)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: theme.color.text,
};
const lines: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10, marginTop: 14, textAlign: "left" };
const lineRow: React.CSSProperties = { display: "flex", gap: 10, alignItems: "flex-start" };
const lineText: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.5, color: theme.color.dim };
const bullet: React.CSSProperties = {
  flex: "none",
  width: 22,
  height: 22,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "rgba(157,123,255,0.14)",
  border: "1px solid rgba(157,123,255,0.4)",
  color: theme.color.accent,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 11,
};
const btn: React.CSSProperties = {
  width: "100%",
  justifyContent: "center",
  marginTop: 16,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "13px 26px",
  borderRadius: 14,
  border: "none",
  borderBottom: "3px solid #7d3fc4",
  boxShadow: "0 10px 24px -6px rgba(176,107,245,0.7)",
  background: "linear-gradient(180deg,#e2c8ff,#b06bf5)",
  color: "#1a0b2e",
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};
