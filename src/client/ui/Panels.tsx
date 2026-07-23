import { useEffect, useRef, useState } from "react";
import { theme, MineralValue, bevelIcon, cardFace } from "../theme/theme";
import { GameState, visibleTile, GLINT, CORE, RESURRECT, QUADRIANT, ZENITH, TileVal } from "../game/engine";
import { CONTENT } from "../content/content";
import { TileGem } from "./TileGem";
import { abilityUnlocked } from "../game/challenges";
import { loadStats } from "../game/stats";
import { sfx } from "../audio/sfx";
import { RushWheel } from "./RushWheel";
import { readStored, writeStored } from "../game/storage";

/* ============================== HUD ============================== */

/** SCORE / BANKS / BUSTS as perspective cards: an idle 3D sway with staggered
 *  delays across the row; each card's content sits on a higher Z-plane so it
 *  parallaxes against its own card (depth spec §4). */
export function HUD({
  state,
  scoreRef,
  bustRef,
  banksRef,
}: {
  state: GameState;
  scoreRef?: React.RefObject<HTMLDivElement>;
  bustRef?: React.RefObject<HTMLDivElement>;
  banksRef?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div style={hudWrap}>
      <div className="gl-card-tilt" style={{ ...statBox, flex: 1.6 }} ref={scoreRef}>
        <div style={cardLift}>
          <div style={statLabel}>SCORE</div>
          <ScoreValue value={state.score} />
        </div>
      </div>

      <div className="gl-card-tilt" style={{ ...statBox, flex: 1, animationDelay: "0.6s" }} ref={banksRef}>
        <div style={cardLift}>
          <div style={statLabel}>BANKS</div>
          {state.deathMatch ? (
            <div
              title="Infinite banks — any combo banks immediately"
              style={{
                fontFamily: theme.fonts.disp,
                fontWeight: 700,
                fontSize: 26,
                lineHeight: 1,
                marginTop: 4,
                color: theme.color.gold,
                textShadow: "0 0 16px rgba(232,181,63,0.6)",
              }}
            >
              ∞
            </div>
          ) : (
            <DiamondPips total={3} on={state.freeBanksLeft} />
          )}
        </div>
      </div>

      <div className="gl-card-tilt" style={{ ...statBox, flex: 1, animationDelay: "1.2s" }} ref={bustRef}>
        <div style={cardLift}>
          <div style={statLabel}>BUSTS</div>
          {/* extra lives above the standard 3 (a Resurrect gift) add pips */}
          <HeartPips total={Math.max(3, state.livesLeft)} on={state.livesLeft} />
        </div>
      </div>
    </div>
  );
}

/** The score, animated: counts up smoothly and pops gold on every increase. */
function ScoreValue({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const [pop, setPop] = useState(0);
  const fromRef = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const rising = value > from;
    if (rising) setPop((p) => p + 1); // retrigger the pop animation
    const dur = 600;
    const start = performance.now();
    let lastTick = 0;
    let lastShown = from;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const shown = Math.round(from + (value - from) * eased);
      setDisplay(shown);
      // subtle blip as the number visibly climbs on screen (throttled)
      if (rising && shown !== lastShown && now - lastTick > 55 && t < 0.98) {
        lastTick = now;
        sfx.scoreRoll();
      }
      lastShown = shown;
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value]);

  return (
    <div key={pop} style={scoreValue} className={pop ? "gl-score-pop2" : undefined}>
      {display.toLocaleString()}
    </div>
  );
}

/** Gold-diamond free-bank pips; used ones go hollow. Fill down. */
function DiamondPips({ total, on }: { total: number; on: number }) {
  return (
    <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
      {Array.from({ length: total }).map((_, i) =>
        i < on ? (
          <span
            key={i}
            style={{
              width: 13,
              height: 13,
              transform: "rotate(45deg)",
              borderRadius: 3,
              background: "linear-gradient(135deg,#f4d885,#e8b53f)",
              boxShadow: "0 0 9px rgba(232,181,63,0.55)",
              transition: "background 0.3s, box-shadow 0.3s",
            }}
          />
        ) : (
          <span
            key={i}
            style={{
              width: 13,
              height: 13,
              transform: "rotate(45deg)",
              borderRadius: 3,
              background: theme.color.panelHi,
              border: `1px solid ${theme.color.border}`,
            }}
          />
        )
      )}
    </div>
  );
}

