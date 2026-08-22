import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { LEVELS, Level } from "../levels/levels";
import { unlockedIndex } from "../levels/progress";
import { loadStats } from "../game/stats";
import { loadDaily, todayKey } from "../game/stats";
import { pickDailyChallenges, computeMilestones } from "../game/challenges";
import { itemName } from "../game/collection";
import { DailyRow, RewardPill, ResetCountdownLabel } from "./DailyRow";
import { HouseDuelCard, TogetherSlider, DUEL_MIN_BET } from "./HouseDuel";
import { DailyDetailPopup } from "./DailyDetailPopup";
import { PopupCard } from "./PopupCard";
import { GemDetailView, gemDetailItems } from "./GemDetail";
import { TileGem } from "./TileGem";
import type { TileVal } from "../game/engine";
import { computeAchievements } from "../game/challenges";
import { fmt } from "../content/content";
import { SET_BONUS_NEBULITE } from "../game/challenges";
import { NebuliteGem } from "./GameHeader";
import type { RewardNav } from "./DailyRow";
import { useEffect, useState } from "react";
import { fetchDaily } from "../game/redditDaily";
import type { DailyMetric, DailyResponse } from "../../shared/api";

/**
 * CHALLENGES tab — today's three daily challenges (pulled from the CMS bank,
 * date-seeded), lifetime milestone count-ups, and the next steps on the Ascent.
 */
// Challenges-tab order of the three ability-gem achievements (resurrect,
// quadriant, zenith) and the gem-detail slide each row opens
const SPECIAL_GEM_ORDER = ["invincible", "crimsonEndurance", "superluminal"] as const;
const SPECIAL_DETAIL_KEY: Record<string, string> = { invincible: "resurrect", crimsonEndurance: "quadriant", superluminal: "zenith" };

