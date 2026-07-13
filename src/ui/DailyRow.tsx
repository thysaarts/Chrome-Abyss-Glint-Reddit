import { useEffect, useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { itemName } from "../game/collection";
import type { DailyEntry } from "../game/challenges";
import { Glyph } from "./Glyphs";
import { NebuliteGem } from "./GameHeader";

/**
 * One daily-challenge row — the shared design used by the Challenges tab AND the
 * daily pop-ups (NEW CHALLENGES / CHALLENGE COMPLETED), so they always match.
 */
/** kind + id of a Collection reward you can jump to (sticker book / customise). */
export type RewardNav = (kind: "sticker" | "music" | "theme", id: string) => void;

export function DailyRow({ entry, done, best, onQuickPlay, onOpenReward }: { entry: DailyEntry; done: boolean; best: number; onQuickPlay?: () => void; onOpenReward?: RewardNav }) {
  const c = entry;
  const numeric = c.target > 1;
  return (
    <div style={{ ...card, ...dailyRow, ...(done ? { opacity: 0.85 } : {}) }}>
      <div style={{ ...dailyIco, ...(done ? doneIco : {}) }}>{done ? <CheckIcon /> : <Glyph name={c.icon || c.type} />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...dailyTitle, ...(done ? { color: theme.color.dim, textDecoration: "line-through" } : {}) }}>{c.text}</div>
        <div style={dailyMeta}>
          {done ? (
            <span style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.08em", color: theme.color.good }}>{CONTENT.challenges.doneLabel} ✓</span>
          ) : (
            <>
              {numeric && (
                <>
                  <div style={miniProg}><i style={{ display: "block", height: "100%", borderRadius: 5, width: `${Math.min(100, (best / c.target) * 100)}%`, background: "linear-gradient(90deg,#9d7bff,#c084fc)" }} /></div>
                  {/* the counter must stay on one line — a long reward name used to
                      squeeze it into a 3-line "1 / 2" stack (see bug011) */}
                  <span style={{ fontFamily: theme.fonts.mono, fontSize: 9.5, color: theme.color.dim, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flex: "0 0 auto" }}>{best.toLocaleString()} / {c.target.toLocaleString()}</span>
                </>
              )}
              <DailyReward entry={c} onOpenReward={onOpenReward} />
            </>
          )}
        </div>
      </div>
      {!done && onQuickPlay && (
        <button style={qplay} onClick={() => { sfx.click(); onQuickPlay(); }}>
          <span style={{ marginBottom: 1 }}>▶</span>
          <span>{CONTENT.challenges.quickPlay.split(" ")[0]}</span>
          <span>{CONTENT.challenges.quickPlay.split(" ").slice(1).join(" ")}</span>
        </button>
      )}
    </div>
  );
}

/** Live countdown to the local midnight daily reset (H:MM:SS). */
export function useResetCountdown(): string {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now); end.setHours(24, 0, 0, 0);
      let s = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      const h = Math.floor(s / 3600); s %= 3600;
      const m = Math.floor(s / 60); const ss = s % 60;
      setTxt(`${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return txt;
}

export function CheckIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

// today's daily reward: the Nebulite payout, or the linked Collection item's name.
// Item rewards are tappable — they jump to the item in the Collection.
export function DailyReward({ entry, onOpenReward }: { entry: DailyEntry; onOpenReward?: RewardNav }) {
  if (entry.rewardKind === "nebulite") {
    const per = CONTENT.challenges.nebulitePerDaily ?? 5;
    return (
      <span style={{ ...rwChip, color: "#ecdfff", borderColor: "rgba(157,123,255,0.45)", background: "rgba(157,123,255,0.12)", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <NebuliteGem size={12} /> {per}
      </span>
    );
  }
  // truncate a long item name so it can't push the progress counter onto extra
  // lines (bug011). Character-capped with an ellipsis, plus a hard maxWidth guard.
  const full = itemName(entry.rewardKind, entry.rewardId);
  const NAME_MAX = 14;
  const short = full.length > NAME_MAX ? full.slice(0, NAME_MAX).trimEnd() + "…" : full;
  return <RewardPill kind={entry.rewardKind} id={entry.rewardId} full={full} short={short} onOpenReward={onOpenReward} />;
}

/** The item-reward pill — shared look; tappable when a nav handler is supplied. */
export function RewardPill({ kind, id, full, short, onOpenReward }: { kind: "sticker" | "music" | "theme"; id: string; full: string; short?: string; onOpenReward?: RewardNav }) {
  const label = short ?? full;
  const base: React.CSSProperties = { ...rwChip, color: "#e2bbff", borderColor: "rgba(192,132,252,0.42)", background: "rgba(192,132,252,0.12)", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", flex: "0 1 auto" };
  if (!onOpenReward) return <span title={full} style={base}>{label}</span>;
  return (
    <button
      title={full}
      onClick={(e) => { e.stopPropagation(); sfx.click(); onOpenReward(kind, id); }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ ...base, cursor: "pointer", fontWeight: 500, letterSpacing: "0.06em", display: "inline-block" }}
    >
      {label}
    </button>
  );
}

/* ---- styles (mirroring the Challenges tab) ---- */
export const dailyCard: React.CSSProperties = { background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))", border: `1px solid ${theme.color.border}`, borderRadius: 15, boxShadow: "0 10px 22px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
const card = dailyCard;
const rwChip: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap", border: "1px solid" };
const dailyRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 13, padding: "13px 14px" };
const dailyIco: React.CSSProperties = { width: 42, height: 42, flexShrink: 0, borderRadius: 11, display: "grid", placeItems: "center", background: "radial-gradient(circle at 35% 30%, rgba(192,132,252,0.22), rgba(157,123,255,0.06))", border: "1px solid rgba(157,123,255,0.32)", color: theme.color.accent };
const doneIco: React.CSSProperties = { background: "radial-gradient(circle at 35% 30%, rgba(52,217,139,0.24), rgba(52,217,139,0.05))", border: "1px solid rgba(52,217,139,0.4)", color: theme.color.good };
const dailyTitle: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14, color: theme.color.text };
const dailyMeta: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginTop: 6 };
const miniProg: React.CSSProperties = { flex: 1, height: 5, borderRadius: 5, background: "rgba(0,0,0,0.35)", overflow: "hidden" };
const qplay: React.CSSProperties = { flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.05, width: 64, padding: "8px 6px", borderRadius: 11, border: "none", borderBottom: "2.5px solid #7d3fc4", boxShadow: "0 8px 18px -6px rgba(176,107,245,0.6)", cursor: "pointer", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, letterSpacing: "0.02em" };
