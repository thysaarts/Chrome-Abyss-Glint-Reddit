import { useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { topScores } from "../levels/progress";
import { displayScoreLabel } from "../levels/levels";
import { loadStats } from "../game/stats";
import { computeAchievements, statValue } from "../game/challenges";
import { Gem } from "./Gem";
import { TileGem } from "./TileGem";
import type { TileVal } from "../game/engine";

/**
 * ACHIEVEMENTS tab — lifetime stats, an expanding HIGH SCORES section (the same
 * rows as the top-bar high-scores popup), and the REWARDS gem case.
 */
export function AchievementsPage({ onOpenLeaderboard }: { onOpenLeaderboard?: () => void } = {}) {
  const A = CONTENT.achievements;
  const stats = loadStats();
  const scores = topScores();
  const bestScore = scores[0]?.score ?? 0;
  const rewards = computeAchievements(stats);
  const earnedCount = rewards.filter((r) => r.earned).length;
  const [open, setOpen] = useState(false);

  const rankColors: Record<number, [string, string]> = { 1: ["#ffd980", "#1a0b2e"], 2: ["#cfd6e6", "#0c0e16"], 3: ["#e0a06a", "#1a0b06"] };
  const shown = open ? scores.slice(0, 6) : scores.slice(0, 3);

  return (
    <div style={page}>
      {/* LIFETIME */}
      <div style={eyebrow}><span>{A.lifetimeLabel}</span></div>
      <div style={statGrid}>
        {A.stats.map((s) => {
          const v = statValue(s.key, stats, bestScore);
          return (
            <div key={s.key} style={{ ...card, ...statTile }}>
              <div style={{ ...statVal, ...(s.key === "bestScore" ? { color: "#ffd980" } : {}) }}>{v.toLocaleString()}</div>
              <div style={statLbl}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* HIGH SCORES (expanding) */}
      <button style={hsHead} onClick={() => { sfx.click(); setOpen((v) => !v); }} aria-expanded={open}>
        <span>{A.highScoresLabel}</span>
        {scores.length > 3 && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: theme.color.accent }}>
            <span>{open ? A.showLess : A.showAll}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.25s" }}><polyline points="6 9 12 15 18 9" /></svg>
          </span>
        )}
      </button>
      <div style={{ ...card, padding: "4px 14px", position: "relative", overflow: "hidden" }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: "linear-gradient(90deg,#e8b53f,#ffd980,#e8b53f)" }} />
        {scores.length === 0 && <div style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.color.faint, padding: "16px 0", textAlign: "center" }}>{A.noScores}</div>}
        {shown.map((r, i) => {
          const rank = i + 1;
          const [bg, ink] = rankColors[rank] ?? ["#20233a", "#9aa0ad"];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 0", borderBottom: i === shown.length - 1 ? "none" : `1px solid ${theme.color.border}` }}>
              <span style={{ width: 26, height: 26, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, transform: "rotate(45deg)", background: bg, color: ink, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12 }}><span style={{ transform: "rotate(-45deg)" }}>{rank}</span></span>
              <span style={{ flex: 1, fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 12, color: theme.color.dim }}>{displayScoreLabel(r.level)}</span>
              <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 19, color: "#ffd980", fontVariantNumeric: "tabular-nums" }}>{r.score.toLocaleString()}</span>
            </div>
          );
        })}
        {onOpenLeaderboard && (
          <button
            onClick={() => { sfx.click(); onOpenLeaderboard(); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "11px 0 12px", border: "none", borderTop: `1px solid ${theme.color.border}`, background: "none", cursor: "pointer", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 11.5, letterSpacing: "0.06em", color: theme.color.accent }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v3a6 6 0 0 1-12 0Z" /><path d="M6 6H4v1a3 3 0 0 0 3 3M18 6h2v1a3 3 0 0 1-3 3M9 15h6M8.5 19h7M10 15l-.5 4M14 15l.5 4" /></svg>
            COMMUNITY LEADERBOARD
          </button>
        )}
      </div>

      {/* REWARDS */}
      <div style={eyebrow}><span>{A.rewardsLabel}</span><span style={{ color: theme.color.faint }}>{earnedCount} / {rewards.length}</span></div>
      <div style={{ ...card, padding: "8px 4px" }}>
        <div style={rewardGrid}>
          {rewards.map((r, i) => (
            <div key={r.key} title={r.desc} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "13px 6px 12px", textAlign: "center" }}>
              {r.tileValue != null ? (
                // the bonus-gem achievements show the real in-game crystal, with
                // the same locked padlock pip the flat gems get when unearned
                <div style={{ position: "relative", width: 52, height: 52, display: "grid", placeItems: "center", filter: r.earned ? "drop-shadow(0 3px 10px rgba(0,0,0,0.5))" : "none" }}>
                  <TileGem value={r.tileValue as TileVal} size={48} dim={!r.earned} />
                  {!r.earned && (
                    <svg viewBox="0 0 12 11" width="15" height="14" style={{ position: "absolute", right: -1, bottom: 1 }} aria-hidden>
                      <rect x="1.5" y="4" width="9" height="7" rx="1.6" fill="#0b0d16" stroke="#6b6690" strokeWidth="1" />
                      <path d="M3.4 4 v-1.6 a2.6 2.6 0 0 1 5.2 0 v1.6" fill="none" stroke="#6b6690" strokeWidth="1" />
                    </svg>
                  )}
                </div>
              ) : (
                <Gem shape={r.shape} color={r.color} earned={r.earned} index={i} />
              )}
              <div style={{ fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 9.5, lineHeight: 1.2, color: r.earned ? theme.color.text : theme.color.faint }}>{r.name}</div>
              {/* the criteria: what earns it — turns green with a tick once achieved */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 8.5, lineHeight: 1.25, color: r.earned ? theme.color.good : theme.color.faint }}>
                {r.earned && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span>{r.desc}{r.progress && !r.earned ? ` · ${r.progress.current}/${r.progress.target}` : ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- styles ---- */
// full-width scroll (scrollbar at the far right) with content centred at 460px via
// horizontal padding — consistent with the other tabs
const page: React.CSSProperties = { position: "absolute", inset: 0, overflowY: "auto", paddingTop: 2, paddingBottom: 30, paddingLeft: "max(18px, calc(50% - 212px))", paddingRight: "max(18px, calc(50% - 212px))" };
const eyebrow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.22em", color: theme.color.faint, margin: "20px 2px 12px" };
const card: React.CSSProperties = { background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))", border: `1px solid ${theme.color.border}`, borderRadius: 15, boxShadow: "0 10px 22px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
const statGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 };
const statTile: React.CSSProperties = { padding: "13px 10px", textAlign: "center" };
const statVal: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 21, color: theme.color.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 };
const statLbl: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.1em", color: theme.color.faint, marginTop: 7 };
const hsHead: React.CSSProperties = { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.22em", color: theme.color.faint, margin: "20px 2px 12px", padding: 0 };
const rewardGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 };
