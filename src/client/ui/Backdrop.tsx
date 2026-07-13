import { memo } from "react";

/**
 * Parallax abyss backdrop (design_handoff_glint_depth §6): layered nebulae, a
 * three-band starfield at three drift speeds (translate3d only), a fine film
 * grain and a soft vignette for depth, plus a few rising dust motes. Fixed and
 * pointer-inert; screens render above it. The parallax layers + motes freeze
 * under reduced-motion (see index.css); everything else is static.
 */
export const Backdrop = memo(function Backdrop({ contained }: { contained?: boolean }) {
  return (
    <div style={contained ? { ...wrap, position: "absolute", zIndex: 0 } : wrap} aria-hidden>
      {/* deep base wash — a large, very soft violet→cyan gradient for depth */}
      <div style={{ ...layer, background: "radial-gradient(760px 620px at 26% 6%, rgba(90,64,180,0.20), transparent 66%), radial-gradient(680px 560px at 88% 88%, rgba(40,120,150,0.12), transparent 64%)" }} />
      {/* far nebula — violet (slow drift) + its star band */}
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(380px 300px at 30% 12%, rgba(124,90,224,0.26), transparent 60%), radial-gradient(320px 280px at 82% 60%, rgba(64,200,224,0.13), transparent 62%)" }}>
        <Stars band={FAR} />
      </div>
      {/* near nebula — cyan / magenta, counter-drifting + its star band */}
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(300px 250px at 72% 20%, rgba(224,139,255,0.12), transparent 62%), radial-gradient(280px 240px at 12% 80%, rgba(255,90,118,0.07), transparent 60%)" }}>
        <Stars band={MID} />
      </div>
      {/* nearest, brightest stars (fastest drift) */}
      <div className="gl-par-c" style={layer}>
        <Stars band={NEAR} />
      </div>
      {/* rising dust motes */}
      {MOTES.map((m, i) => (
        <div key={i} className="gl-dust" style={{ position: "absolute", left: `${m.x}%`, bottom: `${m.b}%`, width: m.r, height: m.r, borderRadius: "50%", background: m.c, animationDuration: `${m.dur}s`, animationDelay: `${m.delay}s` }} />
      ))}
      {/* a soft diagonal light shaft — static god-ray for depth (no motion cost) */}
      <div style={{ ...layer, background: "linear-gradient(114deg, transparent 44%, rgba(176,200,255,0.06) 50%, transparent 56%)" }} />
      {/* fine film grain — static, blended soft so it only textures the darks */}
      <div style={{ ...layer, backgroundImage: `url("${GRAIN}")`, backgroundRepeat: "repeat", opacity: 0.045, mixBlendMode: "soft-light" }} />
      {/* vignette — pulls focus to the centre, deepens the edges */}
      <div style={{ ...layer, background: "radial-gradient(circle at 50% 42%, transparent 52%, rgba(4,4,10,0.55) 100%)" }} />
    </div>
  );
});

function Stars({ band }: { band: Star[] }) {
  return (
    <>
      {band.map((s, i) => (
        <div key={i} style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, borderRadius: "50%", background: s.c, opacity: s.o, boxShadow: s.glow ? `0 0 ${s.r * 2}px ${s.c}` : undefined }} />
      ))}
    </>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  // below every sibling — at 0 a positioned fixed layer paints over
  // non-positioned content (headers, legends)
  zIndex: -1,
};
const layer: React.CSSProperties = {
  position: "absolute",
  inset: -40,
  willChange: "transform",
};

interface Star { x: number; y: number; r: number; o: number; c: string; glow?: boolean }

const STAR_TINTS = ["#cfe4ff", "#e2c8ff", "#bfeaff", "#ffffff", "#d8c8f5"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
// three depth bands: far = many, small, dim; near = fewer, larger, brighter,
// a couple with a soft glow. Generated once at module load.
function makeBand(n: number, rMin: number, rMax: number, oMin: number, oMax: number, glowChance: number): Star[] {
  return Array.from({ length: n }, () => ({
    x: rnd(0, 100), y: rnd(0, 100), r: +rnd(rMin, rMax).toFixed(1), o: +rnd(oMin, oMax).toFixed(2), c: pick(STAR_TINTS), glow: Math.random() < glowChance,
  }));
}
const FAR = makeBand(26, 0.8, 1.6, 0.28, 0.5, 0);
const MID = makeBand(16, 1.4, 2.2, 0.4, 0.65, 0.15);
const NEAR = makeBand(9, 1.8, 3, 0.5, 0.8, 0.5);

// a tiny fractal-noise tile for film grain (inlined so nothing external loads)
const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

const MOTES = [
  { x: 20, b: 16, r: 3, c: "rgba(192,132,252,0.8)", dur: 7, delay: 0 },
  { x: 58, b: 10, r: 2.4, c: "rgba(127,233,242,0.7)", dur: 9, delay: 2.5 },
  { x: 76, b: 20, r: 2, c: "rgba(224,139,255,0.7)", dur: 8, delay: 5 },
];
