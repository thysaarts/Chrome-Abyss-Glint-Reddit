import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { theme, bevel, bevelPrimary } from "../theme/theme";
import { CONTENT } from "../content/content";
import { LEVELS, Level, displayScoreLabel } from "../levels/levels";
import { levelStatus, unlockedIndex, topScores, LevelStatus, levelResult } from "../levels/progress";
import { REGIONS } from "../theme/regions";
import { Backdrop } from "./Backdrop";
import { sfx } from "../audio/sfx";
import { fetchLeaderboard } from "../game/redditDaily";
import type { LeaderboardResponse } from "../../shared/api";
import type { RefObject } from "react";

/**
 * The LEVELS screen — "The Ascent" as FLOATING ISLANDS in a parallax abyss
 * (design_handoff_glint_depth §8). Each level is an extruded hex island: the
 * current one is the hero (violet glow, orbiting spark, gloss sweep, physical
 * CONTINUE button, pulsing ground-glow); completed islands drift smaller and
 * dimmer; locked ones lurk blurred in the fog bank at the bottom. A gradient
 * conduit beam links completed islands. Data-driven from LEVELS + localStorage.
 */
/** The unlock celebration payload: focus the played level, pop its tick, then pan
 *  to `next` (when this run FRESHLY unlocked it) and play the unlock beat. */
export interface Celebration {
  played: number;
  next: number | null;
}

// celebration phases: 0 idle/focus · 1 tick pops on the played level ·
// 2 camera pans down · 3 requirement ticks + tile shakes · 4 tile unlocks
type CelebPhase = 0 | 1 | 2 | 3 | 4;

