import { useMemo, useRef, useState } from "react";
import { theme, bevel, bevelPrimary } from "../theme/theme";
import { CONTENT, DEFAULT_CONTENT } from "../content/content";
import { GameState, TileVal, GLINT, CORE, newGame } from "../game/engine";
import { Board } from "./Board";
import { TileGem } from "./TileGem";

/**
 * The how-to-play tutorial (design_handoff_glint_tutorial): a 6-slide swipeable
 * carousel over a dimmed board. Swipe (±45px), dots, Back/Next, and a final
 * "Got it — Play". Slide 3 opens the combos reference inline.
 *
 * Opened from the start screen's "How to play" and the in-game Help (?) button.
 * onSkip dismisses to whatever's behind; onPlay is the "Got it — Play" action.
 */
export function Tutorial({
  boardState,
  onSkip,
  onPlay,
  onTutorialLevel,
  onCombos,
}: {
  boardState: GameState;
  onSkip: () => void;
  onPlay: () => void;
  /** "Skip to tutorial" on the first slide — jumps straight into the scripted
   *  Tutorial level (Level 0). */
  onTutorialLevel?: () => void;
  /** "Combos & Values" on the first slide — closes this pop-up and opens the
   *  Combos & Values sheet. */
  onCombos?: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const [showCombos, setShowCombos] = useState(false);
  const sx = useRef<number | null>(null);
  // CMS copy: title + body per slide (visuals are fixed per position). Falls back
  // to the bundled defaults per-slide so a stale preview draft with fewer slides
  // can't blank the newer ones.
  const S = DEFAULT_CONTENT.howToPlay.slides.map((d, i) => CONTENT.howToPlay.slides[i] ?? d);
  const LAST = S.length - 1;

  // Slide 1's board is a fixed demo, always full of mineral gems — the live state
  // could be a half-cleared (or fully cleared, i.e. empty) board, which would
  // undercut "clear all of these". Fixed seed so the slide always looks the same.
  const demoBoard = useMemo(() => newGame({ side: 5, seed: 7, nebulites: 0, dross: 0 }), []);

  const go = (i: number) => {
    setSlide(Math.max(0, Math.min(LAST, i)));
    setShowCombos(false);
  };
  const onDown = (e: React.PointerEvent) => {
    sx.current = e.clientX;
  };
  const onUp = (e: React.PointerEvent) => {
    if (sx.current == null) return;
    const dx = e.clientX - sx.current;
    sx.current = null;
    if (dx < -45) go(slide + 1);
    else if (dx > 45) go(slide - 1);
  };

  return (
    <div style={scrim} className="gl-fade">
      {/* dim board backdrop */}
      <div style={backdrop}>
        <div style={{ transform: "scale(0.92)", width: "min(90vw, 420px)" }}>
          <Board state={boardState} interactive={false} onPlace={() => {}} />
        </div>
      </div>

      <div style={card}>
        {/* top bar */}
        <div style={topbar}>
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.2em", color: theme.color.faint }}>
            HOW TO PLAY
          </span>
          <button onClick={onSkip} style={skipBtn}>
            Skip
          </button>
        </div>

        {/* viewport / track */}
        <div onPointerDown={onDown} onPointerUp={onUp} style={viewport}>
          <div style={{ display: "flex", height: "100%", transition: "transform .38s cubic-bezier(.4,0,.2,1)", transform: `translateX(-${slide * 100}%)` }}>
            <Slide title={S[0].title} copy={S[0].copy}>
              <div style={{ ...visualBox, overflow: "hidden" }}>
                {/* tilted like the real in-game board */}
                <div style={{ transform: "scale(0.6)", perspective: 700 }}>
                  <div style={{ transform: "rotateX(16deg)" }}>
                    <Board state={demoBoard} interactive={false} onPlace={() => {}} />
                  </div>
                </div>
                <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Pill kind="accent">Clear all of these</Pill>
                  <div style={{ width: 1.5, height: 14, background: "linear-gradient(#c084fc,transparent)" }} />
                </div>
              </div>
            </Slide>

            <Slide title={S[1].title} copy={S[1].copy}>
              <div style={{ ...visualBox, gap: 34 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.22em", color: theme.color.accent }}>NOW PLACING</div>
                  {/* the held gem levitates over its ground shadow, like the game footer */}
                  <div style={{ position: "relative", width: 86, height: 88 }}>
                    <div className="gl-np-shadow" style={{ position: "absolute", left: "50%", bottom: 4, width: 54, height: 11, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(0,0,0,0.7), transparent)", transform: "translateX(-50%)" }} />
                    <div className="gl-np-hover" style={{ position: "absolute", left: 12, top: 6, width: 62, height: 62, filter: "drop-shadow(0 12px 14px rgba(0,0,0,0.5)) drop-shadow(0 0 16px rgba(47,210,124,0.4))" }}>
                      <TileGem value={4} size={62} />
                    </div>
                  </div>
                  <Pill kind="good">place this</Pill>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.16em", color: theme.color.faint }}>UP NEXT</div>
                  <HexStackMini count={8} />
                  <Pill kind="violet">hidden</Pill>
                </div>
              </div>
            </Slide>

            <Slide title={S[2].title} copy={S[2].copy}>
              <div style={visualBox}>
                <div style={{ position: "relative", display: "flex" }}>
                  <HexTile value={6} size={60} ring="white" />
                  <HexTile value={6} size={60} ring="white" />
                  <HexTile value={6} size={60} ring="white" />
                  <span style={{ position: "absolute", top: -14, right: -10, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, color: "#fff", background: "rgba(127,233,242,0.18)", border: "1px solid rgba(127,233,242,0.6)", padding: "4px 11px", borderRadius: 999 }}>
                    Trips!
                  </span>
                </div>
                <button onClick={() => setShowCombos(true)} style={seeCombosChip}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="11" x2="12" y2="16.5" />
                    <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
                  </svg>
                  See all combos
                </button>
                {showCombos && <CombosOverlay onClose={() => setShowCombos(false)} />}
              </div>
            </Slide>

            <Slide title={S[3].title} copy={S[3].copy}>
              <div style={visualBox}>
                <div style={{ position: "relative", display: "flex" }}>
                  {[2, 3, 4, 5, 6].map((v) => (
                    <div key={v} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: "#7fe9f5", marginBottom: 5 }}>{v}</span>
                      <HexTile value={v as TileVal} size={50} ring="white" />
                    </div>
                  ))}
                  <span style={{ position: "absolute", bottom: -26, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, color: "#fff", background: "rgba(127,233,242,0.18)", border: "1px solid rgba(127,233,242,0.6)", padding: "4px 11px", borderRadius: 999 }}>
                    Long Drift!
                  </span>
                </div>
              </div>
            </Slide>

            <Slide title={S[4].title} copy={S[4].copy}>
              <div style={{ ...visualBox, flexDirection: "column", gap: 8 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.2em", color: theme.color.faint }}>SCORE</div>
                  <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 30, color: "#ffd980", textShadow: "0 0 22px rgba(232,181,63,0.5)" }}>16,400</div>
                </div>
                <div style={{ position: "relative", display: "flex", gap: 8, marginTop: 6 }}>
                  <HexTile value={4} size={40} ring="gold" />
                  <HexTile value={6} size={40} ring="gold" />
                  <div style={{ position: "relative" }}>
                    <HexTile value={5} size={40} ring="gold" />
                    <span style={{ position: "absolute", right: -22, bottom: -3, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, color: "#1a0b2e", background: "linear-gradient(135deg,#ffe6a8,#e8b53f)", padding: "3px 8px", borderRadius: 8 }}>×6</span>
                  </div>
                </div>
                <Pill kind="good" style={{ marginTop: 10 }}>6 connected = bank!</Pill>
              </div>
            </Slide>

            <Slide title={S[5].title} copy={S[5].copy}>
              <div style={{ ...visualBox, flexDirection: "column", gap: 18 }}>
                <div style={bankPromptMini}>
                  <span style={{ position: "relative", width: 34, height: 34, display: "grid", placeItems: "center" }}>
                    <svg width="34" height="34" viewBox="0 0 34 34" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                      <circle cx="17" cy="17" r="14" fill="none" stroke="rgba(232,181,63,0.25)" strokeWidth="2.6" />
                      <circle cx="17" cy="17" r="14" fill="none" stroke="#e8b53f" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="88" strokeDashoffset="30" />
                    </svg>
                    <span style={{ position: "relative", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 15, color: "#ffd980" }}>2</span>
                  </span>
                  <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 17, color: theme.color.gold, letterSpacing: "0.06em" }}>BANK NOW</span>
                </div>
                <div style={{ display: "flex", gap: 26 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={pipLabel}>BANKS</div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{ width: 13, height: 13, transform: "rotate(45deg)", borderRadius: 3, background: "linear-gradient(135deg,#f4d885,#e8b53f)", boxShadow: "0 0 8px rgba(232,181,63,0.5)" }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={pipLabel}>BUSTS</div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                      {[0, 1, 2].map((i) => (
                        <svg key={i} width="15" height="14" viewBox="0 0 14 13">
                          <path d="M7 12.2C2 8.2 0.4 5.6 0.4 3.4A3.1 3.1 0 0 1 7 2.1A3.1 3.1 0 0 1 13.6 3.4C13.6 5.6 12 8.2 7 12.2Z" fill={theme.color.bad} />
                        </svg>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Slide>

            <Slide title={S[6].title} copy={S[6].copy}>
              <div style={{ ...visualBox, padding: 14 }}>
                <div style={{ display: "flex", gap: 44 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: 62, height: 70, margin: "0 auto" }}>
                      <TileGem value={GLINT} size={62} />
                    </div>
                    <div style={{ fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 10.5, color: "#ff9aac", marginTop: 8 }}>Dross · trap — busts</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: 62, height: 70, margin: "0 auto" }}>
                      <TileGem value={CORE} size={62} />
                    </div>
                    <div style={{ fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 10.5, color: "#d8c8f5", marginTop: 8 }}>Nebulite · +500 · joker</div>
                  </div>
                </div>
              </div>
            </Slide>

            <Slide title={S[7].title} copy={S[7].copy}>
              <div style={{ ...visualBox, flexDirection: "column", gap: 20, padding: 14 }}>
                {/* three shrinking boards */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {[38, 29, 21].map((r, i) => (
                    <div key={r} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {i > 0 && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#857fab" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      )}
                      <svg width={r * 2} height={r * 2} viewBox="-50 -50 100 100">
                        <polygon
                          points="46,0 23,40 -23,40 -46,0 -23,-40 23,-40"
                          fill="rgba(157,123,255,0.08)"
                          stroke={i === 2 ? "#e8b53f" : "#9d7bff"}
                          strokeWidth={i === 2 ? 4 : 2.5}
                          opacity={0.5 + i * 0.25}
                        />
                      </svg>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 16, letterSpacing: "0.06em", background: "linear-gradient(100deg,#ffd0d8,#9d7bff,#7fe9f5)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>COLLAPSE</span>
                  <span style={{ fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 10, color: theme.color.dim }}>91→61→37</span>
                </div>
                <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, color: theme.color.gold, background: "rgba(232,181,63,0.12)", border: "1px solid rgba(232,181,63,0.4)", padding: "6px 14px", borderRadius: 12, letterSpacing: "0.04em" }}>
                  GLINT RUSH · ∞ banks
                </div>
              </div>
            </Slide>

            <Slide title={S[8].title} copy={S[8].copy}>
              <div style={{ ...visualBox, flexDirection: "column", gap: 16 }}>
                {/* the in-game CASH OUT pill */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(232,181,63,0.45)", background: "rgba(22,17,6,0.72)", color: theme.color.gold, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12M7 10l5 5 5-5" />
                    <path d="M4 21h16" />
                  </svg>
                  CASH OUT +1,250
                </div>
                {/* the ceremony tally, miniature */}
                <div style={{ width: 196, borderRadius: 14, border: "1px solid rgba(232,181,63,0.4)", background: "linear-gradient(180deg,#151129,#0d0b18)", padding: "10px 14px" }}>
                  {/* mirrors the real ceremony's rows (2 lives ×250, 2 banks ×150, gems ×100) */}
                  {[
                    ["BUSTS LEFT", "+500"],
                    ["BANKS LEFT", "+300"],
                    ["GEMS LEFT", "+450"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.12em", color: "#a89ad0" }}>
                      <span>{k}</span>
                      <span style={{ color: "#ffd980" }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid rgba(232,181,63,0.25)", marginTop: 6, paddingTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.12em", color: "#a89ad0" }}>CASH OUT VALUE</span>
                    <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 15, color: "#ffd980" }}>1,250</span>
                  </div>
                  <div style={{ marginTop: 9, textAlign: "center", padding: "7px 0", borderRadius: 9, background: "linear-gradient(180deg,#ffe6a8,#e8b53f)", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 11.5, letterSpacing: "0.06em" }}>
                    CONFIRM
                  </div>
                </div>
              </div>
            </Slide>

            <Slide title={S[9].title} copy={S[9].copy}>
              <div style={{ ...visualBox, gap: 6, alignItems: "center" }}>
                {/* miniature LEVEL ISLANDS — the real extruded-hex tiles from the
                    levels page (same geometry/palette), one current + one locked */}
                <div className="gl-island-float" style={{ marginTop: -10 }}>
                  <MiniLevelIsland w={128} kind="current">
                    <div style={{ fontFamily: theme.fonts.mono, fontSize: 7, fontWeight: 700, letterSpacing: "0.22em", color: "#a89ad0" }}>LEVEL 1</div>
                    <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12.5, color: "#ffffff", textShadow: "0 2px 12px rgba(157,123,255,0.5)" }}>The Academy</div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, padding: "4px 10px", borderRadius: 999, background: "linear-gradient(180deg,#a06bf0,#7d3fc4)", color: "#fff", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 7.5, letterSpacing: "0.08em" }}>
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" />
                      </svg>
                      CONTINUE
                    </div>
                  </MiniLevelIsland>
                </div>
                <div style={{ transform: "scale(0.88) translateY(14px)", opacity: 0.9 }}>
                  <MiniLevelIsland w={128} kind="locked">
                    <div style={{ opacity: 0.55, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ fontFamily: theme.fonts.mono, fontSize: 7, fontWeight: 700, letterSpacing: "0.22em", color: "#8a85b8" }}>LEVEL 2</div>
                      <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12.5, color: "#b9b4d6" }}>The Outpost</div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: theme.fonts.mono, fontWeight: 700, fontSize: 6.5, letterSpacing: "0.14em", color: "#6b6690" }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                        </svg>
                        LOCKED
                      </span>
                    </div>
                    {/* the requirement is the way in — never greyed, like the real tile */}
                    <div style={{ fontFamily: theme.fonts.sans, fontWeight: 500, fontSize: 7.5, color: "#8a85b8", marginTop: 3 }}>Clear the board to unlock</div>
                  </MiniLevelIsland>
                </div>
              </div>
            </Slide>
          </div>
        </div>

        {/* dots + nav */}
        <div style={{ padding: "6px 22px 20px" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
            {S.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Slide ${i + 1}`}
                style={{ width: i === slide ? 22 : 7, height: 7, borderRadius: 4, border: "none", cursor: "pointer", background: i === slide ? theme.color.accent : "#2c2950", transition: "all .25s" }}
              />
            ))}
          </div>
          {slide === 0 && (onTutorialLevel || onCombos) && (
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {onTutorialLevel && (
                <button onClick={onTutorialLevel} style={{ ...skipTutBtn, flex: 1, marginBottom: 0 }}>
                  Skip to tutorial
                </button>
              )}
              {onCombos && (
                <button onClick={onCombos} style={{ ...skipTutBtn, flex: 1, marginBottom: 0 }}>
                  Combos &amp; Values
                </button>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {slide > 0 && (
              <button onClick={() => go(slide - 1)} style={backBtn}>
                Back
              </button>
            )}
            {slide < LAST ? (
              <button onClick={() => go(slide + 1)} style={nextBtn}>
                Next
              </button>
            ) : (
              <button onClick={onPlay} style={playBtn}>
                Got it — Play
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- slide + bits ---------- */

function Slide({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: "0 0 100%", padding: "8px 24px 18px", display: "flex", flexDirection: "column" }}>
      {children}
      <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 24, color: theme.color.text, marginTop: 22 }}>{title}</div>
      <div style={{ fontFamily: theme.fonts.sans, fontSize: 14, lineHeight: 1.55, color: theme.color.dim, marginTop: 8 }}>{copy}</div>
    </div>
  );
}

function Pill({ kind, children, style }: { kind: "accent" | "good" | "violet"; children: React.ReactNode; style?: React.CSSProperties }) {
  const c =
    kind === "good"
      ? { fg: "#7af0b4", bg: "rgba(52,217,139,0.12)", bd: "rgba(52,217,139,0.3)" }
      : kind === "violet"
      ? { fg: "#c8c2e8", bg: "rgba(157,123,255,0.14)", bd: "rgba(157,123,255,0.4)" }
      : { fg: "#e9d6ff", bg: "rgba(192,132,252,0.16)", bd: "rgba(192,132,252,0.5)" };
  return (
    <span style={{ fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 10.5, color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, padding: "5px 12px", borderRadius: 999, ...style }}>
      {children}
    </span>
  );
}

/** A single board cell as it looks in the current game: an extruded FLAT-TOP
 *  prism well (lit top-left) with the gem sitting proud over a contact shadow,
 *  plus the activated (white) / banked (gold) ring. */
function HexTile({ value, size, ring }: { value: TileVal; size: number; ring?: "white" | "gold" }) {
  // top-face vertices (flat-top hex, centre 50,50, R 44) + the base 12 lower
  const face = "94,50 72,88 28,88 6,50 28,12 72,12";
  const ringColor = ring === "gold" ? "#ffd980" : "#ffffff";
  return (
    <div style={{ position: "relative", width: size, height: size * 1.14 }}>
      <svg viewBox="0 0 100 114" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        {/* extrusion: base + side walls (matching the board's palette) */}
        <polygon points="94,62 72,100 28,100 6,62 28,24 72,24" fill="#05060d" />
        <polygon points="94,50 72,88 72,100 94,62" fill="#0a0b13" />
        <polygon points="72,88 28,88 28,100 72,100" fill="#10121d" />
        <polygon points="28,88 6,50 6,62 28,100" fill="#262b3a" />
        {/* top face (Foundry slate well) */}
        <polygon points={face} fill="#181a23" />
        <polygon points="94,50 72,12 28,12 6,50" fill="#2a2e3a" opacity={0.42} />
        <polygon points="94,50 72,88 28,88 6,50" fill="#000000" opacity={0.2} />
        <polygon points={face} fill="none" stroke="#2c2f3c" strokeWidth={1.4} />
        {/* the gem's contact shadow on the face */}
        <ellipse cx={51} cy={68} rx={24} ry={8} fill="rgba(0,0,0,0.38)" />
        {/* state ring */}
        {ring && (
          <g style={{ filter: `drop-shadow(0 0 5px ${ring === "gold" ? "rgba(232,181,63,0.7)" : "rgba(255,255,255,0.8)"})` }}>
            <polygon points={face} fill={ring === "gold" ? "#e8b53f" : "none"} opacity={ring === "gold" ? 0.14 : 1} />
            <polygon points={face} fill="none" stroke={ringColor} strokeWidth={3.4} opacity={0.95} />
            <polygon points={face} fill="none" stroke={ringColor} strokeWidth={2} opacity={0.3} transform="translate(50,50) scale(1.1) translate(-50,-50)" />
          </g>
        )}
      </svg>
      {/* gem sits proud of the tile, above its shadow */}
      <div style={{ position: "absolute", left: "19%", top: "10%", width: "62%", height: "62%" }}>
        <TileGem value={value} size={size * 0.62} />
      </div>
    </div>
  );
}

/** A miniature of the levels page's extruded hex ISLAND (LevelSelect): the same
 *  100×132 geometry — base, lit-left / dark-right walls, stroked top face and
 *  top-half facet — with the face content centred on top. */
function MiniLevelIsland({ w, kind, children }: { w: number; kind: "current" | "locked"; children: React.ReactNode }) {
  const c =
    kind === "current"
      ? { top: "#181c2c", left: "#232741", right: "#0e1020", facet: "#242a42", stroke: "#c9a2ff", strokeW: 2.4 }
      : { top: "#121522", left: "#171a28", right: "#0a0c15", facet: "#191d2e", stroke: "#33364a", strokeW: 1.4 };
  const h = Math.round(w * 1.16);
  const svgh = Math.round((w * 132) / 100);
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <svg viewBox="0 0 100 132" width={w} height={svgh} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <polygon points="50,14 96,42 96,98 50,126 4,98 4,42" fill="#07080e" />
        <polygon points="4,42 4,98 50,126 50,114 12,92 12,46" fill={c.left} />
        <polygon points="96,42 96,98 50,126 50,114 88,92 88,46" fill={c.right} />
        <polygon
          points="50,2 96,30 96,86 50,114 4,86 4,30"
          fill={c.top}
          stroke={c.stroke}
          strokeWidth={c.strokeW}
          style={kind === "current" ? { filter: "drop-shadow(0 0 10px rgba(192,132,252,0.55))" } : undefined}
        />
        <polygon points="50,2 96,30 50,58 4,30" fill={c.facet} opacity={0.9} />
        {kind === "current" && (
          <polygon points="50,2 96,30 96,86 50,114 4,86 4,30" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={0.8} transform="translate(0,1.4)" />
        )}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 18px", paddingBottom: 8, gap: 3 }}>
        {children}
      </div>
    </div>
  );
}

function HexStackMini({ count }: { count: number }) {
  // mirrors the in-game UP NEXT stack exactly: face-down tiles carry the
  // closed-eye glyph inside the front hexagon, and the COUNT sits outside it
  // at the lower-right (the same badge spot the rush wheel uses)
  const hex = (cx: number, cy: number, r: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (-90 + i * 60) * (Math.PI / 180);
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const R = 15;
  const f = { x: 26, y: 36 };
  return (
    <div style={{ position: "relative", width: 62, height: 66 }}>
      <svg viewBox="0 0 60 64" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        <polygon points={hex(40, 22, R)} fill="#15182a" opacity="0.45" stroke="#262344" strokeWidth="1.3" />
        <polygon points={hex(33, 29, R)} fill="#15182a" opacity="0.72" stroke="#262344" strokeWidth="1.3" />
        <polygon points={hex(f.x, f.y, R)} fill="#15182a" stroke="rgba(192,132,252,0.85)" strokeWidth="1.8" />
        {/* the eye-off: these tiles are face-down */}
        <g stroke={theme.color.accent} strokeWidth="1.7" fill="none" strokeLinecap="round" opacity="0.9">
          <path d={`M ${f.x - 7} ${f.y} Q ${f.x} ${f.y - 6.5} ${f.x + 7} ${f.y} Q ${f.x} ${f.y + 6.5} ${f.x - 7} ${f.y}`} />
          <circle cx={f.x} cy={f.y} r="2.1" fill={theme.color.accent} stroke="none" />
          <line x1={f.x - 8} y1={f.y + 7} x2={f.x + 8} y2={f.y - 7} />
        </g>
      </svg>
      <span style={{ position: "absolute", left: 40, bottom: 12, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14, lineHeight: 1, color: theme.color.accent }}>{count}</span>
    </div>
  );
}

function CombosOverlay({ onClose }: { onClose: () => void }) {
  // same CMS rows as the in-game combos legend, so the two lists can't drift apart
  const combos = CONTENT.combos.combosRows;
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(8,10,18,0.97)", padding: "16px 18px", overflowY: "auto", borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, color: "#eef0f5" }}>{CONTENT.combos.overlayTitle}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#857fab", fontFamily: theme.fonts.sans, fontWeight: 700, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>
          ×
        </button>
      </div>
      {combos.map(({ name, desc, pts }) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #181b2a" }}>
          <div style={{ width: 64, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, color: "#c79bf5" }}>{name}</div>
          <div style={{ flex: 1, fontFamily: theme.fonts.sans, fontSize: 10.5, color: "#857fab" }}>{desc}</div>
          <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, color: theme.color.gold }}>{pts}</div>
        </div>
      ))}
      <div style={{ fontFamily: theme.fonts.sans, fontSize: 10, lineHeight: 1.4, color: "#7fe9f5", marginTop: 8 }}>
        {CONTENT.combos.overlayChainsNote}
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const scrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(6,7,14,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 70,
  padding: 16,
};
const backdrop: React.CSSProperties = {
  position: "absolute",
  top: "12%",
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  opacity: 0.18,
  filter: "blur(1px)",
  pointerEvents: "none",
};
const card: React.CSSProperties = {
  position: "relative",
  width: "min(94vw, 344px)",
  height: "min(88vh, 660px)",
  borderRadius: 30,
  background: "linear-gradient(180deg,#101320,#0b0d16)",
  border: "1px solid #262344",
  boxShadow: "0 40px 80px -20px rgba(0,0,0,0.7)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
const topbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "18px 20px 6px",
};
const skipBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#857fab",
  fontFamily: theme.fonts.sans,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  padding: "4px 6px",
};
const viewport: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  position: "relative",
  touchAction: "pan-y",
};
const visualBox: React.CSSProperties = {
  position: "relative",
  height: 236,
  borderRadius: 18,
  border: "1px solid #232645",
  background: "#080a12",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const seeCombosChip: React.CSSProperties = {
  position: "absolute",
  bottom: 14,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 14px",
  borderRadius: 999,
  background: "rgba(192,132,252,0.14)",
  border: "1px solid rgba(192,132,252,0.45)",
  color: "#e2bbff",
  fontFamily: theme.fonts.sans,
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
};
const bankPromptMini: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "13px 18px",
  borderRadius: 16,
  border: "1px solid rgba(232,181,63,0.55)",
  background: "linear-gradient(180deg,rgba(232,181,63,0.2),rgba(232,181,63,0.08))",
};
const pipLabel: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontSize: 8,
  letterSpacing: "0.16em",
  color: theme.color.faint,
  marginBottom: 7,
};
const backBtn: React.CSSProperties = {
  padding: "13px 18px",
  borderRadius: 13,
  ...bevel,
  color: "#cdd3e0",
  fontFamily: theme.fonts.sans,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
// "Skip to tutorial" — a full-width secondary button above the Next button on
// the first slide only
const skipTutBtn: React.CSSProperties = {
  width: "100%",
  marginBottom: 10,
  padding: 13,
  borderRadius: 13,
  ...bevel,
  color: "#cdd3e0",
  fontFamily: theme.fonts.sans,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
const nextBtn: React.CSSProperties = {
  flex: 1,
  padding: 14,
  borderRadius: 13,
  ...bevelPrimary,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: "0.02em",
  cursor: "pointer",
};
const playBtn: React.CSSProperties = {
  ...nextBtn,
  background: "linear-gradient(180deg,#7af0b4,#34d98b)",
  borderBottom: "3px solid #1d8a55",
  boxShadow: "0 10px 24px -6px rgba(52,217,139,0.55)",
  color: "#04130c",
};
