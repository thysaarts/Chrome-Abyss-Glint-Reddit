import { theme } from "../theme/theme";

/**
 * GLINT RUSH — the final-round announcement, shared between the real game (App)
 * and the scripted tutorial so the moment is identical in both: a glimmer rain,
 * a light streak, and the title streaking in on a glass plate.
 */

const RUSH_GLIMMER = [
  { l: 6, d: 0, s: 13 }, { l: 14, d: 620, s: 9 }, { l: 22, d: 240, s: 11 }, { l: 30, d: 980, s: 8 },
  { l: 38, d: 120, s: 14 }, { l: 46, d: 760, s: 9 }, { l: 54, d: 380, s: 12 }, { l: 62, d: 1140, s: 8 },
  { l: 70, d: 200, s: 13 }, { l: 78, d: 860, s: 10 }, { l: 86, d: 460, s: 12 }, { l: 93, d: 40, s: 9 },
  { l: 10, d: 1500, s: 10 }, { l: 42, d: 1650, s: 9 }, { l: 74, d: 1420, s: 11 }, { l: 58, d: 1900, s: 8 },
];

const overlayScrim: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 30,
  background: "radial-gradient(ellipse at center, rgba(8,9,16,0.5) 0%, rgba(3,4,9,0.8) 100%)",
};

const gradientText: React.CSSProperties = {
  background: theme.color.gradient,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

export function RushOverlay() {
  return (
    <div style={{ ...overlayScrim, overflow: "hidden" }}>
      {/* GLINT: a rain of glimmer falls through the whole announcement */}
      {RUSH_GLIMMER.map((g, i) => (
        <span
          key={i}
          className="gl-glimmer"
          style={{ left: `${g.l}%`, fontSize: g.s, animationDuration: `${2100 + (i % 5) * 240}ms`, animationDelay: `${g.d}ms` }}
        >
          {i % 3 === 0 ? "✦" : "✧"}
        </span>
      ))}
      {/* RUSH: a light streak whips across with the plate's entry and exit */}
      <div
        className="gl-rush-streak"
        style={{
          position: "absolute",
          left: "-15%",
          width: "130%",
          height: 56,
          filter: "blur(11px)",
          background: "linear-gradient(90deg, transparent, rgba(255,224,150,0.5), transparent)",
          pointerEvents: "none",
        }}
      />
      {/* the title streaks in on a glass plate, holds, then launches out — full size,
          bounded by the viewport so it always fits (the board is zoomed OUT for it) */}
      <div
        className="gl-rush-slide gl-plate"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9, padding: "18px 24px", border: "1px solid rgba(232,181,63,0.4)", maxWidth: "95vw" }}
      >
        <div style={{ fontFamily: theme.fonts.mono, fontSize: 11.5, letterSpacing: "0.36em", color: theme.color.accent }}>FINAL ROUND</div>
        <div
          style={{
            fontFamily: theme.fonts.disp,
            fontWeight: 700,
            fontSize: "clamp(38px, 13.5vw, 72px)",
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            ...gradientText,
            filter: "drop-shadow(0 2px 28px rgba(232,181,63,0.6))",
          }}
        >
          GLINT RUSH
        </div>
        <div style={{ fontFamily: theme.fonts.disp, fontWeight: 600, fontSize: 13, color: theme.color.gold, background: "rgba(232,181,63,0.12)", border: "1px solid rgba(232,181,63,0.4)", padding: "5px 14px", borderRadius: 999 }}>
          ∞ infinite banks · any combo banks
        </div>
      </div>
    </div>
  );
}

/**
 * RUSH WIND — the ambient hurry: streaks and motes racing right→left behind
 * the play field for the whole of GLINT RUSH. Pure CSS loops (negative delays
 * fill the field instantly); reduced-motion hides it via the .gl-rushwind rule.
 */
const WIND: { top: string; w: number; dur: number; delay: number; op: number; c: string }[] = [
  { top: "9%", w: 52, dur: 1.6, delay: -0.2, op: 0.3, c: "rgba(232,181,63,0.8)" },
  { top: "16%", w: 30, dur: 2.3, delay: -1.1, op: 0.2, c: "rgba(157,123,255,0.8)" },
  { top: "24%", w: 66, dur: 1.3, delay: -0.7, op: 0.34, c: "rgba(232,181,63,0.75)" },
  { top: "31%", w: 24, dur: 2.7, delay: -2.0, op: 0.16, c: "rgba(226,238,255,0.7)" },
  { top: "39%", w: 44, dur: 1.8, delay: -0.4, op: 0.26, c: "rgba(232,181,63,0.7)" },
  { top: "47%", w: 30, dur: 2.1, delay: -1.6, op: 0.18, c: "rgba(157,123,255,0.75)" },
  { top: "55%", w: 58, dur: 1.4, delay: -0.9, op: 0.3, c: "rgba(232,181,63,0.8)" },
  { top: "62%", w: 26, dur: 2.5, delay: -0.1, op: 0.16, c: "rgba(226,238,255,0.65)" },
  { top: "70%", w: 48, dur: 1.7, delay: -1.3, op: 0.26, c: "rgba(157,123,255,0.7)" },
  { top: "78%", w: 34, dur: 2.0, delay: -0.5, op: 0.2, c: "rgba(232,181,63,0.7)" },
  { top: "85%", w: 60, dur: 1.5, delay: -1.8, op: 0.3, c: "rgba(232,181,63,0.75)" },
  { top: "92%", w: 28, dur: 2.4, delay: -0.8, op: 0.16, c: "rgba(157,123,255,0.7)" },
];

export function RushWind() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }} aria-hidden>
      {WIND.map((p, i) => (
        <div
          key={i}
          className="gl-rushwind"
          style={{
            top: p.top,
            width: p.w,
            opacity: p.op,
            background: `linear-gradient(270deg, ${p.c}, transparent)`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

