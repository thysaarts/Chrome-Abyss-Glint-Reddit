import { useEffect, useRef } from "react";
import { theme, bevel } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";

/**
 * The in-game / tutorial top bar — one shared component so the game screen and
 * the Level-0 tutorial are identical (logo, Nebulite balance, mute · help ·
 * settings · exit). Mirrors the home shell's header layout.
 */
export function GameHeader({
  muted,
  onToggleMute,
  onHelp,
  onSettings,
  onExit,
  nebulite,
  nebulitePending,
  nebRef,
  onNebuliteClick,
}: {
  muted: boolean;
  onToggleMute: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onExit: () => void;
  nebulite: number;
  /** count includes PROVISIONAL in-run Nebulite — tint it until the run banks it */
  nebulitePending?: boolean;
  /** flight-target anchor: collected Nebulites fly INTO this chip */
  nebRef?: React.RefObject<HTMLDivElement>;
  /** tapping the Nebulite score → open the Shop (via the Exit-Level confirm) */
  onNebuliteClick?: () => void;
}) {
  // a soft chime whenever the wallet count TICKS UP mid-game (a Nebulite landed)
  const prevNebRef = useRef(nebulite);
  useEffect(() => {
    if (nebulite > prevNebRef.current) sfx.walletGain();
    prevNebRef.current = nebulite;
  }, [nebulite]);
  return (
    <header style={headerRow}>
      <div>
        <div style={kicker}>{CONTENT.startScreen.kicker}</div>
        <h1 style={wordmark}>{CONTENT.startScreen.title}</h1>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div ref={nebRef}>
          <NebuliteChip count={nebulite} pending={nebulitePending} onClick={onNebuliteClick} />
        </div>
        <button style={iconBtn} onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          <MuteIcon muted={muted} />
        </button>
        <button style={iconBtn} onClick={onHelp} aria-label="Help">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.3 9.2a2.7 2.7 0 1 1 3.9 2.5c-.9.5-1.2 1-1.2 1.9" />
            <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button style={iconBtn} onClick={onSettings} aria-label="Settings">
          <CogIcon />
        </button>
        <button style={iconBtn} onClick={onExit} aria-label="Exit to menu">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}

/**
 * The Nebulite CURRENCY — a button-styled box (same bevel + height as the other
 * top-bar buttons, just wider) holding the Nebulite icon on the left and the
 * balance to its right in a light font.
 */
export function NebuliteChip({ count, pending, onClick }: { count: number; pending?: boolean; onClick?: () => void }) {
  // pending = the count includes Nebulite collected THIS run, not yet banked —
  // it only sticks if the run completes (win or cash-out); Replay forfeits it
  const numStyle = pending ? { ...chipNum, color: "#c88bff", textShadow: "0 0 9px rgba(178,105,250,0.65)" } : chipNum;
  const label = onClick ? `${count} Nebulite — open Shop` : `${count} Nebulite`;
  return (
    <div
      style={{ ...chipBox, ...(onClick ? { cursor: "pointer" } : null) }}
      title={label}
      aria-label={label}
      {...(onClick ? { role: "button", tabIndex: 0, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } } : null)}
    >
      <NebuliteIcon size={26} />
      <span style={numStyle}>{count.toLocaleString()}</span>
    </div>
  );
}

/** The detailed Nebulite Core tile (orbiting dots, separated ring, two-tone fill, diamond). */
export function NebuliteIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block", overflow: "visible", flex: "0 0 auto" }}>
      <defs>
        {/* two-tone fill: lighter upper half, darker lower half (hard split like the Core tile) */}
        <linearGradient id="nebbal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c483ff" />
          <stop offset="0.5" stopColor="#a659f0" />
          <stop offset="0.5" stopColor="#8f46e2" />
          <stop offset="1" stopColor="#7d38d2" />
        </linearGradient>
      </defs>
      {/* subtle outer ring, separated from the fill, with the 4 orbiting dots on it */}
      <rect x="2" y="2" width="36" height="36" rx="11.5" fill="none" stroke="#C7A6EE" strokeWidth="1.1" opacity="0.6" />
      <rect x="6" y="6" width="28" height="28" rx="8.5" fill="url(#nebbal)" />
      <rect x="6" y="6" width="28" height="28" rx="8.5" fill="none" stroke="#EBD3FF" strokeWidth="0.9" opacity="0.5" />
      {/* the light diamond — brighter upper half + a glowing white core */}
      <polygon points="20,8 32,20 20,32 8,20" fill="#F1E2FF" opacity="0.95" />
      <polygon points="20,8 32,20 20,20 8,20" fill="#FBF3FF" opacity="0.6" />
      <circle cx="20" cy="20" r="6" fill="#FBF2FF" opacity="0.55" />
      <circle cx="20" cy="20" r="3.1" fill="#ffffff" />
      {/* orbiting sparkle dots */}
      <circle cx="20" cy="2" r="1.15" fill="#F4E6FF" opacity="0.95" />
      <circle cx="38" cy="20" r="1.15" fill="#F4E6FF" opacity="0.7" />
      <circle cx="20" cy="38" r="1.15" fill="#F4E6FF" opacity="0.5" />
      <circle cx="2" cy="20" r="1.15" fill="#F4E6FF" opacity="0.7" />
    </svg>
  );
}

/** The small Nebulite gem tile — reads as the same Core tile, for prices/rewards. */
export function NebuliteGem({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block", filter: "drop-shadow(0 0 4px rgba(179,107,245,0.6))" }}>
      <defs>
        <linearGradient id="nebgem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c88bff" />
          <stop offset="1" stopColor="#8a44e0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#nebgem)" stroke="#E0BBFF" strokeWidth="1.8" />
      <polygon points="20,8 32,20 20,32 8,20" fill="#F0E1FF" opacity="0.92" />
      <polygon points="20,8 32,20 20,20 8,20" fill="#FBF3FF" opacity="0.7" />
      <circle cx="20" cy="20" r="4" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

function MuteIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  );
}

function CogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/* ---------- styles (match App's in-game header) ---------- */
const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 3 };
const kicker: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.3em", color: theme.color.accent };
const wordmark: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 34,
  lineHeight: 0.9,
  margin: "2px 0 0",
  letterSpacing: "0.01em",
  background: theme.color.gradient,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  filter: "drop-shadow(0 2px 14px rgba(157,123,255,0.5))",
};
const iconBtn: React.CSSProperties = { display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 12, ...bevel, color: theme.color.text, cursor: "pointer" };
const chipBox: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 13px 0 7px", borderRadius: 12, ...bevel, flex: "0 0 auto" };
const chipNum: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 15, color: "#ecdfff", fontVariantNumeric: "tabular-nums", lineHeight: 1 };
