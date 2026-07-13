import React from "react";
import { theme, bevelPrimary, bevel } from "../theme/theme";

/**
 * The one button primitive. Consolidates the violet primary CTA, the dark
 * "secondary" bevel and a ghost variant that were copy-pasted (with drifting
 * shadows/borders) across StartScreen, LevelSelect, CashOut and CollectionPage.
 * Press feedback comes from the global `button:active` rule (index.css); pass
 * `style` to tune per-site (width, extra letter-spacing, a glow className, …).
 */
type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, React.CSSProperties> = {
  sm: { padding: "7px 14px", fontSize: 11, borderRadius: 10, gap: 6 },
  md: { padding: "11px 22px", fontSize: 13.5, borderRadius: 13, gap: 8 },
  lg: { padding: "15px 30px", fontSize: 15, borderRadius: 15, gap: 9 },
};

export function Button({
  variant = "primary",
  size = "md",
  full,
  style,
  children,
  ...rest
}: { variant?: Variant; size?: Size; full?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const look: React.CSSProperties =
    variant === "primary"
      ? { ...bevelPrimary }
      : variant === "secondary"
      ? { ...bevel, color: theme.color.text }
      : { background: "none", border: "none", boxShadow: "none", color: theme.color.dim };
  return (
    <button
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.fonts.disp,
        fontWeight: 700,
        letterSpacing: "0.03em",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        width: full ? "100%" : undefined,
        ...SIZES[size],
        ...look,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
