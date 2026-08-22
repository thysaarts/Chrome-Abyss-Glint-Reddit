import { useEffect, useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { SET_BONUS_NEBULITE } from "../game/challenges";
import type { DailyEntry } from "../game/challenges";
import type { DailyState } from "../game/stats";
import { DailyRow, useResetCountdown } from "./DailyRow";
import type { RewardNav } from "./DailyRow";
import { NebuliteGem } from "./GameHeader";
import { MiniPopup } from "./PopupCard";
import { renderRich } from "./richText";

/** The one-off bonus for clearing all three of a day's challenges. */

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
  onPlayVersus,
  onClose,
  onOpenReward,
}: {
  kind: "new" | "done";
  entries: DailyEntry[];
  daily: DailyState;
  onQuickPlay: () => void;
  onPlayVersus?: () => void;
  onClose: () => void;
  onOpenReward?: RewardNav;
}) {
  const C = CONTENT.challenges;
  return (
    <MiniPopup onClose={onClose} width={400} zIndex={94} cardStyle={cardSkin}>
      <DailyPopupBody kind={kind} entries={entries} daily={daily} onQuickPlay={onQuickPlay} onPlayVersus={onPlayVersus} onClose={onClose} onOpenReward={onOpenReward} />
      <button style={gotIt} onClick={() => { sfx.click(); onClose(); }}>{C.gotIt}</button>
    </MiniPopup>
  );
}

/** The pop-up's INNER content (title → intro → set-bonus/reset row → rows),
 *  extracted so the run-end DAILY CLEARED slides can reuse the "done" card as
 *  their finale without duplicating the count-up/bonus/reset logic. */
export function DailyPopupBody({
  kind,
  entries,
  daily,
  onQuickPlay,
  onPlayVersus,
  onClose,
  onOpenReward,
}: {
  kind: "new" | "done";
  entries: DailyEntry[];
  daily: DailyState;
  onQuickPlay?: () => void;
  onPlayVersus?: () => void;
  onClose?: () => void;
  onOpenReward?: RewardNav;
}) {
  const C = CONTENT.challenges;
  const resetIn = useResetCountdown();

  // the "done" pop-up celebrates the +10 all-cleared set bonus: the count ticks
  // 0 → 10 with a boost sting (the wallet was already credited at run end).
  const [bonusShown, setBonusShown] = useState(0);
  // THE SET-BONUS PERK (dark until the paywall flips): free players still clear
  // all three dailies — the +10 cherry shows padlocked instead of counting up
  // REDDIT ADAPTATION: no paywall here — the set bonus is never gated
  const bonusLocked = false;
  useEffect(() => {
    if (kind !== "done" || bonusLocked) return;
    let iv: number | undefined;
    const t = window.setTimeout(() => {
      sfx.nebDouble();
      iv = window.setInterval(() => setBonusShown((v) => { const n = v + 1; if (n >= SET_BONUS_NEBULITE && iv) window.clearInterval(iv); return Math.min(SET_BONUS_NEBULITE, n); }), 70);
    }, 500);
    return () => { window.clearTimeout(t); if (iv) window.clearInterval(iv); };
  }, [kind]);

  return (
    <>
        <div style={kicker}>{kind === "done" ? C.dailyDoneTitle : C.dailyNewTitle}</div>
        <p style={intro}>{renderRich(kind === "done" ? C.dailyDoneIntro : C.dailyNewIntro)}</p>

        {kind === "done" && (
          /* the +10 all-cleared set bonus (counting up) and the reset countdown,
             side by side on one row (bug041 — they used to stack) */
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={bonusBanner}>
              {/* a quiet mono LABEL — the old gradient chip read as a button (user, 2026-08-20) */}
              <span className="gl-drop-in" style={cellLabel}>{C.setBonus}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 17, color: "#e2bbff", fontVariantNumeric: "tabular-nums" }}>
                <NebuliteGem size={15} /> +{bonusShown}
              </span>
            </div>
            <div style={resetPill}>
              <span style={cellLabel}>{C.resetPrefix}</span>
              <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 15, color: theme.color.gold, fontVariantNumeric: "tabular-nums" }}>{resetIn}</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {entries.map((c) => (
            <DailyRow
              key={c.id}
              entry={c}
              done={daily.done.includes(c.id)}
              best={daily.progress[c.id] ?? 0}
              onQuickPlay={kind === "new" && onQuickPlay ? () => { onClose?.(); onQuickPlay(); } : undefined}
              onPlayVersus={kind === "new" && onPlayVersus ? () => { onClose?.(); onPlayVersus(); } : undefined}
              onOpenReward={onOpenReward ? (k, id) => { onClose?.(); onOpenReward(k, id); } : undefined}
            />
          ))}
        </div>
    </>
  );
}

// skin only — MiniPopup owns width / cap / scroll / shadow
const cardSkin: React.CSSProperties = {
  padding: "24px 22px 20px",
  borderRadius: 20,
  background: `radial-gradient(460px 260px at 50% -12%, rgba(157,123,255,0.16), transparent 62%), ${theme.color.panel}`,
  border: "1px solid rgba(157,123,255,0.4)",
};
const kicker: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", color: theme.color.text, textAlign: "center" };
const intro: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 12.5, lineHeight: 1.5, color: theme.color.dim, textAlign: "center", margin: "8px 6px 14px" };
// the two share one row (flex: 1 each) and MATCHING geometry, sized to sit flush
// with the challenge rows below — the reset cell used to overflow the card's
// right edge, and its pill-round shape clashed with the square banner (bug, 2026-08-20)
const bonusBanner: React.CSSProperties = { flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 10px", borderRadius: 12, background: "rgba(157,123,255,0.12)", border: "1px solid rgba(157,123,255,0.4)" };
const resetPill: React.CSSProperties = { flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "8px 10px", borderRadius: 12, background: "rgba(232,181,63,0.08)", border: "1px solid rgba(232,181,63,0.3)" };
// the shared quiet label style for both cells
const cellLabel: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.12em", color: theme.color.faint, whiteSpace: "nowrap" };
const gotIt: React.CSSProperties = { width: "100%", marginTop: 16, padding: "12px 16px", borderRadius: 12, border: "none", borderBottom: "3px solid #7d3fc4", boxShadow: "0 10px 22px -8px rgba(176,107,245,0.6)", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14, cursor: "pointer" };
