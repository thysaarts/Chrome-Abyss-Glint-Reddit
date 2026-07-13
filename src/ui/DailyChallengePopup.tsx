import { useEffect, useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import type { DailyEntry } from "../game/challenges";
import type { DailyState } from "../game/stats";
import { DailyRow, useResetCountdown } from "./DailyRow";
import type { RewardNav } from "./DailyRow";
import { NebuliteGem } from "./GameHeader";

/** The one-off bonus for clearing all three of a day's challenges. */
const SET_BONUS = 10;

/**
 * The daily-challenge pop-up shown on the Ascent menu once a day:
 *  - "new"  → NEW CHALLENGES: today's three, with Quick-play, when outstanding.
 *  - "done" → CHALLENGE COMPLETED: the reset countdown + the three completed, when
 *             all of today's challenges are cleared.
 * Reuses the exact Challenges-tab row design (DailyRow).
 */
export function DailyChallengePopup({
  kind,
  entries,
  daily,
  onQuickPlay,
  onClose,
  onOpenReward,
}: {
  kind: "new" | "done";
  entries: DailyEntry[];
  daily: DailyState;
  onQuickPlay: () => void;
  onClose: () => void;
  onOpenReward?: RewardNav;
}) {
  const C = CONTENT.challenges;
  const resetIn = useResetCountdown();

  // the "done" pop-up celebrates the +10 all-cleared set bonus: the count ticks
  // 0 → 10 with a boost sting (the wallet was already credited at run end).
  const [bonusShown, setBonusShown] = useState(0);
  useEffect(() => {
    if (kind !== "done") return;
    let iv: number | undefined;
    const t = window.setTimeout(() => {
      sfx.nebDouble();
      iv = window.setInterval(() => setBonusShown((v) => { const n = v + 1; if (n >= SET_BONUS && iv) window.clearInterval(iv); return Math.min(SET_BONUS, n); }), 70);
    }, 500);
    return () => { window.clearTimeout(t); if (iv) window.clearInterval(iv); };
  }, [kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={scrim} className="gl-fade" onClick={onClose}>
      <div style={card} className="gl-screen-in" onClick={(e) => e.stopPropagation()}>
        <div style={kicker}>{kind === "done" ? C.dailyDoneTitle : C.dailyNewTitle}</div>
        <p style={intro}>{kind === "done" ? C.dailyDoneIntro : C.dailyNewIntro}</p>

        {kind === "done" && (
          <>
            {/* the +10 all-cleared set bonus, counting up */}
            <div style={bonusBanner}>
              <span className="gl-drop-in" style={{ fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 13, color: "#1a0b2e", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", borderRadius: 8, padding: "3px 9px", boxShadow: "0 0 14px rgba(176,107,245,0.6)" }}>SET BONUS</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 18, color: "#e2bbff", fontVariantNumeric: "tabular-nums" }}>
                <NebuliteGem size={16} /> +{bonusShown}
              </span>
            </div>
            <div style={resetPill}>
              <span style={{ fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.16em", color: theme.color.faint }}>{C.resetPrefix}</span>
              <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 15, color: theme.color.gold, fontVariantNumeric: "tabular-nums" }}>{resetIn}</span>
            </div>
          </>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {entries.map((c) => (
            <DailyRow
              key={c.id}
              entry={c}
              done={daily.done.includes(c.id)}
              best={daily.progress[c.id] ?? 0}
              onQuickPlay={kind === "new" ? () => { onClose(); onQuickPlay(); } : undefined}
              onOpenReward={onOpenReward ? (k, id) => { onClose(); onOpenReward(k, id); } : undefined}
            />
          ))}
        </div>

        <button style={gotIt} onClick={() => { sfx.click(); onClose(); }}>Got it</button>
      </div>
    </div>
  );
}

const scrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 94, background: "rgba(4,4,10,0.76)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const card: React.CSSProperties = {
  position: "relative",
  width: 400,
  maxWidth: "94vw",
  maxHeight: "calc(100dvh - 40px)",
  overflowY: "auto",
  padding: "24px 22px 20px",
  borderRadius: 20,
  boxShadow: theme.color.shadow,
  background: `radial-gradient(460px 260px at 50% -12%, rgba(157,123,255,0.16), transparent 62%), ${theme.color.panel}`,
  border: "1px solid rgba(157,123,255,0.4)",
};
const kicker: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", color: theme.color.text, textAlign: "center" };
const intro: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 12.5, lineHeight: 1.5, color: theme.color.dim, textAlign: "center", margin: "8px 6px 14px" };
const bonusBanner: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "0 auto 10px", padding: "9px 16px", borderRadius: 12, width: "fit-content", background: "rgba(157,123,255,0.12)", border: "1px solid rgba(157,123,255,0.4)" };
const resetPill: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "0 auto 14px", padding: "8px 16px", borderRadius: 999, width: "fit-content", background: "rgba(232,181,63,0.08)", border: "1px solid rgba(232,181,63,0.3)" };
const gotIt: React.CSSProperties = { width: "100%", marginTop: 16, padding: "12px 16px", borderRadius: 12, border: "none", borderBottom: "3px solid #7d3fc4", boxShadow: "0 10px 22px -8px rgba(176,107,245,0.6)", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14, cursor: "pointer" };
