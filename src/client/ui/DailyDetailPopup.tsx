/**
 * DAILY CHALLENGE DETAIL — tapping a daily row on the Challenges tab opens this
 * browsable pop-up: the issuing character (big avatar), their challenge line in
 * quotes (CMS: challenges.introLines, keyed per challenge TYPE — the "here's
 * your task" voice, distinct from the completion voiceLines), the challenge
 * text (same line as the tab row), and the reward — the +5 Nebulite or the
 * item's thumbnail + name (previewed without granting). Dots + Got it cycle
 * through today's set, opening on the tapped challenge.
 */
import { useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import type { DailyEntry } from "../game/challenges";
import type { DailyState } from "../game/stats";
import { itemPreview, resolveDailyReward } from "../game/collection";
import { NebuliteGem } from "./GameHeader";
import { MiniPopup } from "./PopupCard";
import { Emblem } from "./CollectionPage";
import { CHARACTER_FOR, type DailyCharacter } from "./dailyCharacters";
import { championAvatar } from "./champions";
import { useSlideSwipe } from "./useSlideSwipe";

const KIND_LABEL = (): Record<"sticker" | "music" | "theme", string> => ({
  sticker: CONTENT.rewardReveal.kindSticker,
  music: CONTENT.rewardReveal.kindMusic,
  theme: CONTENT.rewardReveal.kindTheme,
});

export function DailyDetailPopup({
  entries,
  daily,
  startIndex,
  onClose,
}: {
  entries: DailyEntry[];
  daily: DailyState;
  startIndex: number;
  onClose: () => void;
}) {
  const C = CONTENT.challenges;
  const [idx, setIdx] = useState(Math.max(0, Math.min(startIndex, entries.length - 1)));
  const isLast = idx >= entries.length - 1;
  // an already-owned item reward presents (and pays) as Nebulite — only the
  // reward fields swap; id/type/text/target are untouched
  const entry = resolveDailyReward(entries[idx]);
  const character: DailyCharacter = CHARACTER_FOR[entry.type] ?? "broker";
  const names = C.characterNames as Record<string, string>;
  const lines = C.introLines as Record<string, string>;
  const done = daily.done.includes(entry.id);
  const best = daily.progress[entry.id] ?? 0;
  // swipe between today's challenges — the dots stay as the tap alternative
  const swipe = useSlideSwipe(entries.length, idx, setIdx);
  return (
    <MiniPopup onClose={onClose} width={400} zIndex={94} cardStyle={cardSkin}>
      <div {...swipe.bind} style={swipe.style}>
      {/* avatar leads, title below — same order as DAILY CLEARED (Thys's pick) */}
      <img
        src={championAvatar(character, "lg")}
        alt={names[character] ?? character}
        className="gl-float-y"
        style={{ width: 108, height: "auto", display: "block", margin: "2px auto 0", filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.55))" }}
      />
      <div style={{ ...kicker, marginTop: 12 }}>{C.dailyDetailTitle}</div>
      <div style={{ textAlign: "center", margin: "10px 8px 2px" }}>
        <p style={voiceLine}>“{lines[entry.type] ?? ""}”</p>
        <div style={voiceName}>— {names[character] ?? character}</div>
      </div>

      {/* the challenge itself — the exact line the tab row shows */}
      <div style={challengeLine}>{entry.text}</div>

      <div style={statusRow}>
        {entry.rewardKind === "nebulite" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 15, color: "#e2bbff" }}>
            <NebuliteGem size={14} /> +{CONTENT.challenges.nebulitePerDaily ?? 5}
          </span>
        ) : (
          (() => {
            const p = itemPreview(entry.rewardKind, entry.rewardId);
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                {p.image ? (
                  <img src={p.image} alt="" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(157,123,255,0.4)", background: "rgba(0,0,0,0.3)" }} />
                ) : (
                  <Emblem i={p.emblem ?? 0} mode="fill" size={38} />
                )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13.5, color: theme.color.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                  <span style={{ display: "block", fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.16em", color: theme.color.faint, marginTop: 2 }}>{KIND_LABEL()[entry.rewardKind]}</span>
                </span>
              </span>
            );
          })()
        )}
        {done ? (
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.1em", color: theme.color.good, whiteSpace: "nowrap", flex: "0 0 auto" }}>{C.doneLabel} ✓</span>
        ) : entry.target > 1 ? (
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.1em", color: theme.color.faint, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flex: "0 0 auto" }}>
            {best.toLocaleString()} / {entry.target.toLocaleString()}
          </span>
        ) : null}
      </div>
      </div>

      {entries.length > 1 && (
        <div style={dotsRow}>
          {entries.map((e, i) => (
            <button
              key={e.id}
              aria-label={`challenge ${i + 1} of ${entries.length}`}
              onClick={() => { if (i !== idx) { sfx.click(); setIdx(i); } }}
              style={{ ...dot, ...(i === idx ? dotActive : {}) }}
            />
          ))}
        </div>
      )}

      <button
        style={gotIt}
        onClick={() => {
          sfx.click();
          if (isLast) onClose();
          else setIdx((i) => i + 1);
        }}
      >
        {C.gotIt}
      </button>
    </MiniPopup>
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
const challengeLine: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 15, lineHeight: 1.4, color: theme.color.text, textAlign: "center", margin: "14px 10px 0" };
const statusRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", marginTop: 12, borderRadius: 12, background: "rgba(157,123,255,0.1)", border: "1px solid rgba(157,123,255,0.32)" };
const dotsRow: React.CSSProperties = { display: "flex", justifyContent: "center", gap: 7, marginTop: 14 };
const dot: React.CSSProperties = { width: 7, height: 7, borderRadius: "50%", padding: 0, border: "none", cursor: "pointer", background: "rgba(157,123,255,0.28)" };
const dotActive: React.CSSProperties = { background: theme.color.accent, boxShadow: "0 0 8px rgba(157,123,255,0.8)" };
const gotIt: React.CSSProperties = { width: "100%", marginTop: 14, padding: "12px 16px", borderRadius: 12, border: "none", borderBottom: "3px solid #7d3fc4", boxShadow: "0 10px 22px -8px rgba(176,107,245,0.6)", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14, cursor: "pointer" };
