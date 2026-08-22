/**
 * A starry-night backdrop for the feature tabs (Challenges, Collection › Customise,
 * Achievements, Friends, Shop) — everything EXCEPT the Ascent (its full 3D scene)
 * and the Sticker Book (its own scene).
 *
 * Pure CSS radial-gradients — NO canvas / WebGL — so it costs nothing to paint and
 * never flickers on window resize (unlike the GL scenes). Three depth layers:
 *   · FAR   — many faint stars, gentle twinkle
 *   · NEAR  — fewer, brighter, gentle twinkle (out of phase)
 *   · BRIGHT — a handful of large near-white stars with a sharp, erratic FLICKER
 * Positions are deterministic (a cheap hash) so the field is stable across renders.
 */

// build a layer of radial-gradient "stars" as a single background-image string.
function field(count: number, seed: number, maxBright: number, baseSize: number, bigChance: number, bigSize: number): string {
  const rnd = (n: number) => { const s = Math.sin(n * 127.1 + seed) * 43758.5453; return s - Math.floor(s); };
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = (rnd(i + 1) * 100).toFixed(2);
    const y = (rnd(i + 53) * 100).toFixed(2);
    const bright = (0.35 + rnd(i + 7) * (maxBright - 0.35)).toFixed(2);
    const r = rnd(i + 3) > bigChance ? bigSize : baseSize;
    dots.push(`radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgba(255,255,255,${bright}), transparent)`);
  }
  return dots.join(", ");
}

const FAR = field(70, 0, 0.8, 1, 0.86, 1.5);
const NEAR = field(34, 900, 1, 1.3, 0.74, 2);
const BRIGHT = field(16, 1700, 1, 2, 0.4, 2.8);

export function StarField({ reduceMotion }: { reduceMotion?: boolean }) {
  const base: React.CSSProperties = { position: "absolute", inset: 0, backgroundRepeat: "no-repeat" };
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      <div style={{ ...base, backgroundImage: FAR, opacity: 0.8, animation: reduceMotion ? undefined : "gl-stars-twinkle 7s ease-in-out infinite" }} />
      <div style={{ ...base, backgroundImage: NEAR, opacity: 0.95, animation: reduceMotion ? undefined : "gl-stars-twinkle 5s ease-in-out infinite reverse" }} />
      {/* the bright, flickering layer the Ascent-style field was missing */}
      <div style={{ ...base, backgroundImage: BRIGHT, opacity: 1, animation: reduceMotion ? undefined : "gl-stars-flicker 3.4s ease-in-out infinite" }} />
    </div>
  );
}
