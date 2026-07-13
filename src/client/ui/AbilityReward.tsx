import { useEffect } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { TileGem } from "./TileGem";
import type { TileVal } from "../game/engine";

/**
 * ABILITY UNLOCKED — the pop-up shown at game end when a run first earns one of
 * the three achievement bonus gems (Resurrect / Quadriant / Zenith). Framed like
 * the collection RewardReveal (same scrim + card), but it presents the real
 * in-game crystal and what the gem does. Two unlocked at once show side by side.
 */
export interface AbilityUnlock {
  key: string;
  gemName: string; // the GEM's name (Resurrect / Quadriant / Zenith)
  tileValue: number;
  blurb: string; // what the ability does, in one line
}

export function AbilityReward({ unlocks, onContinue }: { unlocks: AbilityUnlock[]; onContinue: () => void }) {
  const A = CONTENT.achievements.abilityUnlock;
  const many = unlocks.length > 1;
  // was revealing silently — sound each unlocked gem's own signature on reveal
  useEffect(() => {
    const pick = (name: string) =>
      name.includes("Quadri") ? sfx.quadriantReveal : name.includes("Zenith") ? sfx.zenithReveal : sfx.resurrectReveal;
    const timers = unlocks.map((u, i) => window.setTimeout(pick(u.gemName), i * 260));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={scrim} className="gl-fade">
      <div style={card} className="gl-screen-in">
        <div style={{ position: "absolute", inset: 0, borderRadius: 22, overflow: "hidden", pointerEvents: "none" }}>
          <div className="gl-gloss" style={{ position: "absolute", top: 0, left: 0, width: "36%", height: "100%", background: "linear-gradient(100deg, transparent, rgba(210,230,255,0.08), transparent)" }} />
        </div>
        <div style={title}>{many ? A.titleMany : A.titleOne}</div>
        <div style={sub}>{A.sub}</div>
        <div style={grid}>
          {unlocks.map((u) => (
            <div key={u.key} style={item}>
              <div style={disc}>
                <TileGem value={u.tileValue as TileVal} size={72} />
              </div>
              <div style={name}>{u.gemName}</div>
              <div style={blurbStyle}>{u.blurb}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: theme.color.border, margin: "4px 0 0" }} />
        <button style={primaryBtn} onClick={() => { sfx.click(); onContinue(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" /></svg>
          {A.continueBtn}
        </button>
      </div>
    </div>
  );
}

const scrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 96, background: "rgba(4,4,10,0.76)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const card: React.CSSProperties = {
  position: "relative",
  width: 380,
  maxWidth: "92vw",
  maxHeight: "calc(100dvh - 40px)",
  overflowY: "auto",
  padding: "32px 40px 28px",
  borderRadius: 22,
  textAlign: "center",
  boxShadow: theme.color.shadow,
  background: `radial-gradient(420px 240px at 50% -10%, rgba(157,123,255,0.16), transparent 60%), ${theme.color.panel}`,
  border: "1px solid rgba(157,123,255,0.45)",
};
const title: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 25, color: theme.color.accent, letterSpacing: "0.01em" };
const sub: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.2em", color: theme.color.dim, marginTop: 4 };
const grid: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", margin: "22px 0" };
const item: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 150 };
const disc: React.CSSProperties = { width: 88, height: 88, borderRadius: "50%", display: "grid", placeItems: "center", background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.06), transparent 70%)" };
const name: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 16, color: theme.color.text, lineHeight: 1.1 };
const blurbStyle: React.CSSProperties = { fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 11, lineHeight: 1.4, color: theme.color.dim };
const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  marginTop: 22,
  padding: "13px 30px",
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
