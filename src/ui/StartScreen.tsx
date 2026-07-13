import { useRef, useState } from "react";
import { theme, bevel, bevelPrimary } from "../theme/theme";
import { CONTENT } from "../content/content";
import { GameState, CORE } from "../game/engine";
import { Board } from "./Board";
import { TileGem } from "./TileGem";
import { Backdrop } from "./Backdrop";
import { isTraceEnabled, setTraceEnabled } from "../game/trace";

/**
 * The launch / start screen (design_handoff_glint_start). A splash over a dimmed,
 * blurred board: floating Nebulite emblem, GLINT wordmark, one-line lore, and the
 * entry actions — START, Quick start, Settings, How to play.
 */
export function StartScreen({
  boardState,
  onStart,
  onQuickStart,
  onSettings,
  onTutorial,
  muted,
  onToggleMute,
  exiting,
}: {
  boardState: GameState;
  onStart: () => void;
  onQuickStart: () => void;
  onSettings: () => void;
  onTutorial: () => void;
  muted: boolean;
  onToggleMute: () => void;
  /** true once Start is tapped — the whole screen dives away (scale + blur + fade)
   *  before the parent swaps in the Ascent map. */
  exiting?: boolean;
}) {
  // HIDDEN DEV TOGGLE — tap the "STUDIO FUNK" footer 3× (within ~1.2s) to flip the
  // move-tracer / debug panel on or off. It persists in localStorage and reloads, so
  // it works on an installed iOS web app where the URL can't be edited (?debug=1).
  const funkTaps = useRef(0);
  const funkTimer = useRef<number | undefined>(undefined);
  const [funkFlash, setFunkFlash] = useState<string | null>(null);
  const onFunkTap = () => {
    window.clearTimeout(funkTimer.current);
    funkTaps.current += 1;
    if (funkTaps.current >= 3) {
      funkTaps.current = 0;
      const next = !isTraceEnabled();
      setTraceEnabled(next);
      setFunkFlash(next ? "DEBUG ON — reloading…" : "debug off — reloading…");
      window.setTimeout(() => window.location.reload(), 500);
    } else {
      funkTimer.current = window.setTimeout(() => { funkTaps.current = 0; }, 1200);
    }
  };
  return (
    <div style={wrap} className={exiting ? "gl-dive-out" : undefined}>
      {/* atmosphere: parallax nebula + starfield + dust, then the static glows */}
      <Backdrop />
      <div style={atmosphere} />
      <div style={boardBackdrop}>
        <div style={{ transform: "scale(1.05)", width: "min(92vw, 460px)" }}>
          <Board state={boardState} interactive={false} onPlace={() => {}} />
        </div>
      </div>
      <div style={scrim} />

      {/* content */}
      <div style={content} className="gl-screen-in">
        {/* emblem */}
        <div style={emblemWrap} className="gl-float-y">
          <div style={halo} className="gl-halo" />
          <div style={{ position: "relative", width: 118, height: 118 }}>
            <TileGem value={CORE} size={118} />
          </div>
        </div>

        <div className="gl-rise" style={{ ...kicker, animationDelay: "0s" }}>
          {CONTENT.startScreen.kicker}
        </div>
        <h1 className="gl-rise" style={{ ...wordmark, animationDelay: "0.05s" }}>
          {CONTENT.startScreen.title}
        </h1>
        <p className="gl-rise" style={{ ...lore, animationDelay: "0.12s" }}>
          {CONTENT.startScreen.tagline}
        </p>

        <button className="gl-start-glow" style={startBtn} onClick={onStart}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" />
          </svg>
          {CONTENT.startScreen.startButton}
        </button>

        <button className="gl-rise" style={{ ...quickStartBtn, animationDelay: "0.16s" }} onClick={onQuickStart}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 5.5v13a1 1 0 0 0 1.5.87L14 14v4.5a1 1 0 0 0 1.5.87l9-6.5a1 1 0 0 0 0-1.74l-9-6.5A1 1 0 0 0 14 5.5V10L5.5 4.63A1 1 0 0 0 4 5.5Z" />
          </svg>
          {CONTENT.startScreen.quickStartButton}
        </button>

        <div className="gl-rise" style={{ ...secondaryRow, animationDelay: "0.2s" }}>
          {/* mute — silences everything (sfx + music), same toggle as in-game */}
          <button style={{ ...secBtn, flex: "none", width: 44, justifyContent: "center" }} onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" stroke="none" />
              {muted ? (
                <>
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : (
                <>
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </>
              )}
            </svg>
          </button>
          <button style={secBtn} onClick={onSettings}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {CONTENT.startScreen.settingsButton}
          </button>
          <button style={secBtn} onClick={onTutorial}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.3 9.2a2.7 2.7 0 1 1 3.9 2.5c-.9.5-1.2 1-1.2 1.9" />
              <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
            </svg>
            {CONTENT.startScreen.howToPlayButton}
          </button>
        </div>

        <div style={{ ...footer, cursor: "pointer", padding: "6px 12px", userSelect: "none", WebkitUserSelect: "none" }} onClick={onFunkTap}>
          {funkFlash ?? CONTENT.startScreen.footer}
        </div>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  background: "#07080f",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 30px",
};
const atmosphere: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background:
    "radial-gradient(460px 340px at 50% 6%, rgba(157,123,255,0.2), transparent 62%), radial-gradient(400px 360px at 100% 88%, rgba(95,230,242,0.09), transparent 60%), radial-gradient(420px 380px at 0% 82%, rgba(224,139,255,0.1), transparent 62%)",
};
const boardBackdrop: React.CSSProperties = {
  position: "absolute",
  top: "9%",
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  opacity: 0.12,
  filter: "blur(2px)",
  pointerEvents: "none",
};
const scrim: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(7,8,15,0.55), rgba(7,8,15,0.82))",
  pointerEvents: "none",
};
const content: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  width: "100%",
  maxWidth: 340,
};
const emblemWrap: React.CSSProperties = {
  position: "relative",
  width: 118,
  height: 118,
  marginBottom: 26,
};
const halo: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 150,
  height: 150,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(176,107,245,0.4), transparent 66%)",
};
const kicker: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontSize: 12,
  letterSpacing: "0.42em",
  color: theme.color.accent,
};
const wordmark: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 76,
  lineHeight: 0.86,
  letterSpacing: "0.005em",
  margin: "8px 0 0",
  background: theme.color.gradient,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  filter: "drop-shadow(0 3px 26px rgba(157,123,255,0.55))",
};
const lore: React.CSSProperties = {
  fontFamily: theme.fonts.sans,
  fontSize: 15,
  lineHeight: 1.55,
  color: "#b7b0d4",
  margin: "20px 0 0",
  maxWidth: 280,
};
const startBtn: React.CSSProperties = {
  width: "100%",
  maxWidth: 340,
  marginTop: 38,
  padding: 17,
  borderRadius: 16,
  ...bevelPrimary,
  borderBottom: "3.5px solid #7d3fc4",
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 18,
  letterSpacing: "0.06em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
};
const quickStartBtn: React.CSSProperties = {
  width: "100%",
  maxWidth: 340,
  marginTop: 12,
  padding: 14,
  borderRadius: 15,
  ...bevel,
  borderBottom: "3px solid #060810",
  color: "#cdd3e0",
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: "0.03em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
};
const secondaryRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 14,
  width: "100%",
  maxWidth: 340,
};
const secBtn: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  padding: "13px 8px",
  borderRadius: 14,
  ...bevel,
  color: "#cdd3e0",
  fontFamily: theme.fonts.sans,
  fontWeight: 600,
  fontSize: 12.5,
  whiteSpace: "nowrap",
};
const footer: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontSize: 10,
  letterSpacing: "0.2em",
  color: "#4f4a6b",
  marginTop: 34,
};
