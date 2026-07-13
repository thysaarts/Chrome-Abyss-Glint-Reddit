import { theme, bevel } from "../theme/theme";
import { sfx } from "../audio/sfx";
import { CONTENT } from "../content/content";
import { NebuliteChip } from "./GameHeader";

/**
 * The bottom tab bar (mobile-first, glued to the bottom) and the placeholder
 * pages for tabs whose real content lands in later waves. The Home tab holds
 * the existing level map; Challenges / Collection / Profile are client-only
 * features coming next.
 */

export type HomeTab = "ascent" | "challenges" | "collection" | "achievements" | "shop";

const TABS: { id: HomeTab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    // the campaign IS "The Ascent" — a zig-zag trail with waypoints climbing the
    // map (mirrors the alternating hex path on the level select), the top node the
    // destination
    id: "ascent",
    label: "Ascent",
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 19 L14.5 13 L7.5 7" strokeWidth="1.7" opacity={0.85} />
        <circle cx="6" cy="19" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="13" r="1.6" fill="currentColor" stroke="none" opacity={0.7} />
        <circle cx="7.5" cy="7" r="2.6" fill={a ? "currentColor" : theme.color.bg} />
        {a && <circle cx="7.5" cy="7" r="1" fill={theme.color.bg} stroke="none" />}
      </svg>
    ),
  },
  {
    id: "challenges",
    label: "Challenges",
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" opacity={a ? 1 : 0.9} />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "collection",
    label: "Collection",
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
      </svg>
    ),
  },
  {
    // a hexagon medal (echoes the game's tiles) with a ribbon + earned check
    id: "achievements",
    label: "Achievements",
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3.4 L11 10" />
        <path d="M15 3.4 L13 10" />
        <path d="M12 9 L16.76 11.75 L16.76 17.25 L12 20 L7.24 17.25 L7.24 11.75 Z" fill={a ? "currentColor" : "none"} />
        <path d="M9.7 14.9 L11.3 16.4 L14.4 12.9" stroke={a ? theme.color.bg : "currentColor"} strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    // a shopping bag
    id: "shop",
    label: "Shop",
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 8h14l-1.1 10.6a1.6 1.6 0 0 1-1.6 1.4H7.7a1.6 1.6 0 0 1-1.6-1.4Z" fill={a ? "currentColor" : "none"} />
        <path d="M8.5 8V6.7a3.5 3.5 0 0 1 7 0V8" fill="none" stroke={a ? theme.color.bg : "currentColor"} />
      </svg>
    ),
  },
];

/**
 * The persistent top bar of the home shell — logo far left; High scores · Help ·
 * Settings · Exit on the right. It lives in the OUTER shell (above every tab
 * page), so it stays put while Ascent / Challenges / Collection / Achievements
 * swap in the frame between it and the bottom tabs. Mirrors the in-game header.
 */
export const HEADER_HEIGHT = 58;

