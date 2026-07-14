import { useEffect } from "react";
import { theme } from "../theme/theme";
import { sfx } from "../audio/sfx";
import type { DailyResponse } from "../../shared/api";
import type { DailyMetric } from "../../shared/api";
import { CommunityDailyCard } from "./ChallengesPage";

/**
 * NEW COMMUNITY CHALLENGE — the pop-up shown on entering the Ascent menu, once
 * per challenge day (UTC), before the regular DAILY CHALLENGES pop-up gets its
 * turn. Body = the exact Community Daily card from the Challenges tab.
 */
export function CommunityDailyPopup({
  daily,
  onPlay,
  onClose,
}: {
  daily: DailyResponse;
  onPlay: (day: string, seed: number, metric: DailyMetric) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={scrim} className="gl-fade" onClick={onClose}>
      <div style={card} className="gl-screen-in" onClick={(e) => e.stopPropagation()}>
        <div style={kicker}>NEW COMMUNITY CHALLENGE!</div>
        <p style={intro}>One board, the whole community, one day — today's challenge is live.</p>
        <CommunityDailyCard daily={daily} onPlay={() => { onClose(); onPlay(daily.day, daily.seed, daily.metric); }} />
        <button style={gotIt} onClick={() => { sfx.click(); onClose(); }}>Got it</button>
      </div>
    </div>
  );
}

/* styling mirrors DailyChallengePopup so the two daily pop-ups read as one family */
const scrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 95, background: "rgba(4,4,10,0.76)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const card: React.CSSProperties = {
  position: "relative",
  width: 400,
  maxWidth: "94vw",
  maxHeight: "calc(100dvh - 40px)",
  overflowY: "auto",
  padding: "24px 22px 20px",
  borderRadius: 20,
  boxShadow: theme.color.shadow,
  background: `radial-gradient(460px 260px at 50% -12%, rgba(232,181,63,0.14), transparent 62%), ${theme.color.panel}`,
  border: "1px solid rgba(232,181,63,0.45)",
};
const kicker: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 21, letterSpacing: "0.02em", color: theme.color.gold, textAlign: "center", textShadow: "0 0 18px rgba(232,181,63,0.45)" };
const intro: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 12.5, lineHeight: 1.5, color: theme.color.dim, textAlign: "center", margin: "8px 0 16px" };
const gotIt: React.CSSProperties = { width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 13, border: "none", cursor: "pointer", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", borderBottom: "3px solid #7d3fc4", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14.5, boxShadow: "0 10px 24px -8px rgba(176,107,245,0.7)" };