export function LevelSelect({
  onExit,
  onHelp,
  onSettings,
  onQuickStart,
  onPlayLevel,
  celebrate,
  onCelebrated,
  inShell,
  equippedTheme,
}: {
  // header actions — only used in the standalone (non-shell) layout; in the tab
  // shell the persistent ShellHeader owns these.
  onExit?: () => void;
  onHelp?: () => void;
  onSettings?: () => void;
  onQuickStart: () => void;
  onPlayLevel: (level: Level) => void;
  celebrate?: Celebration | null;
  onCelebrated?: () => void;
  /** the equipped Collection board theme's region name (undefined = standard).
   *  Generic levels and Quick start play under it, so their tiles carry its name
   *  the same way region levels carry theirs. */
  equippedTheme?: string;
  /** rendered inside the tab shell — fill the parent (not the viewport), and let
   *  the tab bar own the bottom safe-area instead of the Quick Start / Continue row. */
  inShell?: boolean;
}) {
  const [showLB, setShowLB] = useState(false);
  const [celebPhase, setCelebPhase] = useState<CelebPhase>(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const frontier = unlockedIndex();

  // WINDOWED REVEAL: only the first 10 levels show; when the player reaches the
  // window's second-to-last level, the next 10 appear — and so on. Once fewer
  // than 15 levels separate the window from the finale, the whole remaining
  // stretch (INCLUDING the boss) is revealed. Until then the boss hides in the
  // fog like every other unrevealed level.
  const lastLevel = LEVELS[LEVELS.length - 1];
  const bossLevel = lastLevel?.boss ? lastLevel : null;
  const regular = bossLevel ? LEVELS.slice(0, -1) : LEVELS;
  let limit = 10;
  while (limit < regular.length && frontier >= limit - 2) limit += 10;
  if (regular.length - limit < 15) limit = regular.length; // the home stretch: show it all
  const visible = regular.slice(0, limit);
  const showBoss = !!bossLevel && limit >= regular.length;
  // everything still shrouded below the window — the boss counts while hidden
  const hiddenTotal = regular.length - visible.length + (bossLevel && !showBoss ? 1 : 0);

  // AT THE END: the boss finale is in full view — the bottom fog, fade and
  // scroll chevron part (nothing lies below; you're looking at the end of the
  // world, on fire). They return the moment you scroll back up. Only applies
  // once the boss is REVEALED — while it's still shrouded, the bottom of the
  // scroll is the thickest mist instead.
  const [atEnd, setAtEnd] = useState(false);
  // FOG DEPTH 0..1: how far below the CURRENT level the player has scrolled —
  // the deeper into locked territory, the denser the mist gets.
  const [fogDepth, setFogDepth] = useState(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => {
      setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 24);
      const cur = el.querySelector('[data-cur="1"]') as HTMLElement | null;
      const curBottom = cur
        ? cur.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop
        : 0;
      const viewBottom = el.scrollTop + el.clientHeight;
      const denom = Math.max(1, el.scrollHeight - curBottom);
      setFogDepth(Math.max(0, Math.min(1, (viewBottom - curBottom) / denom)));
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);
  // the boss parts the mist only when it is revealed and in full view
  const parted = atEnd && showBoss;
  const dense = parted ? 0 : fogDepth;

  // auto-scroll on entry: to the just-played level when celebrating (the "camera"
  // starts there), otherwise to the current (frontier) level
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const target = celebrate
      ? el.querySelector<HTMLElement>(`[data-lv="${celebrate.played}"]`)
      : el.querySelector<HTMLElement>('[data-cur="1"]');
    if (target) el.scrollTop = Math.max(0, target.offsetTop - 160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE UNLOCK CELEBRATION — completion tick pops on the played level (with its
  // fanfare), then the camera pans down to the freshly-unlocked level: its
  // requirement ticks green, the tile shakes off its grey and colours in.
  useEffect(() => {
    if (!celebrate) { setCelebPhase(0); return; }
    let dead = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    (async () => {
      await sleep(650);
      if (dead) return;
      setCelebPhase(1); // tick pops on the played tile
      sfx.levelTick();
      if (celebrate.next == null) {
        await sleep(1500);
        if (!dead) onCelebrated?.();
        return;
      }
      await sleep(1400);
      if (dead) return;
      setCelebPhase(2); // pan down to the next level
      listRef.current
        ?.querySelector(`[data-lv="${celebrate.next}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(900);
      if (dead) return;
      setCelebPhase(3); // requirement ticks + the tile shakes
      sfx.click();
      await sleep(700);
      if (dead) return;
      setCelebPhase(4); // grey falls away — unlocked
      sfx.levelUnlock();
      await sleep(1400);
      if (!dead) onCelebrated?.();
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  return (
    <div style={inShell ? { ...wrap, position: "absolute" } : wrap}>
      <Backdrop />
      <div style={atmosphere} />
      <div style={column} className="gl-screen-in">
        {/* TOP BAR — only in the standalone layout; inside the tab shell the
            persistent ShellHeader (above all tabs) owns the logo + actions. */}
        {!inShell && (
          <div style={topBar}>
            <div>
              <div style={kicker}>CHROME ABYSS</div>
              <div style={wordmark}>GLINT</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={{ ...barIconBtn, color: "#e8cf8f" }} onClick={() => setShowLB(true)} aria-label="High scores">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 4h12v3a6 6 0 0 1-12 0Z" />
                  <path d="M6 6H4v1a3 3 0 0 0 3 3M18 6h2v1a3 3 0 0 1-3 3M9 15h6M8.5 19h7M10 15l-.5 4M14 15l.5 4" />
                </svg>
              </button>
              <button style={barIconBtn} onClick={onHelp} aria-label="Help">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.3 9.2a2.7 2.7 0 1 1 3.9 2.5c-.9.5-1.2 1-1.2 1.9" />
                  <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
                </svg>
              </button>
              <button style={barIconBtn} onClick={onSettings} aria-label="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button style={barIconBtn} onClick={onExit} aria-label="Exit to menu">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* LIST — the fades/fog span the full width; the tile path itself stays a
            narrow centred column */}
        <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* decor lives INSIDE the map window so the scene ends where the map
              does — props clip at its edge instead of drifting behind the
              Quick start / Continue row below */}
          {/* the 3D Ascent scene fills the map window behind the tiles (contained, z-0),
              the slot the retired classic decor used — parallax driven by the list scroll */}
          {/* a mid-depth dust band that drifts slower than the islands (0.72×),
              filling the depth gap between the far decor and the 1:1 island
              plane. Pointer-inert and BEHIND the islands, so tap/scroll are
              untouched — the "safe" parallax. */}
          {inShell && <AscentDepth scrollRef={listRef} />}
          <div ref={listRef} className="gl-lvlist" style={{ position: "absolute", inset: 0, overflowY: "auto" }}>
            {/* with the boss revealed, the padding only just clears its fire glow —
                the finale IS the end of the page. While it's still shrouded, the
                trail ends in a deep bank of mist instead. */}
            <div style={{ padding: showBoss ? "96px 0 52px" : "96px 0 150px", maxWidth: 440, margin: "0 auto" }}>
              {(() => {
                const renderTile = (lv: Level, i: number, hasNext: boolean) => {
                  // celebration overrides: the freshly-unlocked level stays greyed
                  // until the unlock beat; the played level's medallion pops in
                  let status = levelStatus(lv.num);
                  let medalHidden = false;
                  let medalPop = false;
                  let reqMet: boolean | undefined;
                  let shaking = false;
                  let flash = false;
                  if (celebrate) {
                    if (lv.num === celebrate.played) {
                      status = "completed";
                      medalHidden = celebPhase < 1;
                      medalPop = celebPhase >= 1;
                    }
                    if (celebrate.next != null && lv.num === celebrate.next) {
                      status = celebPhase >= 4 ? "current" : "locked";
                      reqMet = celebPhase >= 3 ? true : undefined;
                      shaking = celebPhase === 3;
                      flash = celebPhase === 4;
                    }
                  }
                  const result = levelResult(lv.num);
                  return (
                    <LevelTile
                equippedTheme={equippedTheme}
                      key={lv.num}
                      level={lv}
                      status={status}
                      hasNext={hasNext}
                      onPlay={() => onPlayLevel(lv)}
                      side={i % 2 === 0 ? "left" : "right"}
                      best={result?.best ?? null}
                      cleared={result?.cleared ?? false}
                      medalHidden={medalHidden}
                      medalPop={medalPop}
                      reqMet={reqMet}
                      shaking={shaking}
                      flash={flash}
                      next={lv.num === frontier + 1}
                    />
                  );
                };

                // the boss only exists on the path once revealed (showBoss); until
                // then the trail's last connector just runs down into the mist
                return (
                  <>
                    {visible.map((lv, i) => renderTile(lv, i, i < visible.length - 1 || hiddenTotal > 0 || showBoss))}
                    {showBoss && <BossDescent />}
                    {showBoss && bossLevel && renderTile(bossLevel, visible.length, false)}
                  </>
                );
              })()}
            </div>
          </div>
          <div style={{ ...fade, top: 0, background: "linear-gradient(180deg,#07080f,transparent)" }} />
          {/* depth fog bank at the bottom of the scene — locked islands lurk in it.
              It PARTS only when the REVEALED boss is in full view; while the boss
              is shrouded, the mist instead THICKENS the deeper you scroll below
              your current level (fogDepth). The TOP fade always stays. */}
          <div style={{ ...fade, bottom: 0, height: 130, background: "linear-gradient(180deg, transparent, rgba(10,8,22,0.88) 62%)", opacity: parted ? 0 : 1, transition: "opacity 500ms ease" }} />
          <div className="gl-fog-drift" style={{ ...fogBank, opacity: parted ? 0 : 1, transition: "opacity 500ms ease" }} />
          {/* the DENSE mist: grows with scroll depth into locked territory */}
          <div style={{ ...fade, bottom: 0, height: 260, background: "linear-gradient(180deg, transparent, rgba(9,7,20,0.97) 74%)", opacity: dense, transition: "opacity 300ms ease" }} />
          <div className="gl-fog-drift" style={{ ...fogBank, height: 230, background: "radial-gradient(72% 100% at 50% 100%, rgba(124,90,224,0.36), transparent 74%)", opacity: dense, transition: "opacity 300ms ease", animationDelay: "-6s" }} />
          {/* the count of everything still shrouded — sits in the mist above the
              chevron, surfacing only once you are deep into the fog */}
          {hiddenTotal > 0 && (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 36, display: "flex", justifyContent: "center", zIndex: 3, pointerEvents: "none", opacity: Math.min(1, Math.max(0, dense - 0.3) * 1.6), transition: "opacity 250ms ease" }}>
              <span style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.3em", color: "#8a85b8", textShadow: "0 1px 10px rgba(7,8,15,0.95)" }}>
                {hiddenTotal} MORE {hiddenTotal === 1 ? "LEVEL" : "LEVELS"}
              </span>
            </div>
          )}
          <div data-chevfade style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3, opacity: parted ? 0 : 1, transition: "opacity 400ms ease" }}>
            <div style={chevron} className="gl-chev">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </div>
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div style={inShell ? { ...bottomBar, paddingBottom: 14 } : bottomBar}>
          <button style={quickBtn} onClick={onQuickStart}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5.5v13a1 1 0 0 0 1.5.87L14 14v4.5a1 1 0 0 0 1.5.87l9-6.5a1 1 0 0 0 0-1.74l-9-6.5A1 1 0 0 0 14 5.5V10L5.5 4.63A1 1 0 0 0 4 5.5Z" /></svg>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
              Quick start
              {equippedTheme && <span style={{ fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 9.5, letterSpacing: "0.05em", opacity: 0.72 }}>{equippedTheme}</span>}
            </span>
          </button>
          <button style={continueBtn} onClick={() => onPlayLevel(LEVELS[frontier])}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" /></svg>
            Continue
          </button>
        </div>
      </div>

      {!inShell && showLB && <Leaderboard onClose={() => setShowLB(false)} />}
    </div>
  );
}

// The zig-zag: tiles alternate left/right of centre by this many px (~20% of the
// tile width). The Connector's S-curve spans the same offset.
const TILE_SHIFT = 45;

// BOSS embers: % from left, bottom px, size px, colour, rise duration, delay, x-drift
const BOSS_EMBERS = [
  { l: 10, b: 40, s: 4, c: "rgba(255,120,60,0.95)", dur: 4.4, d: 0, x: 10 },
  { l: 24, b: 18, s: 3, c: "rgba(255,90,80,0.9)", dur: 5.6, d: 1.4, x: -8 },
  { l: 42, b: 8, s: 5, c: "rgba(255,170,80,0.9)", dur: 4.9, d: 2.6, x: 6 },
  { l: 58, b: 14, s: 3, c: "rgba(255,90,80,0.9)", dur: 5.2, d: 0.8, x: -12 },
  { l: 74, b: 24, s: 4, c: "rgba(255,140,60,0.95)", dur: 4.2, d: 3.4, x: 9 },
  { l: 88, b: 44, s: 3, c: "rgba(255,200,110,0.85)", dur: 5.8, d: 2, x: -6 },
  { l: 33, b: 60, s: 3, c: "rgba(255,110,70,0.85)", dur: 6.2, d: 4.2, x: 12 },
  { l: 66, b: 56, s: 3.5, c: "rgba(255,160,80,0.9)", dur: 5, d: 5, x: -10 },
];

/** The long, quiet descent to the BOSS finale when every regular level is
 *  already revealed: extra distance and a fading dotted line, so The Master
 *  Core sits apart from the rest of the ascent. */
// a faint mid-depth dust band behind the islands. Drifts against the Ascent
// scroll at 0.72× (slower than the 1:1 islands, faster than the far decor) so
// the map reads with a layer of depth just behind the play surface. Wraps so a
// long scroll never empties it; direct-DOM on scroll, no React re-renders.
const DEPTH_MOTES = Array.from({ length: 14 }, (_, i) => ({
  x: (i * 61.8) % 100,
  y: (i * 37.4) % 100,
  r: 1 + ((i * 7) % 5) * 0.5,
  o: 0.12 + ((i * 13) % 7) * 0.03,
}));
function DepthBand() {
  return (
    <>
      {DEPTH_MOTES.map((m, i) => (
        <span key={i} style={{ position: "absolute", left: `${m.x}%`, top: `${m.y}%`, width: m.r, height: m.r, borderRadius: "50%", background: "#b9c4ff", opacity: m.o, filter: "blur(0.4px)" }} />
      ))}
    </>
  );
}
function AscentDepth({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const bandRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const node = bandRef.current;
    const host = node?.parentElement;
    if (!el || !node || !host) return;
    const place = () => {
      const H = host.clientHeight || 1;
      const off = (((el.scrollTop * 0.72) % H) + H) % H;
      node.style.transform = `translate3d(0, ${-off}px, 0)`;
    };
    place();
    el.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      el.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [scrollRef]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }} aria-hidden>
      <div ref={bandRef} style={{ position: "absolute", inset: 0 }}>
        <DepthBand />
        <div style={{ position: "absolute", left: 0, right: 0, top: "100%", height: "100%" }}>
          <DepthBand />
        </div>
      </div>
    </div>
  );
}

function BossDescent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "34px 0 40px" }}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#5a3040", opacity: 0.35 + i * 0.18 }} />
      ))}
    </div>
  );
}

function LevelTile({
  level,
  status,
  hasNext,
  onPlay,
  side,
  best,
  cleared,
  medalHidden,
  medalPop,
  reqMet,
  shaking,
  flash,
  next,
  equippedTheme,
}: {
  level: Level;
  status: LevelStatus;
  hasNext: boolean;
  onPlay: () => void;
  side: "left" | "right";
  best: number | null;
  cleared: boolean;
  medalHidden?: boolean;
  medalPop?: boolean;
  reqMet?: boolean; // celebration override for the requirement tick
  shaking?: boolean;
  flash?: boolean;
  next?: boolean; // the immediate next (first locked) level — shows NEXT UP in accent
  equippedTheme?: string;
}) {
  const completed = status === "completed";
  const current = status === "current";
  const locked = status === "locked";
  const boss = level.boss === true;
  // CLEARED = the board was fully cleared at least once — the tile celebrates in
  // gold (trophy, gold stroke); merely completed stays green with a hollow tick.
  const gold = completed && cleared;

  // island palette per state: top face, side walls, top-half facet, stroke.
  // The BOSS finale gets its full menacing crimson treatment in EVERY state —
  // locked or not, it shows in all its glory.
  const c = boss
    ? { top: "#1c0e18", left: "#2b1527", right: "#130812", facet: "#271225", stroke: "#ff5a8f", strokeW: 2.6 }
    : current
    ? { top: "#181c2c", left: "#232741", right: "#0e1020", facet: "#242a42", stroke: "#c9a2ff", strokeW: 2.4 }
    : gold
    ? { top: "#1a1720", left: "#26202a", right: "#100d14", facet: "#241f2c", stroke: "#e8b53f", strokeW: 2 }
    : completed
    ? { top: "#161a26", left: "#1d2030", right: "#0c0e18", facet: "#1e2334", stroke: "#34d98b", strokeW: 1.6 }
    : { top: "#121522", left: "#171a28", right: "#0a0c15", facet: "#191d2e", stroke: "#33364a", strokeW: 1.4 };

  // An UNLOCKED themed level shows its region on the tile itself: the island's
  // faces take the region palette and the face carries the level's own background
  // wash — the menu already links to the world. The status stroke (violet current /
  // green completed / gold cleared) stays, so progression still reads. Locked
  // tiles keep the neutral grey.
  const rt = !locked && level.params.theme === "regions" && level.region ? REGIONS[level.region] : undefined;
  if (rt) {
    c.top = rt.panelSolid;
    c.left = rt.tileSolid;
    c.right = rt.edge;
    c.facet = rt.tileSolid;
  }

  // depth fog & focus: distance = smaller + dimmer + blurrier. For LOCKED, the
  // grey-out lives on the ISLAND VISUALS (svg + heading), never the requirement —
  // the way in must stay readable. The zig-zag shift composes with the depth scale.
  // The BOSS finale is EXEMPT: it looms at the path's end in full glory, locked
  // or not — only its LOCKED chip and requirement say it isn't open yet.
  const shift = `translateX(${side === "left" ? -TILE_SHIFT : TILE_SHIFT}px)`;
  const depth: React.CSSProperties = completed
    ? { transform: `${shift} scale(0.8)`, opacity: 0.8, filter: "blur(0.4px)" }
    : locked && !boss
    ? { transform: `${shift} scale(0.88)` }
    : { transform: shift };
  const greyed: React.CSSProperties = locked && !boss ? { opacity: 0.5, filter: "blur(0.5px)" } : {};

  const W = 224;
  const H = Math.round(W * 1.16); // content box (top face area)
  const SVGH = Math.round((W * 132) / 100); // svg is taller: it carries the extrusion

  // The completion medallion sits centred in the gap between the face's top point
  // and the LEVEL line — equal air above and below. The LEVEL line's y comes from
  // the centred content column (varies with title wrap / chips / score), so it's
  // measured; deltas are divided by the live scale so the depth transform (0.8 on
  // completed tiles) doesn't skew the result.
  const islandRef = useRef<HTMLDivElement | null>(null);
  const levelLineRef = useRef<HTMLDivElement | null>(null);
  const [medalTop, setMedalTop] = useState(30);
  useLayoutEffect(() => {
    if (!completed) return;
    const measure = () => {
      const box = islandRef.current?.getBoundingClientRect();
      const line = levelLineRef.current?.getBoundingClientRect();
      if (!box || !line || !box.width) return;
      const scale = box.width / W;
      const faceTop = (2 / 132) * SVGH; // hex top point in local px
      const levelTop = (line.top - box.top) / scale;
      setMedalTop(Math.round(((faceTop + levelTop) / 2 - 13) * 10) / 10); // 26px medallion
    };
    measure();
    // re-measure once fonts settle — the column height shifts the centred LEVEL line
    document.fonts?.ready.then(measure).catch(() => {});
  }, [completed, best, cleared, level.num, SVGH]);

  return (
    <div data-cur={current ? "1" : "0"} data-lv={level.num} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ ...depth, transition: "transform 0.5s, opacity 0.5s, filter 0.5s" }} className={flash ? "gl-unlock-flash" : undefined}>
        <div
          className={[boss || current ? "gl-island-float" : completed ? "gl-island-float2" : "", shaking ? "gl-tile-shake" : ""].join(" ").trim() || undefined}
          onClick={locked ? undefined : onPlay}
          ref={islandRef}
          style={{ position: "relative", width: W, height: H, cursor: locked ? "default" : "pointer" }}
        >
          {/* orbiting spark around the hero island */}
          {current && <div className="gl-orbit" style={orbitSpark} />}

          {/* BOSS: a pulsing danger halo burns BEHIND the island */}
          {boss && (
            <div
              className="gl-rg-anim"
              style={{
                position: "absolute",
                left: "50%",
                top: "44%",
                width: W * 1.6,
                height: W * 1.3,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                pointerEvents: "none",
                background: "radial-gradient(circle, rgba(255,60,80,0.34), rgba(255,100,40,0.12) 46%, transparent 68%)",
                animation: "gl-boss-halo 3.4s ease-in-out infinite",
              }}
            />
          )}

          {/* extruded hex island: base, side walls (lit left / dark right), top face,
              top-half facet, and a bevel-highlight inset line on the hero */}
          <svg viewBox="0 0 100 132" width={W} height={SVGH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", transition: "opacity 0.5s, filter 0.5s", ...greyed }}>
            <polygon points="50,14 96,42 96,98 50,126 4,98 4,42" fill="#07080e" />
            <polygon points="4,42 4,98 50,126 50,114 12,92 12,46" fill={c.left} />
            <polygon points="96,42 96,98 50,126 50,114 88,92 88,46" fill={c.right} />
            <polygon
              points="50,2 96,30 96,86 50,114 4,86 4,30"
              fill={c.top}
              stroke={c.stroke}
              strokeWidth={c.strokeW}
              style={
                boss
                  ? { filter: "drop-shadow(0 0 16px rgba(255,90,143,0.55))" }
                  : current
                  ? { filter: "drop-shadow(0 0 14px rgba(192,132,252,0.55))" }
                  : gold
                  ? { filter: "drop-shadow(0 0 12px rgba(232,181,63,0.45))" }
                  : undefined
              }
            />
            <polygon points="50,2 96,30 50,58 4,30" fill={c.facet} opacity={0.9} />
            {(current || gold) && <polygon points="50,2 96,30 96,86 50,114 4,86 4,30" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={0.8} transform="translate(0,1.4)" />}
          </svg>

          {/* BOSS: forge fire licks the island's base, embers rise around it, and a
              flickering crimson wash burns up the face — Machina Forge's fire recipe
              in danger reds. */}
          {boss && (
            <>
              <div
                className="gl-rg-anim"
                style={{ position: "absolute", left: -28, right: -28, bottom: -46, height: 140, pointerEvents: "none", filter: "blur(3px)", background: "radial-gradient(70% 100% at 50% 100%, rgba(255,90,40,0.42), transparent 72%)", animation: "gl-fire-flick2 1.7s linear infinite" }}
              />
              <div
                className="gl-rg-anim"
                style={{ position: "absolute", left: -8, right: -8, bottom: -40, height: 86, pointerEvents: "none", filter: "blur(1.5px)", background: "radial-gradient(55% 100% at 50% 100%, rgba(255,190,100,0.32), transparent 76%)", animation: "gl-fire-flick 1.15s linear infinite", animationDelay: "0.35s" }}
              />
              <div
                className="gl-rg-anim"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: W,
                  height: SVGH,
                  pointerEvents: "none",
                  clipPath: "polygon(50% 1.5%, 96% 22.7%, 96% 65.2%, 50% 86.4%, 4% 65.2%, 4% 22.7%)",
                  background:
                    "linear-gradient(180deg, rgba(40,6,16,0) 26%, rgba(255,60,70,0.16) 76%, rgba(255,120,50,0.22)), radial-gradient(64% 42% at 50% 88%, rgba(255,120,40,0.3), transparent 70%)",
                  animation: "gl-fire-flick 2.3s linear infinite",
                }}
              />
              {BOSS_EMBERS.map((e, i) => (
                <span
                  key={i}
                  className="gl-ember gl-rg-anim"
                  style={{
                    left: `${e.l}%`,
                    bottom: e.b,
                    width: e.s,
                    height: e.s,
                    background: e.c,
                    boxShadow: `0 0 ${e.s * 2.6}px ${e.c}`,
                    animationDuration: `${e.dur}s`,
                    animationDelay: `${e.d}s`,
                    ["--ex" as string]: `${e.x}px`,
                  } as React.CSSProperties}
                />
              ))}
            </>
          )}

          {/* the region's atmosphere washed across the face — the tile previews the
              level's own background (clipped to the top-face hexagon) */}
          {rt && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: W,
                height: SVGH,
                pointerEvents: "none",
                clipPath: "polygon(50% 1.5%, 96% 22.7%, 96% 65.2%, 50% 86.4%, 4% 65.2%, 4% 22.7%)",
                background: rt.tileWash,
              }}
            />
          )}

          {/* gloss sweep across the hero's (and a CLEARED tile's) face — clipped to
              the island's TOP-FACE hexagon (the svg face vertices 50,2 96,30 96,86
              50,114 4,86 4,30 in its 100×132 viewBox), so the sheen never shows
              rounded-rectangle corners the tile doesn't have */}
          {(current || gold) && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: W,
                height: SVGH,
                pointerEvents: "none",
                overflow: "hidden",
                clipPath: "polygon(50% 1.5%, 96% 22.7%, 96% 65.2%, 50% 86.4%, 4% 65.2%, 4% 22.7%)",
              }}
            >
              <div className="gl-gloss" style={{ position: "absolute", top: 0, left: 0, width: "34%", height: "88%", background: `linear-gradient(105deg, transparent, ${gold ? "rgba(255,230,168,0.08)" : "rgba(210,230,255,0.07)"}, transparent)` }} />
            </div>
          )}

          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 36px", paddingBottom: 14, gap: 6 }}>
            <div style={{ transition: "opacity 0.5s, filter 0.5s", ...greyed, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div ref={levelLineRef} style={{ fontFamily: theme.fonts.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", color: boss ? "#ff8fb0" : current ? "#a89ad0" : "#8a85b8" }}>
                {boss ? "FINAL LEVEL" : `LEVEL ${level.num}`}
              </div>
              <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 20, lineHeight: 1.05, color: locked && !boss ? "#b9b4d6" : "#ffffff", textShadow: boss ? "0 2px 18px rgba(255,90,143,0.55)" : current ? "0 2px 18px rgba(157,123,255,0.5)" : gold ? "0 2px 16px rgba(232,181,63,0.4)" : undefined }}>{level.title}</div>
              {/* region levels carry their own world; a GENERIC level plays under the
                  equipped Collection theme, so its tile carries that name instead */}
              {(level.region || equippedTheme) && (
                <div style={{ fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 10, letterSpacing: "0.06em", color: "#6b6690" }}>{level.region || equippedTheme}</div>
              )}
            </div>

            {gold && <Chip color="#ffd980" bg="rgba(232,181,63,0.14)" border="rgba(232,181,63,0.45)">CLEARED</Chip>}
            {completed && !gold && <Chip color="#34d98b" bg="rgba(52,217,139,0.12)" border="rgba(52,217,139,0.3)">COMPLETED</Chip>}
            {/* highest score achieved on this level */}
            {completed && best != null && best > 0 && (
              <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.16em", color: "#ffd980", textShadow: gold ? "0 0 12px rgba(232,181,63,0.45)" : undefined }}>
                BEST {best.toLocaleString()}
              </div>
            )}
            {current && level.unlock && <Requirement met text={level.unlock} />}
            {current && (
              <button onClick={(e) => { e.stopPropagation(); onPlay(); }} style={continueOnFace}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" /></svg>
                CONTINUE
              </button>
            )}
            {locked && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, marginTop: 2 }}>
                <span style={{ ...greyed, display: "inline-flex", alignItems: "center", gap: 5, fontFamily: theme.fonts.mono, fontWeight: 700, fontSize: 9.5, letterSpacing: "0.14em", color: "#6b6690" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                  LOCKED
                </span>
                {/* the requirement is the way in — NEVER greyed out. The immediate
                    NEXT level shows it as "NEXT UP: <requirement>" in the accent blue,
                    matching the Challenges tab; deeper locked tiles stay muted. */}
                {level.unlock && (next ? (
                  // fontSize + lineHeight MUST be set on this block so its line strut is
                  // 10.5·1.3 — without them it inherits the body's 16px/1.5 and every line
                  // becomes ~24px tall (looser than the flex-based Requirement text).
                  <div style={{ maxWidth: 168, marginTop: 1, textAlign: "center", fontSize: 10.5, lineHeight: 1.3 }}>
                    <span style={{ fontFamily: theme.fonts.sans, fontSize: 10.5, lineHeight: 1.3, color: theme.color.accent }}>
                      <span style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.16em" }}>{CONTENT.challenges.nextUp}: </span>
                      {level.unlock}
                    </span>
                  </div>
                ) : (
                  <Requirement met={reqMet ?? false} pop={reqMet === true} text={level.unlock} />
                ))}
              </div>
            )}
          </div>

          {/* completion medallion: gold trophy when CLEARED, hollow green tick when
              merely completed (the subtle "not cleared yet" cue) */}
          {completed && !medalHidden && (
            // the centering transform lives on the OUTER div; the pop animation (which
            // animates transform) plays on an inner one, so the medallion never renders
            // un-centred while popping in
            <div style={{ position: "absolute", top: medalTop, left: "50%", transform: "translateX(-50%)" }}>
            <div className={medalPop ? "gl-unlock-pop" : undefined}>
              {medalPop && <span className="gl-burst" style={{ ...burstRing, borderColor: gold ? "rgba(255,217,128,0.8)" : "rgba(52,217,139,0.8)" }} />}
              {gold ? (
                <div style={{ ...medallion, background: "linear-gradient(180deg,#f4d885,#e8b53f)", boxShadow: "0 0 16px rgba(232,181,63,0.65)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3a2604" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 4h12v3a6 6 0 0 1-12 0Z" />
                    <path d="M6 6H4v1a3 3 0 0 0 3 3M18 6h2v1a3 3 0 0 1-3 3M9 15h6M8.5 19h7M10 15l-.5 4M14 15l.5 4" />
                  </svg>
                </div>
              ) : (
                <div style={{ ...medallion, background: "rgba(7,19,12,0.85)", border: "1.6px solid #34d98b", boxShadow: "0 0 10px rgba(52,217,139,0.35)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d98b" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
              )}
            </div>
            </div>
          )}
        </div>

        {/* pulsing elliptical ground-glow beneath current / completed islands */}
        {(current || completed) && (
          <div
            className="gl-shadow-pulse"
            style={{
              position: "relative",
              left: "50%",
              transform: "translateX(-50%)", // the gl-shadow-pulse animation carries this too
              marginTop: 24,
              width: current ? 180 : 130,
              height: current ? 24 : 18,
              borderRadius: "50%",
              background: `radial-gradient(closest-side, ${current ? "rgba(157,123,255,0.4)" : gold ? "rgba(232,181,63,0.3)" : "rgba(52,217,139,0.25)"}, transparent)`,
            }}
          />
        )}
      </div>

      {/* dashed S-curve conduit to the next tile — travelled sections glow */}
      {hasNext && <Connector num={level.num} from={side} travelled={completed} />}
    </div>
  );
}

function Chip({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3, fontFamily: theme.fonts.mono, fontWeight: 700, fontSize: 9.5, letterSpacing: "0.14em", color, background: bg, border: `1px solid ${border}`, padding: "4px 10px", borderRadius: 999 }}>{children}</span>
  );
}

function Requirement({ met, text, pop }: { met: boolean; text: string; pop?: boolean }) {
  // strike is the FINAL beat: the tick pops green (pop) during the celebration,
  // then the tile unlocks & grows (pop gone), and a further 1s later the text
  // strikes through — so it clearly reads as the last step of the sequence.
  const ready = met && !pop;
  const [struck, setStruck] = useState(false);
  useEffect(() => {
    if (!ready) { setStruck(false); return; }
    const t = window.setTimeout(() => setStruck(true), 1000);
    return () => window.clearTimeout(t);
  }, [ready]);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 5, maxWidth: 150, marginTop: 2 }}>
      {met ? (
        <svg className={pop ? "gl-unlock-pop" : undefined} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d98b" strokeWidth="3" style={{ flex: "none", marginTop: 1 }}><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4f4a6b" strokeWidth="2.4" style={{ flex: "none", marginTop: 1 }}><circle cx="12" cy="12" r="9" /></svg>
      )}
      <span style={{ fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 10.5, lineHeight: 1.3, color: met ? "#7aa896" : "#8a85b8", textAlign: "left", textDecoration: struck ? "line-through" : undefined }}>{text}</span>
    </div>
  );
}

/** The dashed S-curve conduit between two zig-zagged tiles: down from the upper
 *  tile's bottom point, a rounded corner, across, another rounded corner, and
 *  down into the next tile's top point. Travelled sections glow green→violet. */
function Connector({ num, from, travelled }: { num: number; from: "left" | "right"; travelled: boolean }) {
  const W = 160;
  const H = 62;
  const r = 12; // corner radius
  const t = TILE_SHIFT;
  const x1 = W / 2 + (from === "left" ? -t : t); // bottom point of the upper tile
  const x2 = W / 2 + (from === "left" ? t : -t); // top point of the next tile
  const midY = H / 2;
  const sgn = x2 > x1 ? 1 : -1;
  const d =
    `M ${x1} 0 L ${x1} ${midY - r} ` +
    `Q ${x1} ${midY} ${x1 + sgn * r} ${midY} ` +
    `L ${x2 - sgn * r} ${midY} ` +
    `Q ${x2} ${midY} ${x2} ${midY + r} ` +
    `L ${x2} ${H}`;
  return (
    <svg width={W} height={H} style={{ display: "block", margin: "-8px 0 0" }}>
      {travelled && (
        <defs>
          <linearGradient id={`gl-cond-${num}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d98b" />
            <stop offset="100%" stopColor="#c9a2ff" />
          </linearGradient>
        </defs>
      )}
      <path
        d={d}
        fill="none"
        stroke={travelled ? `url(#gl-cond-${num})` : "#2a2d44"}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="3 9"
        style={travelled ? { filter: "drop-shadow(0 0 6px rgba(157,123,255,0.5))" } : undefined}
      />
    </svg>
  );
}

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const scores = topScores();
  // COMMUNITY first — on Reddit the shared board is the headline; if the
  // endpoints aren't there (running outside Reddit) the tab explains itself.
  const [tab, setTab] = useState<"community" | "personal">("community");
  const [lb, setLb] = useState<LeaderboardResponse | null | undefined>(undefined); // undefined = loading
  useEffect(() => {
    let live = true;
    void fetchLeaderboard().then((d) => { if (live) setLb(d); });
    return () => { live = false; };
  }, []);
  const rankStyle: Record<number, [string, string]> = { 1: ["#1a0b2e", "#ffd980"], 2: ["#0c0e16", "#cfd6e6"], 3: ["#1a0b06", "#e0a06a"] };
  const rankDiamond = (rank: number) => {
    const [ink, bg] = rankStyle[rank] ?? ["#9aa0ad", "#20233a"];
    return (
      <div style={{ width: 26, height: 26, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, color: ink, background: bg, borderRadius: 8, transform: "rotate(45deg)" }}>
        <span style={{ transform: "rotate(-45deg)" }}>{rank}</span>
      </div>
    );
  };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "8px 4px", borderRadius: 9, border: "none", cursor: "pointer",
    fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 11, letterSpacing: "0.06em",
    color: active ? "#1a0b2e" : "#857fab",
    background: active ? "linear-gradient(180deg,#ffe9b0,#e8b53f)" : "transparent",
  });
  return (
    <div onClick={onClose} style={lbScrim}>
      <div onClick={(e) => e.stopPropagation()} style={lbCard} className="gl-lb-in">
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: "linear-gradient(90deg,#e8b53f,#ffd980,#e8b53f)" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8cf8f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v3a6 6 0 0 1-12 0Z" /><path d="M6 6H4v1a3 3 0 0 0 3 3M18 6h2v1a3 3 0 0 1-3 3M9 15h6M8.5 19h7M10 15l-.5 4M14 15l.5 4" /></svg>
            <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 17, color: "#f1f0f8" }}>High scores</span>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, background: "#15182a", border: "1px solid #262344", color: "#857fab", fontSize: 15, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* tabs: the community board first, your personal bests second */}
        <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 11, background: "rgba(0,0,0,0.3)", border: "1px solid #262344", marginBottom: 14 }}>
          <button style={tabBtn(tab === "community")} onClick={() => { sfx.click(); setTab("community"); }}>LEADERBOARD</button>
          <button style={tabBtn(tab === "personal")} onClick={() => { sfx.click(); setTab("personal"); }}>YOUR HIGH SCORES</button>
        </div>

        {tab === "community" ? (
          <>
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.16em", color: "#6b6690", marginBottom: 12 }}>COMMUNITY TOP 10 · BEST PER PLAYER</div>
            {lb === undefined && <div style={{ fontFamily: theme.fonts.sans, fontSize: 13, color: "#6b6690", padding: "18px 0", textAlign: "center" }}>Loading the community board…</div>}
            {lb === null && <div style={{ fontFamily: theme.fonts.sans, fontSize: 13, color: "#6b6690", padding: "18px 0", textAlign: "center", lineHeight: 1.5 }}>The community leaderboard lives on Reddit — play Glint in its Reddit post to compete.</div>}
            {lb && lb.entries.length === 0 && <div style={{ fontFamily: theme.fonts.sans, fontSize: 13, color: "#6b6690", padding: "18px 0", textAlign: "center" }}>No scores yet — be the first on the board.</div>}
            {lb && lb.entries.map((e) => (
              <div key={e.username} style={{ display: "flex", alignItems: "center", gap: 13, padding: "10px 0", borderBottom: "1px solid #181b2a" }}>
                {rankDiamond(e.rank)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 12.5, color: e.username === lb.username ? theme.color.accent : "#c9c4e4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>u/{e.username}</div>
                  <div style={{ fontFamily: theme.fonts.sans, fontSize: 10.5, color: "#6b6690", marginTop: 1 }}>{displayScoreLabel(e.level)}</div>
                </div>
                <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 19, color: "#ffd980" }}>{e.score.toLocaleString()}</div>
              </div>
            ))}
            {lb && lb.yourBest != null && (lb.yourRank == null || lb.yourRank > 10) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontFamily: theme.fonts.mono, fontSize: 11, color: "#6b6690", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: "#e8cf8f" }}>YOU</span>
                {lb.yourRank != null && <span>#{lb.yourRank}</span>}
                <b style={{ color: "#f1f0f8", marginLeft: "auto" }}>{lb.yourBest.toLocaleString()}</b>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.16em", color: "#6b6690", marginBottom: 12 }}>YOUR TOP 6 · SCORE &amp; LEVEL</div>
            {scores.length === 0 && <div style={{ fontFamily: theme.fonts.sans, fontSize: 13, color: "#6b6690", padding: "18px 0", textAlign: "center" }}>No scores yet — play a game to set one.</div>}
            {scores.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, padding: "10px 0", borderBottom: "1px solid #181b2a" }}>
                {rankDiamond(i + 1)}
                <div style={{ flex: 1, fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 12, color: "#9aa0ad" }}>{displayScoreLabel(r.level)}</div>
                <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 19, color: "#ffd980" }}>{r.score.toLocaleString()}</div>
              </div>
            ))}
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.14em", color: "#4f4a6b", marginTop: 14, textAlign: "center" }}>PERSONAL BESTS</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = { position: "fixed", inset: 0, overflow: "hidden", background: "#07080f" };
const atmosphere: React.CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(460px 340px at 50% 4%, rgba(157,123,255,0.14), transparent 60%), radial-gradient(420px 380px at 50% 100%, rgba(95,230,242,0.06), transparent 62%)" };
const column: React.CSSProperties = { position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)" };
// Same geometry as the in-game header (shell: max-width 1180, 8px top / 9px sides)
// so the bar spans the full page width on desktop, exactly like in-game. NO dark
// backing — it made the strip (and the buttons in it) read darker than in-game;
// the list's top fade below provides the drop-off instead.
const topBar: React.CSSProperties = { position: "relative", zIndex: 3, width: "100%", maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "8px 9px 6px" };
// logo + buttons match the in-game header (App.tsx: kicker / wordmark / ghostBtn)
const kicker: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.3em", color: theme.color.accent };
const wordmark: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 34, lineHeight: 0.9, margin: "2px 0 0", letterSpacing: "0.01em", background: theme.color.gradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 2px 14px rgba(157,123,255,0.5))" };
const barBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, ...bevel, color: theme.color.text, fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 12, cursor: "pointer" };
// icon-only top-bar button (matches the in-game header)
const barIconBtn: React.CSSProperties = { display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 12, ...bevel, color: theme.color.text, cursor: "pointer" };
const fade: React.CSSProperties = { position: "absolute", left: 0, right: 0, height: 26, pointerEvents: "none", zIndex: 2 };
// drifting violet fog at the bottom of the scene (locked islands half-sink into it)
const fogBank: React.CSSProperties = { position: "absolute", left: -40, right: -40, bottom: 0, height: 130, pointerEvents: "none", zIndex: 2, background: "radial-gradient(60% 100% at 50% 100%, rgba(124,90,224,0.22), transparent 70%)" };
const chevron: React.CSSProperties = { position: "absolute", left: "50%", bottom: 8, transform: "translateX(-50%)", color: "#6b6690", pointerEvents: "none", zIndex: 3 };
const bottomBar: React.CSSProperties = { position: "relative", zIndex: 3, width: "100%", maxWidth: 440, margin: "0 auto", display: "flex", gap: 11, padding: "14px 16px 20px", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" };
const quickBtn: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 15, borderRadius: 15, ...bevel, borderBottom: "3px solid #060810", color: "#cdd3e0", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, letterSpacing: "0.03em", cursor: "pointer" };
const continueBtn: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: 15, borderRadius: 15, ...bevelPrimary, borderBottom: "3.5px solid #7d3fc4", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14, letterSpacing: "0.04em", cursor: "pointer", boxShadow: "0 12px 28px -8px rgba(176,107,245,0.75)" };
// the physical CONTINUE button sitting on the hero island's face
const continueOnFace: React.CSSProperties = { marginTop: 6, display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 13, ...bevelPrimary, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", cursor: "pointer" };
// the 5px spark orbiting the hero island
const orbitSpark: React.CSSProperties = { position: "absolute", left: "50%", top: "44%", width: 5, height: 5, margin: -2.5, borderRadius: "50%", background: "#e2bbff", boxShadow: "0 0 10px rgba(224,139,255,0.9)", zIndex: 3, pointerEvents: "none" };
// completion medallion (gold trophy = CLEARED, hollow green tick = completed)
const medallion: React.CSSProperties = { width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" };
// the celebratory ring bursting out of a fresh medallion / unlock
const burstRing: React.CSSProperties = { position: "absolute", left: "50%", top: "50%", width: 34, height: 34, margin: "-17px 0 0 -17px", borderRadius: "50%", border: "2px solid", pointerEvents: "none" };
const lbScrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(6,7,14,0.72)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 22px" };
const lbCard: React.CSSProperties = { position: "relative", width: "100%", maxWidth: 400, borderRadius: 26, background: "linear-gradient(180deg,#101320,#0b0d16)", border: "1px solid #262344", boxShadow: "0 40px 80px -20px rgba(0,0,0,0.7)", overflow: "hidden", padding: "24px 22px 26px" };