export function ShellHeader({
  nebulite,
  onScores,
  onHelp,
  onSettings,
  onExit,
  onNebuliteClick,
}: {
  nebulite: number;
  onScores: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onExit: () => void;
  /** tapping the Nebulite score on the home shell → open the Shop tab directly */
  onNebuliteClick?: () => void;
}) {
  return (
    <header style={hdrOuter}>
      <div style={hdrInner}>
        <div>
          <div style={hdrKicker}>{CONTENT.startScreen.kicker}</div>
          <div style={hdrWordmark}>{CONTENT.startScreen.title}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <NebuliteChip count={nebulite} onClick={onNebuliteClick} />
          <button style={{ ...hdrBtn, color: "#e8cf8f" }} onClick={onScores} aria-label="High scores">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4h12v3a6 6 0 0 1-12 0Z" />
              <path d="M6 6H4v1a3 3 0 0 0 3 3M18 6h2v1a3 3 0 0 1-3 3M9 15h6M8.5 19h7M10 15l-.5 4M14 15l.5 4" />
            </svg>
          </button>
          <button style={hdrBtn} onClick={onHelp} aria-label="Help">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.3 9.2a2.7 2.7 0 1 1 3.9 2.5c-.9.5-1.2 1-1.2 1.9" />
              <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button style={hdrBtn} onClick={onSettings} aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button style={hdrBtn} onClick={onExit} aria-label="Exit to menu">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export function TabBar({ active, onChange, alerts }: { active: HomeTab; onChange: (t: HomeTab) => void; alerts?: Partial<Record<HomeTab, boolean>> }) {
  const activeIdx = Math.max(0, TABS.findIndex((t) => t.id === active));
  return (
    <nav style={bar}>
      {/* one indicator that GLIDES between tabs (was popping in/out per button) */}
      <span style={{ ...indicator, left: `calc(${activeIdx + 0.5} * (100% / ${TABS.length}) - 13px)`, transition: "left 0.32s cubic-bezier(0.4,0,0.2,1)" }} />
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => {
              if (on) return;
              sfx.click();
              onChange(t.id);
            }}
            aria-label={t.label}
            aria-current={on ? "page" : undefined}
            style={{ ...tabBtn, color: on ? theme.color.accent : theme.color.faint }}
          >
            <span style={{ position: "relative", filter: on ? "drop-shadow(0 0 8px rgba(192,132,252,0.6))" : "none", transition: "filter 0.2s" }}>
              {t.icon(on)}
              {/* alert dot: something newly unlocked here that the player hasn't seen */}
              {alerts?.[t.id] && <span style={alertDot} aria-label="New items" />}
            </span>
            <span style={{ fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.05em", marginTop: 3, fontWeight: on ? 700 : 400, whiteSpace: "nowrap" }}>
              {t.label.toUpperCase()}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// the small "new here" dot pinned to a tab icon's top-right corner
const alertDot: React.CSSProperties = {
  position: "absolute",
  top: -3,
  right: -6,
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "linear-gradient(180deg, #ffe6a8, #e8b53f)",
  boxShadow: "0 0 8px rgba(232,181,63,0.8)",
  border: "1px solid rgba(20,16,4,0.8)",
};

/** A tasteful placeholder for a tab whose real content ships in a later wave. */
export function ComingSoon({ tab }: { tab: Exclude<HomeTab, "ascent"> }) {
  const copy: Record<Exclude<HomeTab, "ascent">, { title: string; blurb: string }> = {
    challenges: {
      title: "Challenges",
      blurb: "Daily challenges, upcoming level goals, and lifetime milestones — clear boards, bank Nebulites, sweep Dross, and watch the numbers climb.",
    },
    collection: {
      title: "Collection",
      blurb: "A sticker book of everything you earn — badges, unlockable music tracks and board themes to make the Abyss your own.",
    },
    achievements: {
      title: "Achievements",
      blurb: "Every feat you've earned on the climb — lifetime stats, best scores and the milestones you've conquered, all in one place.",
    },
    shop: {
      title: "Shop",
      blurb: "Spend the Nebulite you earn on shop-exclusive board themes, music and Ascent decor.",
    },
  };
  const t = TABS.find((x) => x.id === tab)!;
  const c = copy[tab];
  return (
    <div style={soonWrap}>
      <div style={soonHalo} />
      <div style={{ color: theme.color.accent, opacity: 0.9 }}>
        <div style={{ transform: "scale(2.2)" }}>{t.icon(false)}</div>
      </div>
      <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 26, color: theme.color.text, marginTop: 30 }}>{c.title}</div>
      <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.3em", color: theme.color.gold, marginTop: 8 }}>COMING SOON</div>
      <div style={{ fontFamily: theme.fonts.sans, fontSize: 13.5, lineHeight: 1.6, color: theme.color.dim, maxWidth: 320, textAlign: "center", marginTop: 16 }}>{c.blurb}</div>
    </div>
  );
}

/* ---------- styles (theme-var driven) ---------- */

// The bar GROWS by the home-indicator safe-area (iOS standalone PWA): the 62px of
// tab content sits above it, the inset becomes empty padding over the indicator —
// otherwise (with border-box) the inset eats into the 62px and clips the labels.
/** A greyed, non-interactive lock laid over a tab whose feature is gated behind
 *  finishing the Tutorial. Rendered ABOVE the real page (which stays dimmed and
 *  inert beneath it) so the player sees what's coming, just can't touch it yet. */
export function LockedTab({ label = "COMPLETE TUTORIAL TO UNLOCK" }: { label?: string }) {
  return (
    <div style={lockWrap} aria-hidden>
      <div style={lockHalo} />
      <div style={{ color: theme.color.dim, opacity: 0.9 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10.5" width="16" height="10" rx="2.2" />
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
        </svg>
      </div>
      <div style={{ fontFamily: theme.fonts.mono, fontSize: 11, letterSpacing: "0.24em", color: theme.color.gold, marginTop: 18, maxWidth: 260, lineHeight: 1.5 }}>{label}</div>
    </div>
  );
}

export const TAB_BAR_HEIGHT = "calc(62px + env(safe-area-inset-bottom))";
const lockWrap: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 4,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 30px 80px",
  textAlign: "center",
  background: "rgba(6,7,13,0.72)",
  backdropFilter: "blur(3px)",
  WebkitBackdropFilter: "blur(3px)",
  // eat every pointer event so the page beneath stays inert
  pointerEvents: "all",
};
const lockHalo: React.CSSProperties = {
  position: "absolute",
  top: "36%",
  width: 220,
  height: 220,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(232,181,63,0.12), transparent 68%)",
  pointerEvents: "none",
};
const bar: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 5,
  display: "flex",
  height: TAB_BAR_HEIGHT,
  paddingBottom: "env(safe-area-inset-bottom)",
  background: "linear-gradient(180deg, rgba(12,13,22,0.86), rgba(8,9,15,0.96))",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  borderTop: "1px solid var(--border)",
};
const tabBtn: React.CSSProperties = {
  position: "relative",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 0,
  background: "none",
  border: "none",
  cursor: "pointer",
  transition: "color 0.2s",
};
const indicator: React.CSSProperties = {
  position: "absolute",
  top: 0,
  width: 26,
  height: 3,
  borderRadius: 3,
  background: theme.color.accent,
  boxShadow: "0 0 10px rgba(192,132,252,0.8)",
};
// the persistent shell header (mirrors LevelSelect's old top bar + the in-game header)
const hdrOuter: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: HEADER_HEIGHT,
  zIndex: 6,
  background: "var(--bg, #07080f)",
};
const hdrInner: React.CSSProperties = {
  height: "100%",
  maxWidth: 1180,
  margin: "0 auto",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 12px 6px",
};
const hdrKicker: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.3em", color: theme.color.accent };
const hdrWordmark: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 32,
  lineHeight: 0.9,
  margin: "2px 0 0",
  letterSpacing: "0.01em",
  background: theme.color.gradient,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  filter: "drop-shadow(0 2px 14px rgba(157,123,255,0.5))",
};
const hdrBtn: React.CSSProperties = { display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 12, ...bevel, color: theme.color.text, cursor: "pointer" };

const soonWrap: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 30px 80px",
  textAlign: "center",
};
const soonHalo: React.CSSProperties = {
  position: "absolute",
  top: "36%",
  width: 220,
  height: 220,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(157,123,255,0.16), transparent 68%)",
  pointerEvents: "none",
};
