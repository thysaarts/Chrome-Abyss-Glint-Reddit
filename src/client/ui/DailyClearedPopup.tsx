/**
 * DAILY CLEARED — the run-end celebration for completed daily challenges
 * (design + flow decided 2026-08-20). One slide per daily cleared this run:
 * the issuing character steps forward (big avatar under the title), speaks a
 * line in their voice (CMS: challenges.voiceLines, keyed by challenge TYPE),
 * and the reward is shown — the +5 Nebulite, or the item's thumbnail + name
 * (item dailies celebrate HERE instead of the generic RewardReveal; unrelated
 * rewards keep their own pop-up, shown after this one).
 *
 * When the run closed out ALL THREE dailies, the CHALLENGE COMPLETED card
 * joins as the FINAL slide (it celebrates the set + bonus; the slides before
 * it celebrate the individual rewards it doesn't list). Multi-slide state is
 * shown by dots under the card; Got it advances, the last slide's closes.
 */
import { useState } from "react";
import { useSlideSwipe } from "./useSlideSwipe";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import type { DailyEntry } from "../game/challenges";
import type { DailyState } from "../game/stats";
import type { EarnedReward } from "../game/collection";
import { DailyRow } from "./DailyRow";
import type { RewardNav } from "./DailyRow";
import { DailyPopupBody } from "./DailyChallengePopup";
import { NebuliteGem } from "./GameHeader";
import { MiniPopup } from "./PopupCard";
import { Emblem } from "./CollectionPage";
import { CHARACTER_FOR, type DailyCharacter } from "./dailyCharacters";
import { championAvatar } from "./champions";

export type DailyClearedReward = { kind: "nebulite"; amount: number } | EarnedReward;
export interface DailyClearedSlide {
  entry: DailyEntry;
  reward: DailyClearedReward;
}

const KIND_LABEL = (): Record<EarnedReward["kind"], string> => ({
  sticker: CONTENT.rewardReveal.kindSticker,
  music: CONTENT.rewardReveal.kindMusic,
  theme: CONTENT.rewardReveal.kindTheme,
  decor: CONTENT.rewardReveal.kindDecor,
});

export function DailyClearedPopup({
  slides,
  showSetDone,
  entries,
  daily,
  doneCount,
  onOpenReward,
  onDone,
  onDismiss,
}: {
  slides: DailyClearedSlide[];
  /** append the CHALLENGE COMPLETED card as the final slide (set closed this run) */
  showSetDone: boolean;
  entries: DailyEntry[];
  daily: DailyState;
  doneCount: number;
  onOpenReward?: RewardNav;
  /** the whole sequence was seen — clear the queue and continue the flow */
  onDone: () => void;
  /** backdrop dismissal — the queue stays pending (resurfaces on the Ascent) */
  onDismiss: () => void;
}) {
  const C = CONTENT.challenges;
  const [idx, setIdx] = useState(0);
  const total = slides.length + (showSetDone ? 1 : 0);
  const isFinal = idx >= total - 1;
  const advance = () => {
    sfx.click();
    if (isFinal) onDone();
    else { sfx.walletGain(); setIdx((i) => i + 1); }
  };

  // swipe between the slides — the dots stay as the tap alternative
  const swipe = useSlideSwipe(total, idx, setIdx);

  return (
    <MiniPopup onClose={onDismiss} width={400} zIndex={95} cardStyle={cardSkin}>
      <div {...swipe.bind} style={swipe.style}>
        {idx < slides.length ? (
          <ClearedSlide slide={slides[idx]} doneCount={doneCount} totalCount={entries.length} />
        ) : (
          <DailyPopupBody kind="done" entries={entries} daily={daily} onOpenReward={onOpenReward} />
        )}
      </div>

      {total > 1 && (
        <div style={dotsRow}>
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              aria-label={`slide ${i + 1} of ${total}`}
              onClick={() => { if (i !== idx) { sfx.click(); setIdx(i); } }}
              style={{ ...dot, ...(i === idx ? dotActive : {}) }}
            />
          ))}
        </div>
      )}

      <button style={gotIt} onClick={advance}>{C.gotIt}</button>
    </MiniPopup>
  );
}

