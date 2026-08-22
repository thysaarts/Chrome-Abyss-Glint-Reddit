/**
 * The two shared pop-up shells. EVERY modal in the app should be built on one of
 * these so the scrim, the viewport cap, the scroll behaviour and the close affordance
 * are identical everywhere — and a brand-new pop-up gets all of it for free.
 *
 *   <PopupCard>  — FULL-HEIGHT / browsable. A ✕ in the top-right, capped at the
 *                  viewport height (dvh, so a mobile browser toolbar can't clip it)
 *                  with the body scrolling when the content is taller than the screen.
 *                  Optional pinned `header` (title + tabs) that stays put while the
 *                  body scrolls. Use for: item detail, leaderboard, combos & values,
 *                  reward reveal, end card, challenge-a-friend.
 *
 *   <MiniPopup>  — SMALL / content-sized. NO ✕ (it carries its own Cancel / OK /
 *                  Got-it buttons), sized to its content, with a safety cap so it can
 *                  still never overflow a short screen. Use for: confirm & message
 *                  dialogs, account dialogs, daily / world challenge, ability reward,
 *                  tutorial complete.
 *
 * Both render through a PORTAL to <body> so the fixed overlay always covers the WHOLE
 * screen — never trapped inside a transformed ancestor (e.g. a scrolling tab). They
 * share one scrim: same blur, same dim, same Esc-to-close, same click-outside-to-close.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { theme } from "../theme/theme";
import { CloseButton } from "./CloseButton";

// the breathing gap between the pop-up and the screen edge, top/bottom AND left/right.
// The card's cap is (100dvh − 2×GUTTER), so the gutter shows above and below it.
const GUTTER = 20;
const CAP = `calc(100dvh - ${GUTTER * 2}px)`;
const SCRIM_BG = "rgba(6,7,14,0.72)";

/** The shared overlay: portal to <body>, fixed full-screen, blurred, centered.
 *  Click the backdrop (or press Esc) → onClose. The card inside stops propagation.
 *  With `hud`, the scrim goes OPAQUE and paints that node instead of live-blurring
 *  the page: WebKit re-rasterises a backdrop-filter region on every repaint, a
 *  sustained GPU cost when a full-screen scrim sits over a rich screen (the
 *  run-end crash window on iOS). The hud is a pre-blurred stand-in — static
 *  `filter: blur()` rasterises once — so the look survives while the real screen
 *  underneath can be visibility-hidden entirely. */
function PopupScrim({ onClose, zIndex, hud, children }: { onClose?: () => void; zIndex: number; hud?: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="gl-fade"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        display: "grid",
        placeItems: "center",
        padding: GUTTER,
        background: hud ? "rgba(6,7,14,0.94)" : SCRIM_BG,
        ...(hud ? {} : { backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }),
      }}
    >
      {hud}
      {children}
    </div>,
    document.body,
  );
}

export function PopupCard({
  onClose,
  children,
  header,
  width = 400,
  zIndex = 90,
  closeLabel = "Close",
  scrollBody = true,
  closeOnBackdrop = true,
  showClose = true,
  onBackdrop,
  className = "gl-screen-in",
  cardStyle,
  bodyStyle,
  closeButtonStyle,
  hud,
}: {
  onClose: () => void;
  children: React.ReactNode;
  /** optional pinned region above the scrolling body (e.g. a title + tab bar) */
  header?: React.ReactNode;
  /** pre-blurred stand-in painted on an OPAQUE scrim instead of live backdrop
   *  blur (see PopupScrim) — pass when the screen underneath is hidden */
  hud?: React.ReactNode;
  width?: number;
  zIndex?: number;
  closeLabel?: string;
  /** true (default): the body scrolls when it overflows. false: the body is a flex
   *  column with no scroll — the pop-up manages its own fit inside (e.g. shrinking art). */
  scrollBody?: boolean;
  /** false: backdrop click / Esc won't dismiss — only the ✕ (a proceed-only card) */
  closeOnBackdrop?: boolean;
  /** false: hide the ✕ entirely (e.g. the end card only shows it end-of-line) */
  showClose?: boolean;
  /** backdrop-click / Esc handler when it differs from the ✕ (e.g. end card: tap
   *  outside = play again, ✕ = exit). Defaults to onClose when closeOnBackdrop. */
  onBackdrop?: () => void;
  className?: string;
  /** per-pop-up skin (background / border / radius) layered over the neutral default */
  cardStyle?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
  closeButtonStyle?: React.CSSProperties;
}) {
  const backdrop = onBackdrop ?? (closeOnBackdrop ? onClose : undefined);
  return (
    <PopupScrim onClose={backdrop} zIndex={zIndex} hud={hud}>
      <div
        className={className}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: `min(${width}px, 100%)`,
          maxHeight: CAP,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 22,
          background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))",
          border: `1px solid ${theme.color.border}`,
          boxShadow: theme.color.shadow,
          ...cardStyle,
        }}
      >
        {showClose && <CloseButton onClose={onClose} label={closeLabel} style={closeButtonStyle} />}
        {header != null && <div style={{ flexShrink: 0 }}>{header}</div>}
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            ...(scrollBody ? { overflowY: "auto" } : { display: "flex", flexDirection: "column" }),
            ...bodyStyle,
          }}
        >
          {children}
        </div>
      </div>
    </PopupScrim>
  );
}

export function MiniPopup({
  onClose,
  children,
  width = 360,
  zIndex = 90,
  closeOnBackdrop = true,
  className = "gl-screen-in",
  cardStyle,
}: {
  /** called on backdrop click / Esc; the pop-up's own buttons call it too */
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  zIndex?: number;
  /** false: clicking the backdrop / Esc won't dismiss (a must-choose dialog) */
  closeOnBackdrop?: boolean;
  className?: string;
  cardStyle?: React.CSSProperties;
}) {
  return (
    <PopupScrim onClose={closeOnBackdrop ? onClose : undefined} zIndex={zIndex}>
      <div
        className={className}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: `min(${width}px, 100%)`,
          // a safety cap so even a "small" dialog can never overflow a short screen
          maxHeight: CAP,
          overflowY: "auto",
          borderRadius: 22,
          background: theme.color.panel,
          border: `1px solid ${theme.color.border}`,
          boxShadow: theme.color.shadow,
          ...cardStyle,
        }}
      >
        {children}
      </div>
    </PopupScrim>
  );
}
