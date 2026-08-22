import { theme } from "../theme/theme";
import { sfx } from "../audio/sfx";

/**
 * THE close (✕) button — one consistent design for every pop-up that closes with
 * an X in the top-right. Absolute-positioned by default, so drop it as the first
 * child of a `position: relative` card. Pass `style` to nudge/override (e.g. a
 * static position when it lives inside a header row).
 */
export function CloseButton({ onClose, label = "Close", style }: { onClose: () => void; label?: string; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); sfx.click(); onClose(); }}
      aria-label={label}
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 5,
        display: "grid",
        placeItems: "center",
        width: 34,
        height: 34,
        borderRadius: 10,
        padding: 0,
        border: `1px solid ${theme.color.border}`,
        background: "rgba(0,0,0,0.22)",
        color: theme.color.dim,
        cursor: "pointer",
        ...style,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
