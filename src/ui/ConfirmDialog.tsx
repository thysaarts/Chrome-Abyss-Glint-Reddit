import { useEffect } from "react";
import { theme } from "../theme/theme";
import { sfx } from "../audio/sfx";

/**
 * A generic Cancel / Confirm dialog (scrim + card, in the app's reward-card
 * language). Used for the "Exit Level?" prompt shown before leaving an active
 * run — either via the Exit button (→ Ascent) or by tapping the Nebulite score
 * (→ Shop). Purely a confirm gate: it never ends the run itself; the caller's
 * onConfirm does the navigation.
 */
export function ConfirmDialog({
  title,
  message,
  cancelLabel = "Cancel",
  confirmLabel = "Continue",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div style={scrim} className="gl-fade" onClick={onCancel}>
      <div style={card} className="gl-screen-in" onClick={(e) => e.stopPropagation()}>
        <div style={title_}>{title}</div>
        <p style={body}>{message}</p>
        <div style={row}>
          <button style={cancelBtn} onClick={() => { sfx.click(); onCancel(); }}>{cancelLabel}</button>
          <button style={confirmBtn} onClick={() => { sfx.click(); onConfirm(); }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const scrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 97, background: "rgba(4,4,10,0.76)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const card: React.CSSProperties = {
  position: "relative",
  width: 360,
  maxWidth: "92vw",
  maxHeight: "calc(100dvh - 40px)",
  overflowY: "auto",
  padding: "26px 30px 22px",
  borderRadius: 22,
  textAlign: "center",
  boxShadow: theme.color.shadow,
  background: `radial-gradient(420px 240px at 50% -10%, rgba(255,140,60,0.12), transparent 60%), ${theme.color.panel}`,
  border: "1px solid rgba(255,140,60,0.35)",
};
const title_: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 22, color: theme.color.text, letterSpacing: "0.01em" };
const body: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.55, color: theme.color.dim, margin: "12px 0 20px" };
const row: React.CSSProperties = { display: "flex", gap: 10 };
const cancelBtn: React.CSSProperties = { flex: 1, padding: "12px 16px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.color.border}`, color: theme.color.dim, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const confirmBtn: React.CSSProperties = { flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", borderBottom: "3px solid #7d3fc4", boxShadow: "0 10px 22px -8px rgba(176,107,245,0.6)", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14, cursor: "pointer" };
