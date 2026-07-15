import { theme } from "../theme/theme";
import { GameState } from "../game/engine";
import { LogPanel } from "./Panels";

/**
 * SHARED GAME-SCREEN CHROME — the pieces the real game screen (App) and the
 * scripted tutorial (TutorialLevel) both render. They are the SAME screen to
 * the player, so every visual recipe lives here exactly once: the big banner
 * plates (BUST / RESHUFFLE / chapter cards), the BANKED plate, the toast pill
 * and its floating wrapper, the log drawer, and the board/toast/sheen styles.
 */

/* ---------- big banner plates ---------- */

export type BannerKind = "red" | "violet" | "gold";

/** The centre-screen banner. "red" stamps in over cracks (BUST); "violet" and
 *  "gold" sweep through on the glass plate (RESHUFFLE / chapter cards). When no
 *  kind is given it is inferred from the text (BUST → red, else violet). */
export function BigBanner({ text, kind }: { text: string; kind?: BannerKind }) {
  const k: BannerKind = kind ?? (text.toUpperCase().includes("BUST") ? "red" : "violet");
  if (k === "red") {
    // red cracks fire behind the word, which stamps in on a blurred glass plate
    return (
      <div style={overlayScrim}>
        <svg className="gl-crack" width="260" height="180" viewBox="0 0 260 180" style={{ position: "absolute", pointerEvents: "none" }}>
          <g stroke="#ff5a76" strokeWidth="2" strokeLinecap="round" opacity="0.85">
            <line x1="130" y1="90" x2="20" y2="18" />
            <line x1="130" y1="90" x2="245" y2="26" />
            <line x1="130" y1="90" x2="34" y2="168" />
            <line x1="130" y1="90" x2="236" y2="160" />
            <line x1="130" y1="90" x2="128" y2="6" />
            <line x1="130" y1="90" x2="132" y2="176" />
          </g>
        </svg>
        <div className="gl-plate gl-plate-in-c" style={{ padding: "16px 34px", border: "1px solid rgba(255,90,118,0.4)", textAlign: "center" }}>
          <div
            style={{
              fontFamily: theme.fonts.disp,
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 1,
              letterSpacing: "0.06em",
              color: theme.color.bad,
              textShadow: "0 0 26px rgba(255,90,118,0.55)",
            }}
          >
            {text}
          </div>
        </div>
      </div>
    );
  }
  const gold = k === "gold";
  return (
    <div style={overlayScrim}>
      <div
        className="gl-plate gl-sweep"
        style={{ padding: "13px 32px", border: `1px solid ${gold ? "rgba(232,181,63,0.45)" : "rgba(157,123,255,0.45)"}`, textAlign: "center" }}
      >
        <div
          style={{
            fontFamily: theme.fonts.disp,
            fontWeight: 700,
            fontSize: 30,
            lineHeight: 1,
            letterSpacing: "0.14em",
            color: gold ? "#ffd980" : "#e2dcff",
            textShadow: gold ? "0 0 20px rgba(232,181,63,0.55)" : "0 0 20px rgba(157,123,255,0.6)",
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

/** BANKED ×N — the gold plate stamps in anchored bottom-centre of the board while
 *  the banked tiles arc to the score. The positioning wrapper is separate from the
 *  animated plate so the animation's transform never fights the centring. */
export function BankedPlate({ text }: { text: string }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 6, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 30 }}>
      <div className="gl-plate gl-plate-in-x" style={{ padding: "10px 26px", border: "1px solid rgba(232,181,63,0.4)" }}>
        <div
          style={{
            fontFamily: theme.fonts.disp,
            fontWeight: 700,
            fontSize: 22,
            lineHeight: 1,
            letterSpacing: "0.1em",
            color: "#ffd980",
            textShadow: "0 0 18px rgba(232,181,63,0.5)",
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

/* ---------- toasts ---------- */

/** The log-line pill, colour-coded by entry kind. */
export function ToastPill({ kind, text }: { kind: string; text: string }) {
  const color =
    kind === "bust"
      ? theme.color.bad
      : kind === "core"
      ? theme.color.accent
      : kind === "glint" || kind === "rush"
      ? theme.color.gold
      : kind === "info"
      ? theme.color.dim
      : theme.color.good;
  const rgb =
    color === theme.color.bad
      ? "255,90,118"
      : color === theme.color.accent
      ? "192,132,252"
      : color === theme.color.gold
      ? "232,181,63"
      : color === theme.color.dim
      ? "155,149,189"
      : "52,217,139";
  return (
    <span
      className="gl-toast"
      style={{
        fontFamily: theme.fonts.disp,
        fontWeight: 600,
        fontSize: 11.5,
        color,
        background: `rgba(${rgb},0.1)`,
        border: `1px solid rgba(${rgb},0.28)`,
        padding: "5px 13px",
        borderRadius: 999,
        textAlign: "center",
        maxWidth: "90%",
      }}
    >
      {text}
    </span>
  );
}

/** The most-recent log line as a transient float: rises in from below (from behind
 *  the footer), holds ~3s, then floats up and fades. Re-keyed per new entry to
 *  replay. `stay` pins it in place (the tutorial's persistent instruction line). */
export function FloatingToast({ kind, text, stay }: { kind: string; text: string; stay?: boolean }) {
  return (
    <div className={stay ? "gl-toast-stay" : "gl-toast-float"} style={floatToastWrap}>
      <ToastPill kind={kind} text={text} />
    </div>
  );
}

/* ---------- log drawer ---------- */

/** A collapsing bottom drawer holding the full log. Slides up from the bottom; tap
 *  the handle or the dimmed area to collapse it back down. Not a modal pop-up. */
export function LogDrawer({ open, onClose, state }: { open: boolean; onClose: () => void; state: GameState }) {
  return (
    <>
      {open && <div style={logDrawerScrim} onClick={onClose} />}
      <div style={{ ...logDrawerPanel, transform: open ? "translateY(0)" : "translateY(105%)" }}>
        <button style={logDrawerHandle} onClick={onClose} aria-label="Collapse log">
          <span style={logDrawerGrip} />
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.24em", color: theme.color.dim }}>LOG</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.color.dim }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div style={logDrawerBody}>
          <LogPanel state={state} />
        </div>
      </div>
    </>
  );
}

/* ---------- shared layout constants + styles ---------- */

// The footer bar's raised NOW PLACING focal point pokes this many px above the bar
// (the board area reserves it as top padding; the sheen sweep reaches down past it).
export const FOOTER_POKE = 34;

export const boardPanel: React.CSSProperties = {
  // No frame — the board sits directly on the page background (each cell draws its own
  // well). `position: relative` stays as the positioning context for the glow / sheen /
  // overlays; `overflow: visible` lets edge rings breathe. The board's own viewBox
  // padding (layout.ts) provides all the breathing room, so no frame padding is needed.
  position: "relative",
  overflow: "visible",
};
export const boardGlow: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: "radial-gradient(circle at 50% 46%, rgba(124,90,224,0.1), transparent 70%)",
};
export const boardCastShadow: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 0,
  transform: "translateX(-50%)",
  width: "80%",
  height: 42,
  borderRadius: "50%",
  // slightly stronger in some regions (--rg-cast; standard 0.6)
  background: "radial-gradient(closest-side, rgba(0, 0, 0, var(--rg-cast, 0.6)), transparent)",
  filter: "blur(6px)",
  pointerEvents: "none",
};
export const toastBand: React.CSSProperties = {
  position: "relative",
  height: 40,
  marginTop: 2,
};
export const floatToastWrap: React.CSSProperties = {
  position: "absolute",
  top: 0, // rests near the board's bottom tiles
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 8, // ABOVE the footer: the log pill must stay legible over NOW PLACING
};
export const hudBankOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 6,
  background: "#08090f",
  borderRadius: 16,
  display: "flex",
};
export const sheenClip: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: -FOOTER_POKE, // reach down to the footer box's top line (behind the raised focal point)
  pointerEvents: "none",
  overflow: "hidden",
  zIndex: 5,
};
export const sheenBar: React.CSSProperties = {
  position: "absolute",
  top: "-15%",
  left: 0,
  width: "38%",
  height: "130%",
  background: "linear-gradient(95deg, transparent, rgba(196,214,255,0.09), transparent)",
};
export const overlayCentre: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 30,
};
// Shared dark vignette behind the big animation moments (COLLAPSE / GLINT RUSH /
// MOTHER LODE) so their text always reads against the board. Consistent across all.
export const overlayScrim: React.CSSProperties = {
  ...overlayCentre,
  background: "radial-gradient(ellipse at center, rgba(8,9,16,0.5) 0%, rgba(3,4,9,0.8) 100%)",
};
const logDrawerScrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(4,4,10,0.5)",
  zIndex: 90,
};
const logDrawerPanel: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  margin: "0 auto",
  maxWidth: 460,
  maxHeight: "58vh",
  display: "flex",
  flexDirection: "column",
  background: theme.color.panel,
  borderTop: `1px solid ${theme.color.border}`,
  borderRadius: "18px 18px 0 0",
  boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
  transition: "transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1)",
  zIndex: 95,
  overflow: "hidden",
};
const logDrawerHandle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  position: "relative",
  padding: "12px 16px 8px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};
const logDrawerGrip: React.CSSProperties = {
  position: "absolute",
  top: 6,
  left: "50%",
  transform: "translateX(-50%)",
  width: 36,
  height: 4,
  borderRadius: 999,
  background: theme.color.border,
};
const logDrawerBody: React.CSSProperties = {
  overflowY: "auto",
  padding: "0 14px 16px",
};