export function ChallengesPage({ onQuickPlay, onPlayLevel, onOpenReward, onPlayDaily, nebulite = 0, onPlayDuel, focusHouse = false, onSeeAchievements }: { onQuickPlay: () => void; onPlayLevel: (l: Level) => void; onOpenReward?: RewardNav; onPlayDaily?: (day: string, seed: number, metric: DailyMetric) => void; nebulite?: number; onPlayDuel?: (bet: number) => void; focusHouse?: boolean; onSeeAchievements?: () => void }) {
  const C = CONTENT.challenges;
  const daily = loadDaily();
  const today = pickDailyChallenges(todayKey());
  const stats = loadStats();
  const milestones = computeMilestones(stats);
  // UNLOCK SPECIAL GEMS — the three ability-gem achievements, ordered per the
  // gem lineup; tapping a row opens the gem-detail pop-up scoped to the three
  const achievements = computeAchievements(stats);
  const specialGems = SPECIAL_GEM_ORDER.map((k) => achievements.find((a) => a.key === k)).filter((a): a is NonNullable<typeof a> => !!a);
  const gemItems = gemDetailItems("gems");
  const [gemDetail, setGemDetail] = useState<number | null>(null);
  const gemNameOf = (achKey: string) => gemItems.find((g) => g.key === SPECIAL_DETAIL_KEY[achKey])?.title ?? "";

  const frontier = unlockedIndex();
  const active = LEVELS[frontier];
  const nextLocked = [LEVELS[frontier + 1], LEVELS[frontier + 2]].filter(Boolean) as Level[];
  // the challenge you complete IN a level to unlock the NEXT one = the following
  // level's unlock requirement (a level's own `unlock` is the requirement to
  // REACH it). It's not about the location — it's the objective you're playing for.
  const goalOf = (l: Level): string => LEVELS[l.num + 1]?.unlock || "Clear the board to conquer the Abyss";

  // all three of today's challenges cleared -> the set bonus is banked
  const setDone = today.length > 0 && today.every((c) => daily.done.includes(c.id));
  // a versus daily's QUICK PLAY deals straight into a minimum-stake Broker duel
  // (locked until the Academy is complete and the wallet covers the stake)
  const playVersusDaily = onPlayDuel && frontier >= 2 && nebulite >= DUEL_MIN_BET
    ? () => onPlayDuel(DUEL_MIN_BET)
    : undefined;
  // tapping a daily row opens the character DETAIL pop-up on that challenge
  const [dailyDetail, setDailyDetail] = useState<number | null>(null);

  return (
    <div style={page}>
      {/* COMMUNITY DAILY / YOU vs THE HOUSE — the sliding pair (gold title =
          active slide; auto-swaps; swipe or tap the titles) */}
      <CommunityDaily onPlayDaily={onPlayDaily} nebulite={nebulite} onPlayDuel={onPlayDuel} focusHouse={focusHouse} />

      {/* DAILY */}
      <div style={eyebrow}>
        <span>{C.dailyLabel} · {today.length} {C.todaySuffix}</span>
        {/* THE SET BONUS, promised up front: clear all three today and the +10
            lands. Once they are all done it strikes through and turns green. */}
        {today.length > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: setDone ? theme.color.good : theme.color.accent,
              textDecoration: setDone ? "line-through" : "none",
              letterSpacing: "0.08em",
            }}
          >
            <NebuliteGem size={11} />+{SET_BONUS_NEBULITE}
          </span>
        )}
        <ResetCountdownLabel prefix={C.resetPrefix} style={{ color: theme.color.gold }} />
      </div>
      <div style={stack}>
        {today.length === 0 && <div style={emptyCard}>{C.emptyBank}</div>}
        {today.map((c, i) => (
          <DailyRow key={c.id} entry={c} done={daily.done.includes(c.id)} best={daily.progress[c.id] ?? 0} onQuickPlay={onQuickPlay} onPlayVersus={playVersusDaily} onOpenReward={onOpenReward} onOpen={() => setDailyDetail(i)} />
        ))}
      </div>
      {dailyDetail !== null && today.length > 0 && (
        <DailyDetailPopup entries={today} daily={daily} startIndex={dailyDetail} onClose={() => setDailyDetail(null)} />
      )}

      {specialGems.length > 0 && (
        <>
          <div style={eyebrow}><span>{C.specialGemsLabel}</span></div>
          <div style={stack}>
            {specialGems.map((a, i) => (
              <button key={a.key} style={gemRowBtn} onClick={() => { sfx.click(); setGemDetail(i); }}>
                {/* gem visual with its name underneath — same rendering recipe as
                    the Achievements page (TileGem's own dim look + padlock pip;
                    no CSS filter, so the glow is never clipped) */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 64, flexShrink: 0 }}>
                  <div style={{ position: "relative", width: 52, height: 52, display: "grid", placeItems: "center", filter: a.earned ? "drop-shadow(0 3px 10px rgba(0,0,0,0.5))" : "none" }}>
                    <TileGem value={a.tileValue as TileVal} size={44} dim={!a.earned} />
                    {!a.earned && (
                      <svg viewBox="0 0 12 11" width="15" height="14" style={{ position: "absolute", right: 0, bottom: 2 }} aria-hidden>
                        <rect x="1.5" y="4" width="9" height="7" rx="1.6" fill="#0b0d16" stroke="#6b6690" strokeWidth="1" />
                        <path d="M3.4 4 v-1.6 a2.6 2.6 0 0 1 5.2 0 v1.6" fill="none" stroke="#6b6690" strokeWidth="1" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontFamily: theme.fonts.mono, fontSize: 8.5, letterSpacing: "0.14em", color: theme.color.faint, textTransform: "uppercase" }}>{gemNameOf(a.key)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13.5, color: theme.color.text }}>{a.name}</div>
                      <div style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.color.dim, marginTop: 2, textDecoration: a.earned ? "line-through" : "none" }}>{a.desc}</div>
                    </div>
                    {/* far right: lock while locked, Done + tick once earned */}
                    {a.earned ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, color: theme.color.good, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 11.5 }}>
                        {C.specialDone}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5 10 18 19.5 6.5" /></svg>
                      </span>
                    ) : (
                      <span style={{ color: theme.color.faint, flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                      </span>
                    )}
                  </div>
                  {/* progress bar with the target at its end (level with the gem's name) */}
                  {a.progress && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ ...bar, flex: 1 }}>
                        <i style={{ position: "absolute", inset: "0 auto 0 0", borderRadius: 8, width: `${Math.min(1, a.progress.current / a.progress.target) * 100}%`, background: "linear-gradient(90deg,#7fe9f5,#9d7bff)" }} />
                      </div>
                      <span style={{ fontFamily: theme.fonts.mono, fontSize: 10.5, color: theme.color.dim, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                        {a.progress.current.toLocaleString()}/{a.progress.target.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          {onSeeAchievements && (
            <button style={seeAchBtn} onClick={() => { sfx.click(); onSeeAchievements(); }}>{C.seeAchievements}</button>
          )}
        </>
      )}

      {/* gem detail pop-up — same drill-down as Combos & Values, scoped to the
          three reward gems, with a LOCKED/UNLOCKED status */}
      {gemDetail !== null && (
        <PopupCard onClose={() => setGemDetail(null)} width={344} zIndex={95} bodyStyle={{ padding: "22px 18px 18px" }}>
          <GemDetailView items={gemItems} index={gemDetail} onIndex={setGemDetail} onBack={() => setGemDetail(null)} showStatus />
        </PopupCard>
      )}


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
function CommunityDaily({ onPlayDaily, nebulite = 0, onPlayDuel, focusHouse = false }: { onPlayDaily?: (day: string, seed: number, metric: DailyMetric) => void; nebulite?: number; onPlayDuel?: (bet: number) => void; focusHouse?: boolean }) {
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  useEffect(() => {
    let live = true;
    void fetchDaily().then((d) => { if (live) setDaily(d); });
    return () => { live = false; };
  }, []);
  const frontier = unlockedIndex();
  const house = onPlayDuel ? <HouseDuelCard nebulite={nebulite} locked={frontier < 2} onPlay={onPlayDuel} /> : null;
  if (!daily || !onPlayDaily) {
    // no community board (off Reddit / fetch pending): the HOUSE still stands alone
    if (!house) return null;
    return (
      <>
        <div style={eyebrow}><span>{CONTENT.characters.duel.title}</span></div>
        <div style={{ marginBottom: 18 }}>{house}</div>
      </>
    );
  }
  if (!house) {
    return (
      <>
        <div style={eyebrow}>
          <span>COMMUNITY DAILY</span>
          <span style={{ color: theme.color.gold }}>{daily.day}</span>
        </div>
        <CommunityDailyCard daily={daily} onPlay={() => onPlayDaily(daily.day, daily.seed, daily.metric)} />
      </>
    );
  }
  // the sliding pair: the community board leads, the Broker's table rides second
  // (focusHouse — the promo's deep link — opens on the house slide)
  return (
    <div style={{ marginBottom: 18 }}>
      <TogetherSlider titles={["COMMUNITY DAILY", CONTENT.characters.duel.title]} initial={focusHouse ? 1 : 0}>
        <CommunityDailyCard daily={daily} onPlay={() => onPlayDaily(daily.day, daily.seed, daily.metric)} />
        {house}
      </TogetherSlider>
    </div>
  );
}

/** The COMMUNITY DAILY card itself — today's challenge, your standing, and the
 *  top of the board. Shared verbatim between the Challenges tab and the
 *  NEW COMMUNITY CHALLENGE pop-up so they can never drift apart. */
export function CommunityDailyCard({ daily, onPlay }: { daily: DailyResponse; onPlay: () => void }) {
  const medal = (r: number) => (r === 1 ? "#e8b53f" : r === 2 ? "#c9ccdd" : r === 3 ? "#c98d5a" : theme.color.faint);
  return (
    <div style={{ ...card, border: "1px solid rgba(157,123,255,0.42)", background: "linear-gradient(180deg, rgba(157,123,255,0.13), rgba(16,19,34,0.92))" }}>
      {/* icon + title top-align; the PLAY button stays vertically centred */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 14px" }}>
        {/* the winner's podium — bolder than the daily-row glyphs on purpose: this
            is the community square, and the gold pulls the eye to it */}
        <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, display: "grid", placeItems: "center", background: "linear-gradient(180deg, rgba(232,181,63,0.32), rgba(232,181,63,0.08))", border: "1px solid rgba(232,181,63,0.55)", boxShadow: "0 0 14px -4px rgba(232,181,63,0.6)", color: theme.color.gold }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {/* star above the champion's block */}
            <path d="M12 2.6l0.95 1.92 2.12 0.31-1.53 1.5 0.36 2.11L12 7.44l-1.9 1-0.36-2.11-1.53-1.5 2.12-0.31z" fill="currentColor" stroke="none" />
            {/* podium: 2nd - 1st - 3rd */}
            <rect x="2.5" y="14" width="6" height="7" rx="0.8" />
            <rect x="8.5" y="11" width="7" height="10" rx="0.8" fill="rgba(232,181,63,0.28)" />
            <rect x="15.5" y="16.5" width="6" height="4.5" rx="0.8" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14.5, color: theme.color.text }}>{daily.metricLabel}</div>
          <div style={{ fontFamily: theme.fonts.sans, fontSize: 11, lineHeight: 1.45, color: theme.color.dim, marginTop: 3 }}>
            Everyone plays the same board today — best <b style={{ color: theme.color.accent, fontWeight: 600 }}>{daily.metricLabel.toLowerCase()}</b> takes the top. Your best attempt counts.
          </div>
        </div>
        <button style={{ ...playBtn, alignSelf: "center" }} onClick={() => { sfx.click(); onPlay(); }}>
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
const gemRowBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", width: "100%", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))", border: `1px solid ${theme.color.border}`, borderRadius: 15, boxShadow: "0 10px 22px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
// "See Achievements" — the see-through full-width pattern the Show-all buttons use
const seeAchBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", marginTop: 10, padding: "9px 0", background: "rgba(157,123,255,0.08)", border: `1px solid ${theme.color.border}`, borderRadius: 10, color: theme.color.accent, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, cursor: "pointer" };
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
