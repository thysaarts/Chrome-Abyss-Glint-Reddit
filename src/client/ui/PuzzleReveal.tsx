import { useEffect } from "react";
import { theme } from "../theme/theme";
import { sfx } from "../audio/sfx";
import { CONTENT } from "../content/content";

/**
 * PUZZLE REVEAL — shown when a PUZZLE board is cleared: the full (uncropped)
 * image the player was uncovering piece-by-piece lifts UP from the board and
 * settles into a framed pop-up. Shown before the run's end card. Copy is CMS
 * content (content.puzzleText.reveal).
 */
export function PuzzleReveal({ image, onContinue }: { image: string; onContinue: () => void }) {
  const R = CONTENT.puzzleText.reveal;
  // a big celebratory sting as the finished picture rises off the board
  useEffect(() => { sfx.puzzleComplete(); }, []);
  return (
    <div style={scrim} className="gl-fade">
      <div style={card}>
        <div style={eyebrow}>{R.eyebrow}</div>
        {/* the picture rises from the board and grows into its frame */}
        <div className="gl-puzzle-rise" style={frame}>
          <img src={image} alt="" style={img} />
          <div style={gloss} className="gl-gloss-slow" />
        </div>
        {R.caption ? <div style={caption}>{R.caption}</div> : null}
        <button style={primaryBtn} onClick={() => { sfx.click(); onContinue(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" /></svg>
          {R.button}
        </button>
      </div>
    </div>
  );
}

const scrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 97, background: "rgba(4,4,10,0.82)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 22 };
const card: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: "92vw" };
const eyebrow: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 10.5, letterSpacing: "0.34em", color: theme.color.gold, textShadow: "0 0 14px rgba(232,181,63,0.45)" };
const caption: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.5, color: theme.color.dim, textAlign: "center", maxWidth: 360 };
const frame: React.CSSProperties = {
  position: "relative",
  maxWidth: "min(86vw, 460px)",
  maxHeight: "62vh",
  borderRadius: 16,
  overflow: "hidden",
  border: "3px solid rgba(255,255,255,0.9)",
  boxShadow: "0 24px 60px -12px rgba(0,0,0,0.8), 0 0 60px -10px rgba(232,181,63,0.5)",
  background: theme.color.panel,
};
const img: React.CSSProperties = { display: "block", width: "100%", height: "100%", maxHeight: "62vh", objectFit: "contain" };
const gloss: React.CSSProperties = { position: "absolute", top: 0, left: 0, width: "40%", height: "100%", background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.14), transparent)", pointerEvents: "none" };
const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "13px 40px",
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
