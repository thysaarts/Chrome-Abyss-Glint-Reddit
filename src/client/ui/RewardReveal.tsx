import { useEffect } from "react";
import { theme } from "../theme/theme";
import { sfx } from "../audio/sfx";
import { REGIONS } from "../theme/regions";
import { Emblem, GLOW } from "./CollectionPage";
import type { EarnedReward } from "../game/collection";

/**
 * REWARD REVEAL — the step AFTER the game-end pop-up when a run earned one or
 * more collectibles: the end card's Continue leads here, and this card's
 * Continue carries on to wherever the flow was headed (the unlocked next level
 * or the Ascent map). Framed exactly like the end card — same scrim, width,
 * radius and layout rhythm — so the two read as one sequence.
 */
const KIND_LABEL: Record<EarnedReward["kind"], string> = { sticker: "STICKER", music: "MUSIC TRACK", theme: "BOARD THEME" };

export function RewardReveal({ rewards, onView, onContinue }: { rewards: EarnedReward[]; onView: (r: EarnedReward) => void; onContinue: () => void }) {
  const many = rewards.length > 1;
  // the card was celebrating silently — sound the gold "reward got" fanfare as it reveals
  useEffect(() => { sfx.rewardReveal(); }, []);
  return (
    <div style={scrim} className="gl-fade">
      <div style={card} className="gl-screen-in">
        {/* gloss sweep, like the end card's */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 22, overflow: "hidden", pointerEvents: "none" }}>
          <div className="gl-gloss" style={{ position: "absolute", top: 0, left: 0, width: "36%", height: "100%", background: "linear-gradient(100deg, transparent, rgba(210,230,255,0.07), transparent)" }} />
        </div>
        <div className="gl-rise-in" style={{ ...title, animationDelay: "60ms" }}>{many ? "REWARDS UNLOCKED" : "REWARD UNLOCKED"}</div>
        <div className="gl-rise-in" style={{ ...sub, animationDelay: "120ms" }}>ADDED TO YOUR COLLECTION</div>
        <div className="gl-rise-in" style={{ ...grid, animationDelay: "200ms" }}>
          {rewards.map((r) => (
            <div key={`${r.kind}:${r.key}`} style={item}>
              <RewardMedallion r={r} />
              <div style={name}>{r.name}</div>
              <div style={tag}>{KIND_LABEL[r.kind]}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: theme.color.border, margin: "4px 0 0" }} />
        <button style={primaryBtn} onClick={() => { sfx.click(); onContinue(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" />
          </svg>
          Continue
        </button>
        <button style={secondaryBtn} onClick={() => { sfx.click(); onView(rewards[0]); }}>View in Collection</button>
      </div>
    </div>
  );
}

function RewardMedallion({ r }: { r: EarnedReward }) {
  if (r.kind === "sticker") {
    const color = GLOW[(r.emblem ?? 0) % GLOW.length];
    return (
      <div style={{ ...disc, color, background: `radial-gradient(circle at 34% 28%, ${color}, ${color}99 65%, ${color}55)`, border: "3px solid rgba(255,255,255,0.92)", boxShadow: `0 6px 16px -4px rgba(0,0,0,0.6), 0 0 26px -6px ${color}` }}>
        {r.image ? <img src={r.image} alt={r.name} style={{ width: 60, height: 60, objectFit: "contain" }} /> : <Emblem i={r.emblem ?? 0} mode="fill" />}
      </div>
    );
  }
  if (r.kind === "theme") {
    const rt = r.region ? REGIONS[r.region] : null;
    const fill = rt ? rt.accent : "#7c5ae0";
    return (
      <div style={{ ...disc, overflow: "hidden", background: rt ? rt.tileWash : "radial-gradient(120% 100% at 50% 0%, rgba(124,90,224,0.4), transparent 70%)", border: "3px solid rgba(255,255,255,0.9)" }}>
        {r.image ? (
          <img src={r.image} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", gap: 3, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
            {[0, 1, 2].map((i) => (
              <svg key={i} width="16" height="18" viewBox="0 0 20 23"><polygon points="10,1 19,6 19,17 10,22 1,17 1,6" fill={fill} opacity={0.7 + i * 0.1} stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" /></svg>
            ))}
          </div>
        )}
      </div>
    );
  }
  // music track
  return (
    <div style={{ ...disc, overflow: "hidden", color: theme.color.accent, background: "radial-gradient(circle at 34% 28%, rgba(157,123,255,0.9), rgba(90,60,180,0.7) 70%)", border: "3px solid rgba(255,255,255,0.9)", boxShadow: "0 6px 16px -4px rgba(0,0,0,0.6), 0 0 26px -6px rgba(157,123,255,0.8)" }}>
      {r.image ? (
        <img src={r.image} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.6" fill="#fff" stroke="none" /><circle cx="16.5" cy="16" r="2.6" fill="#fff" stroke="none" /></svg>
      )}
    </div>
  );
}

/* ---------- styles (mirroring the end card's frame) ---------- */
const scrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 95, background: "rgba(4,4,10,0.74)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
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
  // the end card's recipe with the reward's gold cast
  background: `radial-gradient(420px 240px at 50% -10%, rgba(232,181,63,0.14), transparent 60%), ${theme.color.panel}`,
  border: "1px solid rgba(232,181,63,0.4)",
};
const title: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 27, color: theme.color.gold, letterSpacing: "0.01em" };
const sub: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 10.5, letterSpacing: "0.22em", color: theme.color.dim, marginTop: 4 };
const grid: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", margin: "22px 0" };
const item: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 108 };
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
const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  marginTop: 10,
  padding: "11px 30px",
  borderRadius: 14,
  background: "none",
  border: `1px solid ${theme.color.border}`,
  color: theme.color.dim,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
};