/** Heart life pips; lost ones go hollow. Fill down. */
function HeartPips({ total, on }: { total: number; on: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i < on;
        const bonus = i >= 3; // a life above the standard 3 — a Resurrect gift
        const fill = bonus ? "#f0508a" : theme.color.bad; // rose for a bonus heart
        return (
          <svg
            key={i}
            width="15"
            height="14"
            viewBox="0 0 14 13"
            style={{ filter: active ? `drop-shadow(0 0 ${bonus ? 6 : 5}px ${bonus ? "rgba(240,80,138,0.7)" : "rgba(255,90,118,0.5)"})` : "none", transition: "filter 0.3s" }}
          >
            <path
              d="M7 12.2C2 8.2 0.4 5.6 0.4 3.4A3.1 3.1 0 0 1 7 2.1A3.1 3.1 0 0 1 13.6 3.4C13.6 5.6 12 8.2 7 12.2Z"
              fill={active ? fill : "none"}
              stroke={active ? "none" : "#3a2030"}
              strokeWidth={active ? 0 : 1.3}
            />
          </svg>
        );
      })}
    </div>
  );
}

/* ============================== Footer (control bar) ============================== */

/**
 * The redesigned in-game footer: a 5-section control bar.
 * Left→right: Restart · Up next (hex stack) · NOW PLACING (central focal) · Combos · Log.
 * The four outer sections are equal width; NOW PLACING is the raised, pulsing centre.
 */
