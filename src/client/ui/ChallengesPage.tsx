import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { LEVELS, Level } from "../levels/levels";
import { unlockedIndex } from "../levels/progress";
import { loadStats } from "../game/stats";
import { loadDaily, todayKey } from "../game/stats";
import { pickDailyChallenges, computeMilestones } from "../game/challenges";
import { itemName } from "../game/collection";
import { DailyRow, RewardPill, useResetCountdown } from "./DailyRow";
import type { RewardNav } from "./DailyRow";
import { useEffect, useState } from "react";
import { fetchDaily } from "../game/redditDaily";
import type { DailyResponse } from "../../shared/api";

/**
 * CHALLENGES tab — today's three daily challenges (pulled from the CMS bank,
 * date-seeded), lifetime milestone count-ups, and the next steps on the Ascent.
 */
export function ChallengesPage({ onQuickPlay, onPlayLevel, onOpenReward, onPlayDaily }: { onQuickPlay: () => void; onPlayLevel: (l: Level) => void; onOpenReward?: RewardNav; onPlayDaily?: (day: string, seed: number) => void }) {
  const C = CONTENT.challenges;
  const daily = loadDaily();
  const today = pickDailyChallenges(todayKey());
  const stats = loadStats();
  const milestones = computeMilestones(stats);

  const frontier = unlockedIndex();
  const active = LEVELS[frontier];
  const nextLocked = [LEVELS[frontier + 1], LEVELS[frontier + 2]].filter(Boolean) as Level[];
  // the challenge you complete IN a level to unlock the NEXT one = the following
  // level's unlock requirement (a level's own `unlock` is the requirement to
  // REACH it). It's not about the location — it's the objective you're playing for.
  const goalOf = (l: Level): string => LEVELS[l.num + 1]?.unlock || "Clear the board to conquer the Abyss";

  const resetIn = useResetCountdown();

  return (
    <div style={page}>
      {/* SUBREDDIT DAILY — the shared community board (only renders on Reddit) */}
      <CommunityDaily onPlayDaily={onPlayDaily} />

      {/* DAILY */}
      <div style={eyebrow}>
        <span>{C.dailyLabel} · {today.length} TODAY</span>
        <span style={{ color: theme.color.gold }}>{C.resetPrefix} {resetIn}</span>
      </div>
      <div style={stack}>
        {today.length === 0 && <div style={emptyCard}>{C.emptyBank}</div>}
        {today.map((c) => (
          <DailyRow key={c.id} entry={c} done={daily.done.includes(c.id)} best={daily.progress[c.id] ?? 0} onQuickPlay={onQuickPlay} onOpenReward={onOpenReward} />
        ))}
      </div>

      {/* MILESTONES */}
      <div style={eyebrow}><span>{C.milestonesLabel}</span><span style={{ color: theme.color.faint }}>{C.milestonesSub}</span></div>
      <div style={stack}>
        {milestones.map((m) => (
          <div key={m.key} style={{ ...card, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13.5, color: theme.color.text, flex: 1 }}>{m.name}</span>
              <span style={tierChip}>{m.maxed ? "MAX" : `TIER ${m.tier + 1}`}</span>
            </div>
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 12, color: theme.color.dim, fontVariantNumeric: "tabular-nums" }}>
              <b style={{ color: theme.color.text, fontWeight: 700 }}>{m.value.toLocaleString()}</b>{m.maxed ? "" : ` / ${m.target.toLocaleString()}`}
            </div>
            <div style={bar}><i style={{ position: "absolute", inset: "0 auto 0 0", borderRadius: 8, width: `${m.progress * 100}%`, background: "linear-gradient(90deg,#7fe9f5,#9d7bff)" }}><span className="gl-ms-sweep" style={msSweep} /></i></div>
            <div style={{ fontFamily: theme.fonts.sans, fontSize: 10.5, color: theme.color.faint }}>
              {m.maxed || !m.nextReward ? (
                "All rewards earned — maxed out."
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  Next:{" "}
                  {m.nextReward.rewardKind === "nebulite" ? (
                    <b style={{ color: "#e2bbff", fontWeight: 600 }}>✦ {m.nextReward.amount} Nebulite</b>
                  ) : (
                    <RewardPill
                      kind={m.nextReward.rewardKind as "sticker" | "music" | "theme"}
                      id={m.nextReward.rewardId}
                      full={itemName(m.nextReward.rewardKind as "sticker" | "music" | "theme", m.nextReward.rewardId)}
                      onOpenReward={onOpenReward}
                    />
                  )}{" "}
                  at {m.target.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* NEXT ON THE ASCENT */}
      {active && (
        <>
          <div style={eyebrow}><span>{C.ascentLabel}</span></div>
          <div style={card}>
            <div style={{ ...ascentRow, background: "linear-gradient(180deg, rgba(157,123,255,0.14), rgba(157,123,255,0.03))" }}>
              <LvlHex active num={active.num} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={ascentName}>{active.title}</div>
                {/* the active challenge — in the highlighted colour */}
                <div style={{ ...ascentReq, color: theme.color.accent }}>
                  <span style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.16em" }}>{C.nextUp}: </span>
                  {goalOf(active)}
                </div>
              </div>
              <button style={playBtn} onClick={() => { sfx.click(); onPlayLevel(active); }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" /></svg>
                {C.play}
              </button>
            </div>
            {nextLocked.map((l, i) => (
              <div key={l.num} style={{ ...ascentRow, borderBottom: i === nextLocked.length - 1 ? "none" : `1px solid ${theme.color.border}` }}>
                <LvlHex num={l.num} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...ascentName, color: "#b9b4d6" }}>{l.title}</div>
                  <div style={ascentReq}>{goalOf(l)}</div>
                </div>
                <span style={{ color: theme.color.faint, flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---- the Reddit community daily ---- */

/** Today's SHARED board: one seed for the whole subreddit, best score per
 *  player on a Redis leaderboard. Renders nothing outside Reddit (the /api
 *  endpoints only exist inside the Devvit app). */
function CommunityDaily({ onPlayDaily }: { onPlayDaily?: (day: string, seed: number) => void }) {
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  useEffect(() => {
    let live = true;
    void fetchDaily().then((d) => { if (live) setDaily(d); });
    return () => { live = false; };
  }, []);
  if (!daily || !onPlayDaily) return null;
  const medal = (r: number) => (r === 1 ? "#e8b53f" : r === 2 ? "#c9ccdd" : r === 3 ? "#c98d5a" : theme.color.faint);
  return (
    <>
      <div style={eyebrow}>
        <span>COMMUNITY DAILY</span>
        <span style={{ color: theme.color.gold }}>{daily.day}</span>
      </div>
      <div style={{ ...card, border: "1px solid rgba(157,123,255,0.42)", background: "linear-gradient(180deg, rgba(157,123,255,0.13), rgba(16,19,34,0.92))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14.5, color: theme.color.text }}>Today's shared board</div>
            <div style={{ fontFamily: theme.fonts.sans, fontSize: 11, lineHeight: 1.45, color: theme.color.dim, marginTop: 3 }}>
              Everyone in the community plays the same board today. One score counts — your best.
            </div>
          </div>
          <button style={playBtn} onClick={() => { sfx.click(); onPlayDaily(daily.day, daily.seed); }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" /></svg>
            {daily.yourScore != null ? "RETRY" : "PLAY"}
          </button>
        </div>
        {daily.yourScore != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderTop: `1px solid ${theme.color.border}`, fontFamily: theme.fonts.mono, fontSize: 11, color: theme.color.dim, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: theme.color.gold }}>YOUR BEST</span>
            <b style={{ color: theme.color.text }}>{daily.yourScore.toLocaleString()}</b>
            {daily.yourRank != null && <span>· #{daily.yourRank} in the community</span>}
          </div>
        )}
        {daily.leaderboard.length > 0 && (
          <div style={{ padding: "4px 14px 12px", borderTop: daily.yourScore == null ? `1px solid ${theme.color.border}` : "none" }}>
            {daily.leaderboard.map((e) => (
              <div key={e.username} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontFamily: theme.fonts.mono, fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ width: 22, color: medal(e.rank), fontWeight: 700 }}>#{e.rank}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: e.username === daily.username ? theme.color.accent : theme.color.dim }}>u/{e.username}</span>
                <b style={{ color: theme.color.text }}>{e.score.toLocaleString()}</b>
              </div>
            ))}
          </div>
        )}
        {daily.leaderboard.length === 0 && daily.yourScore == null && (
          <div style={{ padding: "10px 14px 13px", borderTop: `1px solid ${theme.color.border}`, fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.color.faint }}>
            No scores yet today — be the first on the board.
          </div>
        )}
      </div>
    </>
  );
}

/* ---- pieces ---- */
function LvlHex({ active, num }: { active?: boolean; num?: number }) {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" style={{ flexShrink: 0 }}>
      <polygon points="15,1 29,9 29,25 15,33 1,25 1,9" fill={active ? "#181c2c" : "#141726"} stroke={active ? "#c9a2ff" : "#33364a"} strokeWidth={active ? 1.8 : 1.4} />
      {num != null && (
        <text x="15" y="17.5" textAnchor="middle" dominantBaseline="central" fontFamily={theme.fonts.disp} fontSize="12" fontWeight="700" fill={active ? "#e6d8ff" : "#8a85b8"}>{num}</text>
      )}
    </svg>
  );
}

/* ---- styles ---- */
// full-width scroll (scrollbar sits at the far right, like every tab) with the
// content centred at 460px via horizontal padding — consistent across all tabs
const page: React.CSSProperties = { position: "absolute", inset: 0, overflowY: "auto", paddingTop: 2, paddingBottom: 30, paddingLeft: "max(18px, calc(50% - 212px))", paddingRight: "max(18px, calc(50% - 212px))" };
const eyebrow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.22em", color: theme.color.faint, margin: "20px 2px 12px" };
const stack: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const card: React.CSSProperties = { background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))", border: `1px solid ${theme.color.border}`, borderRadius: 15, boxShadow: "0 10px 22px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
const emptyCard: React.CSSProperties = { ...card, padding: "18px 14px", textAlign: "center", fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.color.faint };
const tierChip: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.14em", color: theme.color.gold, padding: "3px 8px", borderRadius: 6, background: "rgba(232,181,63,0.1)", border: "1px solid rgba(232,181,63,0.3)" };
const bar: React.CSSProperties = { height: 8, borderRadius: 8, background: "rgba(0,0,0,0.4)", overflow: "hidden", position: "relative" };
const msSweep: React.CSSProperties = { position: "absolute", top: 0, bottom: 0, right: 0, width: "40%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" };
const ascentRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${theme.color.border}` };
const ascentName: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, color: theme.color.text };
const ascentReq: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 11, color: theme.color.dim, marginTop: 2 };
const playBtn: React.CSSProperties = { flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 11, border: "none", cursor: "pointer", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", borderBottom: "3px solid #7d3fc4", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", boxShadow: "0 8px 18px -6px rgba(176,107,245,0.65)" };
