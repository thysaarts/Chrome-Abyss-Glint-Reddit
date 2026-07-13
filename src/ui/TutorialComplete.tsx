import { theme } from "../theme/theme";
import { sfx } from "../audio/sfx";
import { Emblem, GLOW } from "./CollectionPage";
import type { Sticker } from "../game/collection";

/**
 * TUTORIAL COMPLETE — the custom celebration shown the moment the scripted
 * Tutorial (Level 0) ends. It announces that the app's features are now
 * unlocked and hands over the player's first sticker (Blue Giant), standing in
 * for the automatic reward-reveal that grant would otherwise trigger. Copy is
 * CMS content (Admin › Tutorial Level › completion); framed like RewardReveal so
 * the two read as one family.
 */
export interface CompletionCopy {
  kicker: string;
  title: string;
  lines: string[];
  rewardLabel: string;
  button: string;
}

export function TutorialComplete({ copy, sticker, emblem, onContinue }: { copy: CompletionCopy; sticker: Sticker | undefined; emblem: number; onContinue: () => void }) {
  const color = GLOW[emblem % GLOW.length];
  return (
    <div style={scrim} className="gl-fade">
      <div style={card} className="gl-screen-in">
        <div style={{ position: "absolute", inset: 0, borderRadius: 22, overflow: "hidden", pointerEvents: "none" }}>
          <div className="gl-gloss" style={{ position: "absolute", top: 0, left: 0, width: "36%", height: "100%", background: "linear-gradient(100deg, transparent, rgba(210,230,255,0.07), transparent)" }} />
        </div>
        <div className="gl-rise-in" style={{ ...kicker, animationDelay: "60ms" }}>{copy.kicker}</div>
        <div className="gl-rise-in" style={{ ...title, animationDelay: "130ms" }}>{copy.title}</div>
        <div className="gl-rise-in" style={{ ...lines, animationDelay: "210ms" }}>
          {copy.lines.map((l, i) => (
            <p key={i} style={line}>{l}</p>
          ))}
        </div>
        {sticker && (
          <div className="gl-rise-in" style={{ ...rewardWrap, animationDelay: "320ms" }}>
            <div style={{ ...disc, color, background: `radial-gradient(circle at 34% 28%, ${color}, ${color}99 65%, ${color}55)`, border: "3px solid rgba(255,255,255,0.92)", boxShadow: `0 6px 16px -4px rgba(0,0,0,0.6), 0 0 26px -6px ${color}` }}>
              {sticker.image ? <img src={sticker.image} alt={sticker.name} style={{ width: 60, height: 60, objectFit: "contain" }} /> : <Emblem i={emblem} mode="fill" />}
            </div>
            <div style={name}>{sticker.name}</div>
            <div style={tag}>{copy.rewardLabel}</div>
          </div>
        )}
        <div style={{ height: 1, background: theme.color.border, margin: "4px 0 0" }} />
        <button className="gl-rise-in" style={{ ...primaryBtn, animationDelay: "430ms" }} onClick={() => { sfx.click(); onContinue(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" />
          </svg>
          {copy.button}
        </button>
      </div>
    </div>
  );
}

/* ---------- styles (mirroring RewardReveal / the end card) ---------- */
const scrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 96, background: "rgba(4,4,10,0.74)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const card: React.CSSProperties = {
  position: "relative",
  width: 380,
  maxWidth: "92vw",
  maxHeight: "calc(100dvh - 40px)",
  overflowY: "auto",
  padding: "30px 40px 28px",
  borderRadius: 22,
  textAlign: "center",
  boxShadow: theme.color.shadow,
  background: `radial-gradient(420px 240px at 50% -10%, rgba(232,181,63,0.14), transparent 60%), ${theme.color.panel}`,
  border: "1px solid rgba(232,181,63,0.4)",
};
const kicker: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 10.5, letterSpacing: "0.22em", color: theme.color.dim };
const title: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 27, color: theme.color.gold, letterSpacing: "0.01em", marginTop: 4 };
const lines: React.CSSProperties = { margin: "16px 0 4px" };
const line: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.5, color: theme.color.text, margin: "0 0 8px" };
const rewardWrap: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, margin: "16px 0 20px" };
const disc: React.CSSProperties = { width: 84, height: 84, borderRadius: "50%", display: "grid", placeItems: "center" };
const name: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14, color: theme.color.text, lineHeight: 1.1 };
const tag: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 8.5, letterSpacing: "0.18em", color: theme.color.faint };
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