export function Footer({
  state,
  hideNext,
  handRef,
  upNextRef,
  onRestart,
  onInfo,
  onLog,
  onSwap,
  onRotate,
  handRevealed,
}: {
  state: GameState;
  hideNext?: boolean;
  handRef?: React.RefObject<HTMLDivElement>;
  upNextRef?: React.RefObject<HTMLDivElement>;
  onRestart: () => void;
  onInfo: () => void;
  onLog: () => void;
  // legacy endgame aid (kept for callers without the wheel): with ≤3 tiles the
  // UP NEXT tiles reveal above the stack; tapping one swaps it in.
  onSwap?: (i: number) => void;
  // THE RUSH WHEEL: when provided, GLINT RUSH (or the last few tiles) turns the
  // footer's centre into the drag-driven hand wheel; rotating commits via this.
  onRotate?: (i: number) => void;
  // the hook's sticky reveal: once true it stays true for the run, even if the
  // hand grows back past the threshold
  handRevealed?: boolean;
}) {
  const tile = visibleTile(state);
  const remaining = Math.max(0, state.hand.length - 1); // unrevealed tiles behind the visible one
  const low = remaining <= 3; // running out — draw attention to the up-next
  const gameOver = state.phase !== "playing";
  // key the gem so a newly revealed tile re-mounts and plays the drop-in bounce
  const gemKey = `${tile ?? "none"}-${state.hand.length}`;
  // THE RUSH WHEEL replaces the old static reveal entirely: same triggers
  // (GLINT RUSH, or hand down to 3), but the whole hand becomes a scrub wheel.
  // The footer LAYOUT never changes — the wheel is an overlay measuring the
  // classic stage, so NOW PLACING, the gem position, the name and the footer's
  // height stay pixel-identical to the non-wheel game.
  const wheelMode = !!onRotate && !gameOver && !!handRevealed && state.hand.length > 0;
  const wheelLive = wheelMode && !hideNext; // hidden while a move resolves
  const stageRef = useRef<HTMLDivElement | null>(null);
  // ‹ SLIDE › teaches the wheel ONCE: it stays until the player's first real
  // slide (ever — persisted), then fades out and never returns
  const [slideHintUsed, setSlideHintUsed] = useState<boolean>(() => readStored<{ used: boolean }>("glint.wheelhint.v1", { used: false }).used);
  const rotateAndMark = onRotate
    ? (i: number) => {
        if (!slideHintUsed) {
          writeStored("glint.wheelhint.v1", { used: true });
          setSlideHintUsed(true);
        }
        onRotate(i);
      }
    : undefined;
  // the legacy reveal only for callers that don't pass onRotate
  const revealed = !wheelMode && onSwap && !gameOver && state.hand.length <= 3 ? state.hand.slice(1) : null;

  return (
    <div style={footerWrap} data-footer-wrap>
      {/* radial accent glow behind the centre to pull focus */}
      <div style={footerGlow} />

      {/* Restart */}
      <FooterButton label="Restart" onClick={onRestart} bobDelay={0}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-2.6-6.4" />
          <path d="M21 3v5h-5" />
        </svg>
      </FooterButton>

      {/* Up next — the hex stack; empty while the wheel owns the queue (the
          wheel IS the up-next), keeping the flex balance that centres NOW
          PLACING on the screen. Legacy ≤3 reveal only without the wheel. */}
      <div style={{ ...footerSection, position: "relative" }} ref={upNextRef}>
        {wheelMode ? (
          // the wheel's queue home: ONE subtle hex (the arc's left anchor).
          // With the LAST tile in hand the queue is spent: dashed grey hex,
          // a zero, and the label flips to NONE LEFT.
          <>
            <div data-uphex style={{ position: "relative", width: 58, height: 54, opacity: state.hand.length > 1 ? 1 : 0.55 }}>
              <svg viewBox="0 0 64 60" width="100%" height="100%" style={{ overflow: "visible", display: "block" }}>
                <polygon
                  points={hexPoints(29, 32, 15)}
                  fill="none"
                  stroke={state.hand.length > 1 ? theme.color.border : theme.color.faint}
                  strokeWidth={1.6}
                  strokeDasharray={state.hand.length > 1 ? undefined : "4 4"}
                />
              </svg>
              <span style={{ ...hexCountBadge, color: state.hand.length > 1 ? theme.color.accent : theme.color.faint }}>
                {state.hand.length > 1 ? state.hand.length : 0}
              </span>
            </div>
            <span style={footerLabel}>{state.hand.length > 1 ? "Up next" : "None left"}</span>
          </>
        ) : revealed ? (
          <>
            <div style={revealColumn}>
              {[...revealed].reverse().map((t, ri) => {
                const idx = revealed.length - ri; // hand index (bottom tile = hand[1])
                return (
                  <button
                    key={`${idx}-${t}`}
                    onClick={() => onSwap!(idx)}
                    title="Tap to swap with the tile you're placing"
                    aria-label="Swap tile"
                    style={revealTileBtn}
                    className="gl-pulse"
                  >
                    <TileGem value={t} size={30} />
                  </button>
                );
              })}
            </div>
            <span style={footerLabel}>Up next</span>
          </>
        ) : (
          <>
            <HexStack count={remaining} low={low} />
            <span style={footerLabel}>Up next</span>
          </>
        )}
      </div>

      {/* NOW PLACING — the raised focal point (classic geometry, ALWAYS): the
          held gem levitates over its ground shadow. In wheel mode the overlay
          draws every tile (the active one rides this stage's centre), so the
          stage itself only keeps the shadow and the flight-target anchor. */}
      <div style={{ ...npSection, opacity: gameOver ? 0.55 : 1 }}>
        <div style={npLabel}>NOW PLACING</div>
        <div
          ref={(el) => {
            stageRef.current = el;
            if (handRef) (handRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          }}
          style={npStage}
        >
          {wheelLive && state.hand.length > 1 && (
            <div className={slideHintUsed ? undefined : "gl-slide-pulse"} style={{ ...slideCaption, opacity: slideHintUsed ? 0 : undefined }}>
              ‹ SLIDE ›
            </div>
          )}
          {hideNext ? (
            <span style={{ ...npFallback, fontSize: 26 }}>…</span>
          ) : wheelLive ? (
            <div className="gl-np-shadow" style={npGroundShadow} />
          ) : tile !== null ? (
            <div key={gemKey} className="gl-drop-in" style={{ position: "absolute", inset: 0 }}>
              <div className={gameOver ? undefined : "gl-np-shadow"} style={npGroundShadow} />
              <div
                className={gameOver ? undefined : "gl-np-hover"}
                style={{
                  ...npGemWrap,
                  filter: `drop-shadow(0 12px 14px rgba(0,0,0,0.5)) drop-shadow(0 0 16px ${hexToRgba(hueOf(tile), 0.4)})`,
                }}
              >
                <TileGem value={tile} size={62} />
              </div>
            </div>
          ) : (
            <span style={{ ...npFallback, fontSize: 22 }}>—</span>
          )}
        </div>
        <div style={npName}>{hideNext ? "resolving…" : tile !== null ? nameOf(tile) : "—"}</div>
      </div>

      {/* Combos (ⓘ) */}
      <FooterButton label="Combos" onClick={onInfo} bobDelay={1.2}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16.5" />
          <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
        </svg>
      </FooterButton>

      {/* Log — opens the collapsing log drawer (icon: expand a panel upward) */}
      <FooterButton label="Log" onClick={onLog} bobDelay={2.4}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="20" y2="21" />
          <polyline points="8 10 12 6 16 10" />
          <line x1="12" y1="6" x2="12" y2="16" />
        </svg>
      </FooterButton>

      {/* THE RUSH WHEEL overlay — draws the whole hand around the stage centre,
          clamped between the buttons; slide OR tap a tile (see RushWheel.tsx) */}
      {wheelLive && <RushWheel hand={state.hand} onRotate={rotateAndMark!} getStage={() => stageRef.current} />}
    </div>
  );
}

/** An equal-width footer tab: a rounded icon tile + label, with press + idle-bob life. */
function FooterButton({
  label,
  onClick,
  bobDelay,
  children,
}: {
  label: string;
  onClick: () => void;
  bobDelay: number;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  return (
    <button
      style={footerSection}
      data-fbtn
      onClick={onClick}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
      aria-label={label}
    >
      <div
        className="gl-btn-life"
        style={{
          ...footerIconTile,
          transform: active ? "scale(0.9)" : undefined,
          borderColor: active ? "rgba(192,132,252,0.7)" : theme.color.border,
          animationDelay: `${bobDelay}s`,
        }}
      >
        {children}
      </div>
      <span style={footerLabel}>{label}</span>
    </button>
  );
}

/** Up next: three clearly-staggered hexagon tiles (back dimmer, front accent) with
 *  the remaining count set dead-centre in the front hex via SVG text. */
function HexStack({ count, low }: { count: number; low: boolean }) {
  // the front hex takes the accent ink, so region themes re-tint it
  const frontStroke = low ? theme.color.bad : theme.color.accent;
  const countColor = low ? theme.color.bad : theme.color.accent;
  // pointy-top hexagon points for a given centre + radius
  const hex = (cx: number, cy: number, r: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (-90 + i * 60) * (Math.PI / 180);
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const R = 15;
  const front = { x: 29, y: 32 };
  return (
    <div className={low ? "gl-urgent" : "gl-floaty"} style={{ position: "relative", width: 58, height: 54 }}>
      <svg viewBox="0 0 64 60" width="100%" height="100%" style={{ overflow: "visible", display: "block" }}>
        {/* back → front, each offset down-left so all three read as a stack */}
        <polygon points={hex(43, 18, R)} fill={theme.color.panelHi} opacity={0.35} stroke={theme.color.border} strokeWidth={1.3} />
        <polygon points={hex(36, 25, R)} fill={theme.color.panelHi} opacity={0.6} stroke={theme.color.border} strokeWidth={1.3} />
        <polygon points={hex(front.x, front.y, R)} fill="var(--panel-hi)" stroke={frontStroke} strokeWidth={1.8} strokeOpacity={low ? 1 : 0.85} />
        {/* the eye-off: these tiles are face-down — the COUNT sits beside the
            hex (same spot as the wheel's counter, so the two modes rhyme) */}
        <g stroke={countColor} strokeWidth={1.7} fill="none" strokeLinecap="round" opacity={0.9}>
          <path d={`M ${front.x - 7} ${front.y} Q ${front.x} ${front.y - 6.5} ${front.x + 7} ${front.y} Q ${front.x} ${front.y + 6.5} ${front.x - 7} ${front.y}`} />
          <circle cx={front.x} cy={front.y} r={2.1} fill={countColor} stroke="none" />
          <line x1={front.x - 8} y1={front.y + 7} x2={front.x + 8} y2={front.y - 7} />
        </g>
      </svg>
      <span style={{ ...hexCountBadge, color: countColor }}>{count}</span>
    </div>
  );
}

// the little hand-count that sits tight against the hexagon's lower-right —
// shared by the classic stack (face-down tiles) and the wheel's single hex,
// so the two modes read as one system
const hexCountBadge: React.CSSProperties = {
  position: "absolute",
  left: 40,
  bottom: 5,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 13,
  lineHeight: 1,
};

function nameOf(t: TileVal): string {
  if (t === GLINT) return theme.special.glint.name;
  if (t === CORE) return theme.special.core.name;
  // achievement bonus gems (Zenith is the only one dealt to the hand, but guard all
  // three so a name lookup never falls through to theme.minerals, which is only 1–6)
  if (t === RESURRECT) return theme.special.resurrect.name;
  if (t === QUADRIANT) return theme.special.quadriant.name;
  if (t === ZENITH) return theme.special.zenith.name;
  return theme.minerals[t as MineralValue].name;
}

/** The gem's signature hue, for the levitation under-glow. */
function hueOf(t: TileVal): string {
  if (t === GLINT) return theme.special.glint.hue;
  if (t === CORE) return theme.special.core.hue;
  if (t === RESURRECT) return theme.special.resurrect.hue;
  if (t === QUADRIANT) return theme.special.quadriant.hue;
  if (t === ZENITH) return theme.special.zenith.hue;
  return theme.minerals[t as MineralValue].hue;
}

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ============================== Legends ============================== */

export function TileLegend() {
  const m = CONTENT.minerals;
  const minerals: MineralValue[] = [1, 2, 3, 4, 5, 6];
  return (
    <div style={legendWrap}>
      <div style={legendTitle}>{m.title}</div>
      {minerals.map((val) => (
        <div key={val} style={tileLegendRow}>
          <div style={tileLegendGem}>
            <TileGem value={val} size={34} />
          </div>
          <span style={{ color: theme.color.text, fontWeight: 600, minWidth: 96 }}>{m.rows[val - 1]?.name ?? theme.minerals[val].name}</span>
          <span style={{ color: theme.color.dim, flex: 1, fontSize: 12.5 }}>{m.rows[val - 1]?.desc ?? ""}</span>
          <span style={{ color: theme.color.gold, fontFamily: theme.fonts.disp, fontWeight: 700 }}>{val}</span>
        </div>
      ))}
      <div style={{ ...legendTitle, marginTop: 14 }}>{m.specialTitle}</div>
      {/* ACHIEVEMENT BONUS GEMS — listed above Dross, but ONLY once the player has
          unlocked each one (earned its achievement) */}
      <BonusTileRows />
      <div style={tileLegendRow}>
        <div style={tileLegendGem}>
          <TileGem value={GLINT} size={34} />
        </div>
        <span style={{ color: theme.color.text, fontWeight: 600, minWidth: 96 }}>{m.drossName}</span>
        <span style={{ color: theme.color.dim, flex: 1, fontSize: 12.5 }}>{m.drossDesc}</span>
        <span style={{ color: theme.color.gold, fontFamily: theme.fonts.disp, fontWeight: 700 }}>0</span>
      </div>
      <div style={tileLegendRow}>
        <div style={tileLegendGem}>
          <TileGem value={CORE} size={34} />
        </div>
        <span style={{ color: theme.color.text, fontWeight: 600, minWidth: 96 }}>{m.nebuliteName}</span>
        <span style={{ color: theme.color.dim, flex: 1, fontSize: 12.5 }}>{m.nebuliteDesc}</span>
        <span style={{ color: theme.color.gold, fontFamily: theme.fonts.disp, fontWeight: 700 }}>7</span>
      </div>
      <div style={{ color: theme.color.gold, opacity: 0.9, fontSize: 11.5, margin: "-4px 0 2px 46px" }}>
        {m.nebuliteNote}
      </div>
    </div>
  );
}

/** The three ACHIEVEMENT bonus gems, each shown only after the player unlocks it.
 *  Name + effect blurb come from the CMS (achievements.abilityUnlock.gems); the
 *  compact value tag is fixed per gem. */
function BonusTileRows() {
  const stats = loadStats();
  // the Combos & Values text is its own CMS field (minerals.bonusTiles), edited
  // in the COMBOS / VALUES tab — separate from the game-end pop-up's copy
  const rows = (CONTENT.minerals as unknown as { bonusTiles?: { key: string; name: string; desc: string }[] }).bonusTiles ?? [];
  const TAG: Record<string, { val: TileVal; tag: string }> = {
    invincible: { val: RESURRECT, tag: "♥" },
    crimsonEndurance: { val: QUADRIANT, tag: "×4" },
    superluminal: { val: ZENITH, tag: "+6k" },
  };
  const shown = rows.filter((r) => TAG[r.key] && abilityUnlocked(r.key, stats));
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((r) => (
        <div key={r.key} style={tileLegendRow}>
          <div style={tileLegendGem}>
            <TileGem value={TAG[r.key].val} size={34} />
          </div>
          <span style={{ color: theme.color.text, fontWeight: 600, minWidth: 96 }}>{r.name}</span>
          <span style={{ color: theme.color.dim, flex: 1, fontSize: 12.5 }}>{r.desc}</span>
          <span style={{ color: theme.color.gold, fontFamily: theme.fonts.disp, fontWeight: 700 }}>{TAG[r.key].tag}</span>
        </div>
      ))}
    </>
  );
}

export function ComboLegend() {
  return (
    <div style={legendWrap}>
      <div style={legendTitle}>{CONTENT.combos.combosTitle}</div>
      {CONTENT.combos.combosRows.map((r) => (
        <div key={r.name} style={legendRow}>
          <span style={{ color: "#c79bf5", fontFamily: theme.fonts.disp, fontWeight: 600, minWidth: 84 }}>{r.name}</span>
          <span style={{ color: theme.color.dim, flex: 1, fontSize: 12.5 }}>{r.desc}</span>
          <span style={{ color: theme.color.gold, fontFamily: theme.fonts.disp, fontWeight: 700 }}>{r.pts}</span>
        </div>
      ))}
      <div style={{ ...legendTitle, marginTop: 12 }}>{CONTENT.combos.chainsTitle}</div>
      {CONTENT.combos.chainsRows.map((r) => (
        <div key={r.name} style={legendRow}>
          <span style={{ color: "#c79bf5", fontFamily: theme.fonts.disp, fontWeight: 600, minWidth: 84 }}>{r.name}</span>
          <span style={{ color: theme.color.dim, flex: 1, fontSize: 12.5 }}>{r.desc}</span>
          <span style={{ color: theme.color.gold, fontFamily: theme.fonts.disp, fontWeight: 700 }}>{r.pts}</span>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: theme.color.faint, marginTop: 12, lineHeight: 1.5 }}>
        {CONTENT.combos.footnote}
      </div>
    </div>
  );
}

/* ============================== Log ============================== */

export function LogPanel({ state }: { state: GameState }) {
  const colorFor = (k: string) =>
    k === "bank"
      ? theme.color.good
      : k === "bust"
      ? theme.color.bad
      : k === "core"
      ? theme.color.accent
      : k === "glint"
      ? theme.color.gold
      : k === "rush"
      ? theme.color.gold
      : k === "lode"
      ? theme.color.gold
      : theme.color.dim;
  return (
    <div style={logWrap}>
      <div style={legendTitle}>LOG</div>
      {state.log.map((e, i) => {
        const rush = e.kind === "rush" || e.kind === "lode";
        return (
          <div
            key={i}
            style={{
              fontFamily: rush ? theme.fonts.disp : theme.fonts.sans,
              fontWeight: rush ? 700 : 400,
              fontSize: rush ? 13 : 12.5,
              color: colorFor(e.kind),
              padding: rush ? "5px 8px" : "2px 0",
              margin: rush ? "3px 0" : undefined,
              borderRadius: rush ? 8 : undefined,
              background: rush ? "rgba(232,181,63,0.12)" : undefined,
              border: rush ? "1px solid rgba(232,181,63,0.4)" : undefined,
              opacity: rush ? 1 : Math.max(0.4, 1 - i * 0.03),
            }}
          >
            {e.text}
          </div>
        );
      })}
    </div>
  );
}

/* ============================== styles ============================== */

const hudWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 2, // the sweep starts just under the HUD (the top bar)
};
const statBox: React.CSSProperties = {
  ...cardFace, // perspective card: gradient face, no bevel (depth spec §4)
  padding: "6px 14px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center", // equal top/bottom room (SCORE/BANKS/BUSTS same height, centred)
};
// card content sits on a higher Z-plane, parallaxing against its own card
const cardLift: React.CSSProperties = {
  transform: "translateZ(14px)",
};
const statLabel: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontSize: 8.5,
  letterSpacing: "0.2em",
  color: theme.color.faint,
};
const scoreValue: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 31,
  lineHeight: 1,
  marginTop: 2,
  color: theme.color.gold,
  textShadow: "0 0 20px rgba(232,181,63,0.28)",
};