function ClearedSlide({ slide, doneCount, totalCount }: { slide: DailyClearedSlide; doneCount: number; totalCount: number }) {
  const C = CONTENT.challenges;
  const character: DailyCharacter = CHARACTER_FOR[slide.entry.type] ?? "broker";
  const names = C.characterNames as Record<string, string>;
  const lines = C.voiceLines as Record<string, string>;
  const countLabel = C.clearedCountLabel.replace("{done}", String(doneCount)).replace("{total}", String(totalCount));
  return (
    <>
      {/* avatar leads, title sits BELOW it — the layout Thys picked from the
          mockups (2026-08-20; was accidentally shipped inverted at first) */}
      <img
        src={championAvatar(character, "lg")}
        alt={names[character] ?? character}
        className="gl-float-y"
        style={{ width: 108, height: "auto", display: "block", margin: "2px auto 0", filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.55))" }}
      />
      <div style={{ ...kicker, marginTop: 12 }}>{C.dailyClearedTitle}</div>
      <div style={{ textAlign: "center", margin: "10px 8px 2px" }}>
        <p style={voiceLine}>“{lines[slide.entry.type] ?? ""}”</p>
        <div style={voiceName}>— {names[character] ?? character}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        <DailyRow entry={slide.entry} done best={slide.entry.target} />
      </div>

      <div style={statusRow}>
        {slide.reward.kind === "nebulite" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 15, color: "#e2bbff" }}>
            <NebuliteGem size={14} /> +{slide.reward.amount}
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            {slide.reward.image ? (
              <img src={slide.reward.image} alt="" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(157,123,255,0.4)", background: "rgba(0,0,0,0.3)" }} />
            ) : (
              <Emblem i={slide.reward.emblem ?? 0} mode="fill" size={38} />
            )}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13.5, color: theme.color.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slide.reward.name}</span>
              <span style={{ display: "block", fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.16em", color: theme.color.faint, marginTop: 2 }}>{KIND_LABEL()[slide.reward.kind]}</span>
            </span>
          </span>
        )}
        <span style={{ fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.14em", color: theme.color.faint, whiteSpace: "nowrap", flex: "0 0 auto" }}>
          {countLabel}
        </span>
      </div>
    </>
  );
}

const cardSkin: React.CSSProperties = {
  padding: "24px 22px 20px",
  borderRadius: 20,
  background: `radial-gradient(460px 260px at 50% -12%, rgba(157,123,255,0.16), transparent 62%), ${theme.color.panel}`,
  border: "1px solid rgba(157,123,255,0.4)",
};
const kicker: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", color: theme.color.text, textAlign: "center" };
const voiceLine: React.CSSProperties = { fontFamily: theme.fonts.sans, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.5, color: "#cdb9ff", margin: 0 };
const voiceName: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.2em", color: theme.color.faint, marginTop: 6 };
const statusRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", marginTop: 10, borderRadius: 12, background: "rgba(157,123,255,0.1)", border: "1px solid rgba(157,123,255,0.32)" };
const dotsRow: React.CSSProperties = { display: "flex", justifyContent: "center", gap: 7, marginTop: 14 };
const dot: React.CSSProperties = { width: 7, height: 7, borderRadius: "50%", padding: 0, border: "none", cursor: "pointer", background: "rgba(157,123,255,0.28)" };
const dotActive: React.CSSProperties = { background: theme.color.accent, boxShadow: "0 0 8px rgba(157,123,255,0.8)" };
const gotIt: React.CSSProperties = { width: "100%", marginTop: 14, padding: "12px 16px", borderRadius: 12, border: "none", borderBottom: "3px solid #7d3fc4", boxShadow: "0 10px 22px -8px rgba(176,107,245,0.6)", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14, cursor: "pointer" };