const footerWrap: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 2,
  padding: "8px 8px 10px",
  // flat floating panel (no bevel) — the icon tiles inside are the beveled bits.
  // Reads the region-theme variables; standard violet-slate as the fallback.
  background: "var(--rg-footer, linear-gradient(180deg, rgba(23,26,40,0.9), rgba(13,15,26,0.94)))",
  border: "1px solid var(--rg-border, #2c2f4a)",
  borderRadius: 24,
  boxShadow: "0 18px 40px -12px rgba(0,0,0,0.8)",
};
const footerGlow: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: -30,
  transform: "translateX(-50%)",
  width: 124,
  height: 120,
  borderRadius: "50%",
  background: "radial-gradient(circle at 50% 56%, rgba(192,132,252,0.22), transparent 62%)",
  pointerEvents: "none",
};
const footerSection: React.CSSProperties = {
  position: "relative",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 5,
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px 0",
  color: theme.color.dim,
};
const footerIconTile: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 13,
  ...bevelIcon,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "transform 0.14s, border-color 0.2s",
};
// the endgame reveal — the last 1–2 hand tiles face-up, stacked vertically above
// the UP NEXT label (no stack icon), tappable to swap with the visible tile
const revealColumn: React.CSSProperties = {
  position: "absolute",
  bottom: 24, // just above the "Up next" label
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 3,
  zIndex: 3,
};
const revealTileBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  background: "none",
  border: "none",
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  filter: "drop-shadow(0 5px 7px rgba(0,0,0,0.55)) drop-shadow(0 0 9px rgba(192,132,252,0.3))",
};
// same treatment as the SCORE / BANKS / BUSTS / LOG labels (Share Tech Mono)
const footerLabel: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontWeight: 400,
  fontSize: 8.5,
  letterSpacing: "0.2em",
  color: theme.color.faint,
  textTransform: "uppercase",
};
const npSection: React.CSSProperties = {
  position: "relative",
  flex: "none",
  width: 96,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  marginTop: -34,
  transition: "opacity 0.3s",
};
const npLabel: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontWeight: 700,
  fontSize: 8.5,
  letterSpacing: "0.2em",
  color: theme.color.accent,
};
// the levitation stage: no slot box — the gem floats over the footer's radial glow
const npStage: React.CSSProperties = {
  position: "relative",
  width: 86,
  height: 86,
};
const npGroundShadow: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 2,
  width: 54,
  height: 11,
  borderRadius: "50%",
  background: "radial-gradient(closest-side, rgba(0,0,0,0.7), transparent)",
  transform: "translateX(-50%)", // the gl-np-shadow animation carries this too
};
const npGemWrap: React.CSSProperties = {
  position: "absolute",
  left: 12,
  top: 6,
  width: 62,
  height: 62,
};
const npFallback: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: theme.color.faint,
};
// the wheel's slide hint — sits at the STAGE's bottom edge, between the gem
// and its name (absolute: zero layout impact). Same ink as the button labels,
// a soft pulse, and a slow fade once the player has slid for the first time.
const slideCaption: React.CSSProperties = {
  position: "absolute",
  bottom: -6,
  left: "50%",
  transform: "translateX(-50%)",
  fontFamily: theme.fonts.mono,
  fontSize: 8.5,
  letterSpacing: "0.26em",
  color: theme.color.faint,
  userSelect: "none",
  whiteSpace: "nowrap",
  zIndex: 6,
  transition: "opacity 1s ease",
};

// pointy-top hexagon points (shared by the stack icon and the wheel-mode hex)
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (-90 + i * 60) * (Math.PI / 180);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const npName: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 12,
  color: theme.color.text,
  textAlign: "center",
};

const tileLegendRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontFamily: theme.fonts.sans,
  fontSize: 14,
  padding: "5px 0",
};
const tileLegendGem: React.CSSProperties = {
  width: 36,
  height: 36,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const legendWrap: React.CSSProperties = {
  ...cardFace,
  borderRadius: 18,
  padding: 16,
};
const legendTitle: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontSize: 9.5,
  letterSpacing: "0.18em",
  color: theme.color.faint,
  marginBottom: 8,
};
const legendRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  fontFamily: theme.fonts.sans,
  fontSize: 13,
  padding: "4px 0",
  alignItems: "baseline",
};
const logWrap: React.CSSProperties = {
  ...cardFace,
  borderRadius: 18,
  padding: 16,
  height: "100%",
  maxHeight: 220,
  overflowY: "auto",
};
