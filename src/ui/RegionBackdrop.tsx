import { memo } from "react";
import { RegionTheme } from "../theme/regions";

/**
 * REGION ATMOSPHERES (design_handoff_glint_regions): the background treatment for
 * a themed level. Replaces the standard violet-nebula Backdrop. Every region =
 * an opaque screen base + 1–2 parallax washes (gl-par-a/b drift) + its signature
 * elements + recoloured rising particles. All absolutely-positioned gradient divs,
 * transform/opacity motion only; the board always wins the eye (washes ≤ ~10%).
 * Animated signature elements carry .gl-rg-anim so reduced-motion freezes them.
 */
export const RegionBackdrop = memo(function RegionBackdrop({ region, contained }: { region: RegionTheme; contained?: boolean }) {
  return (
    // `contained` embeds the atmosphere inside a relative box (e.g. the shop
    // theme-preview mock-up) instead of covering the whole screen.
    <div style={{ ...wrap, ...(contained ? { position: "absolute", zIndex: 0 } : null), background: region.screenBg }} aria-hidden>
      {SIGNATURES[region.name]?.()}
    </div>
  );
});

const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  // paint BELOW every sibling: at z-index 0 a positioned fixed layer covers
  // non-positioned content (the opaque base hid the game header's buttons)
  zIndex: -1,
};
const layer: React.CSSProperties = { position: "absolute", inset: -30, willChange: "transform" };
const abs: React.CSSProperties = { position: "absolute" };

/** A recoloured rising mote (the standard dust system). */
function Mote({ x, b, r, c, dur, delay = 0 }: { x: string; b: string; r: number; c: string; dur: number; delay?: number }) {
  return (
    <div
      className="gl-dust gl-rg-anim"
      style={{ ...abs, left: x, bottom: b, width: r, height: r, borderRadius: "50%", background: c, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
    />
  );
}

const SIGNATURES: Record<string, () => JSX.Element> = {
  /* iron mine, industrial — molten light below, gantry haze, rising embers */
  "Machina Forge": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 300px at 50% 116%, rgba(255,110,40,0.26), transparent 60%), radial-gradient(300px 240px at 12% 30%, rgba(150,90,50,0.10), transparent 62%)" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(300px 240px at 88% 52%, rgba(255,150,60,0.08), transparent 62%)" }} />
      {/* faint gantry struts */}
      <div style={{ ...abs, inset: 0, background: "repeating-linear-gradient(48deg, rgba(255,140,60,0.045) 0 2px, transparent 2px 30px)" }} />
      {/* firelight: three stacked bottom glows on irregular flicker tracks */}
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 330, background: "linear-gradient(180deg, transparent, rgba(255,110,30,0.32))", animation: "gl-fire-flick 2.3s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 210, background: "radial-gradient(70% 100% at 50% 100%, rgba(255,150,50,0.32), transparent 72%)", animation: "gl-fire-flick2 1.7s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 120, background: "radial-gradient(52% 100% at 50% 100%, rgba(255,215,120,0.24), transparent 76%)", animation: "gl-fire-flick 1.15s linear infinite", animationDelay: "0.35s" }} />
      <Mote x="20%" b="10%" r={3} c="rgba(255,150,60,0.9)" dur={6.5} />
      <Mote x="62%" b="14%" r={2.4} c="rgba(255,110,40,0.85)" dur={8.5} delay={2.6} />
      <Mote x="80%" b="8%" r={2} c="rgba(255,190,90,0.8)" dur={7.4} delay={4.4} />
    </>
  ),

  /* outlaw neon street — flickering neon tubes, street haze */
  "Fringe Market": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(400px 320px at 50% 112%, rgba(255,60,170,0.2), transparent 62%), radial-gradient(300px 240px at 10% 24%, rgba(90,220,255,0.08), transparent 62%)" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 92% 44%, rgba(200,80,255,0.1), transparent 62%)" }} />
      {/* neon signs sliding in and out */}
      <div className="gl-rg-anim" style={{ ...abs, left: 26, top: "18%", width: 44, height: 5, borderRadius: 3, background: "#ff4fd8", boxShadow: "0 0 14px rgba(255,79,216,0.8)", transformOrigin: "left center", animation: "gl-neon-h 5.5s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: 26, top: "calc(18% + 12px)", width: 26, height: 4, borderRadius: 3, background: "#5fe6f2", boxShadow: "0 0 10px rgba(95,230,242,0.7)", transformOrigin: "left center", animation: "gl-neon-h 7s ease-in-out infinite", animationDelay: "1.3s" }} />
      <div className="gl-rg-anim" style={{ ...abs, right: 30, top: "26%", width: 5, height: 34, borderRadius: 3, background: "#ffd24a", boxShadow: "0 0 12px rgba(255,210,74,0.7)", transformOrigin: "center top", animation: "gl-neon-v 6.2s ease-in-out infinite", animationDelay: "2.1s" }} />
      <div className="gl-rg-anim" style={{ ...abs, right: 64, top: "19%", width: 36, height: 4, borderRadius: 3, background: "#c084fc", boxShadow: "0 0 12px rgba(192,132,252,0.8)", transformOrigin: "right center", animation: "gl-neon-h 8s ease-in-out infinite", animationDelay: "3.6s" }} />
      {/* street haze */}
      <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: 180, background: "linear-gradient(180deg, transparent, rgba(255,60,170,0.12))" }} />
      <Mote x="30%" b="10%" r={2.4} c="rgba(255,120,220,0.9)" dur={7.5} />
      <Mote x="70%" b="14%" r={2} c="rgba(95,230,242,0.8)" dur={9} delay={3.4} />
    </>
  ),

  /* luxury, clean, bright — light shafts, tower windows, roaming concierge lens */
  "Corporate Spire": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(440px 340px at 50% -6%, rgba(215,232,255,0.16), transparent 62%), radial-gradient(300px 260px at 90% 70%, rgba(232,181,63,0.07), transparent 62%)" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 8% 50%, rgba(150,190,255,0.08), transparent 62%)" }} />
      {/* tower-window columns */}
      <div style={{ ...abs, inset: 0, background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.022) 0 2px, transparent 2px 34px)" }} />
      {/* drifting light shafts */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: -40, left: "15%", width: 70, background: "linear-gradient(180deg, rgba(226,238,255,0.07), transparent 75%)", animation: "gl-ray-drift 12s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: -40, left: "46%", width: 44, background: "linear-gradient(180deg, rgba(226,238,255,0.05), transparent 70%)", animation: "gl-ray-drift 15s ease-in-out infinite", animationDelay: "2s" }} />
      {/* searching rings roaming the screen */}
      <div className="gl-rg-anim" style={{ ...abs, right: -70, top: 110, width: 240, height: 240, borderRadius: "50%", border: "1px solid rgba(232,181,63,0.18)", animation: "gl-circ-search 26s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, right: -40, top: 140, width: 180, height: 180, borderRadius: "50%", border: "1px solid rgba(226,238,255,0.1)", animation: "gl-circ-search2 34s ease-in-out infinite" }} />
    </>
  ),

  /* fortress, defence — steel wash, hazard chevrons, red alert base, searchlight */
  "Military Bastion": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(400px 320px at 50% -4%, rgba(140,160,110,0.09), transparent 62%), radial-gradient(360px 300px at 50% 112%, rgba(255,70,70,0.12), transparent 62%)" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 170, background: "radial-gradient(70% 100% at 50% 100%, rgba(255,60,60,0.1), transparent 70%)", animation: "gl-alert-pulse 7s ease-in-out infinite" }} />
      {/* hazard chevron strips */}
      <div style={{ ...abs, left: 0, right: 0, top: 0, height: 12, background: "repeating-linear-gradient(135deg, rgba(255,90,90,0.10) 0 12px, transparent 12px 26px)" }} />
      <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: 12, background: "repeating-linear-gradient(135deg, rgba(255,90,90,0.10) 0 12px, transparent 12px 26px)" }} />
      {/* searchlight sweeping the width */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: -40, left: 0, width: 90, background: "linear-gradient(90deg, transparent, rgba(220,235,220,0.05), transparent)", animation: "gl-beam-sweep 14s ease-in-out infinite" }} />
    </>
  ),

  /* espionage, stealth — one cold wash (the emptiness is the theme), radar, scan band */
  "Shadow Sector": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(380px 300px at 50% 30%, rgba(80,130,200,0.08), transparent 62%)", animationDuration: "20s" }} />
      {/* radar rings expanding behind the board */}
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "46%", width: 340, height: 340, borderRadius: "50%", border: "1px solid rgba(126,200,255,0.22)", animation: "gl-radar 5s ease-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "46%", width: 340, height: 340, borderRadius: "50%", border: "1px solid rgba(126,200,255,0.16)", animation: "gl-radar 5s ease-out infinite", animationDelay: "2.5s" }} />
      {/* horizontal scan band travelling top→bottom */}
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, top: 0, height: 52, background: "linear-gradient(180deg, transparent, rgba(126,200,255,0.06), transparent)", animation: "gl-scan-y 8s linear infinite" }} />
    </>
  ),

  /* spiritual water world — god-rays wavering like light through water, caustics, bubbles */
  "Divinity Enclave": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 340px at 40% 20%, rgba(40,140,220,0.2), transparent 62%), radial-gradient(340px 300px at 85% 80%, rgba(80,220,220,0.1), transparent 62%)", animationDuration: "16s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(300px 260px at 15% 75%, rgba(60,180,255,0.1), transparent 62%)", animationDuration: "22s" }} />
      {/* god-ray columns */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "30%", left: "25%", width: 80, background: "linear-gradient(180deg, rgba(150,220,255,0.11), transparent)", transformOrigin: "center top", animation: "gl-water-ray 9s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "40%", left: "58%", width: 52, background: "linear-gradient(180deg, rgba(150,220,255,0.08), transparent)", transformOrigin: "center top", animation: "gl-water-ray 12s ease-in-out infinite", animationDelay: "2.4s" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "52%", left: "79%", width: 34, background: "linear-gradient(180deg, rgba(150,220,255,0.06), transparent)", transformOrigin: "center top", animation: "gl-water-ray 10.5s ease-in-out infinite", animationDelay: "5s" }} />
      {/* caustic shimmer band at the surface line */}
      <div className="gl-rg-anim" style={{ ...abs, left: -20, right: -20, top: 0, height: 140, background: "radial-gradient(40% 80% at 28% 0%, rgba(120,210,255,0.11), transparent 70%), radial-gradient(36% 70% at 72% 0%, rgba(120,210,255,0.09), transparent 70%)", animation: "gl-caustic 7s ease-in-out infinite" }} />
      {/* bubbles: hollow circles rising with lateral drift */}
      <div className="gl-rg-anim" style={{ ...abs, left: "24%", bottom: "6%", width: 5, height: 5, borderRadius: "50%", border: "1px solid rgba(150,220,255,0.6)", animation: "gl-bubble 9s ease-in infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "56%", bottom: "9%", width: 4, height: 4, borderRadius: "50%", border: "1px solid rgba(150,220,255,0.5)", animation: "gl-bubble 11s ease-in infinite", animationDelay: "3.2s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "78%", bottom: "4%", width: 6, height: 6, borderRadius: "50%", border: "1px solid rgba(150,220,255,0.45)", animation: "gl-bubble 10s ease-in infinite", animationDelay: "6s" }} />
    </>
  ),

  /* hackers, terminal green — code rain, scanlines, glitches, grid floor */
  "Digital Nexus": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 320px at 50% 110%, rgba(60,220,130,0.13), transparent 62%), radial-gradient(320px 260px at 12% 22%, rgba(40,255,170,0.07), transparent 62%)" }} />
      {/* code rain: five clipped strips each sliding down one period, seamless */}
      {[
        { x: "8%", p: 20, s: 5, op: 0.8, dur: 2.6 },
        { x: "26%", p: 24, s: 6, op: 0.6, dur: 3.1 },
        { x: "47%", p: 22, s: 5, op: 1, dur: 2.2 },
        { x: "68%", p: 28, s: 8, op: 0.7, dur: 3.4 },
        { x: "88%", p: 26, s: 7, op: 0.9, dur: 2.8 },
      ].map((r, i) => (
        <div key={i} style={{ ...abs, left: r.x, top: 0, bottom: 0, width: 2, overflow: "hidden" }}>
          <div
            className="gl-rg-anim"
            style={{
              ...abs,
              left: 0,
              top: -r.p,
              bottom: -r.p,
              width: 2,
              background: `repeating-linear-gradient(0deg, rgba(90,255,170,0.38) 0 ${r.s}px, transparent ${r.s}px ${r.p}px)`,
              opacity: r.op,
              animation: `gl-rain-t ${r.dur}s linear infinite`,
            }}
          />
        </div>
      ))}
      {/* scanlines */}
      <div style={{ ...abs, inset: 0, background: "repeating-linear-gradient(0deg, rgba(60,255,158,0.028) 0 1px, transparent 1px 4px)" }} />
      {/* glitch bars: invisible most of the loop, then jump */}
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, top: "32%", height: 3, background: "rgba(60,255,158,0.32)", animation: "gl-glitch-bar 4.2s steps(1) infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, top: "64%", height: 2, background: "rgba(95,230,242,0.28)", animation: "gl-glitch-bar 5.7s steps(1) infinite", animationDelay: "1.9s" }} />
      {/* blinking data blocks */}
      <div className="gl-rg-anim" style={{ ...abs, left: "14%", top: "24%", width: 34, height: 8, background: "rgba(60,255,158,0.3)", animation: "gl-glitch-block 6.4s steps(1) infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, right: "12%", top: "52%", width: 22, height: 6, background: "rgba(95,230,242,0.28)", animation: "gl-glitch-block 8.1s steps(1) infinite", animationDelay: "2.7s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "40%", top: "74%", width: 28, height: 7, background: "rgba(60,255,158,0.26)", animation: "gl-glitch-block 9.2s steps(1) infinite", animationDelay: "5.1s" }} />
      {/* grid floor fading upward */}
      <div
        style={{
          ...abs,
          left: 0,
          right: 0,
          bottom: 0,
          height: 150,
          background: "repeating-linear-gradient(0deg, rgba(60,255,158,0.06) 0 1px, transparent 1px 17px), repeating-linear-gradient(90deg, rgba(60,255,158,0.06) 0 1px, transparent 1px 17px)",
          WebkitMaskImage: "linear-gradient(180deg, transparent, #000)",
          maskImage: "linear-gradient(180deg, transparent, #000)",
        }}
      />
    </>
  ),

  /* ------------------------- THE SHOP WAVE (9) ------------------------- */

  /* bubblegum warp-pop — candy ribbon, bobbing gum orbs, sugar sparkles, nova glow */
  "Candy Nova": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 320px at 50% 112%, rgba(255,110,199,0.2), transparent 62%), radial-gradient(320px 260px at 12% 22%, rgba(120,220,255,0.09), transparent 62%)" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 88% 40%, rgba(255,170,220,0.09), transparent 62%)" }} />
      {/* the candy-stripe ribbon sweeping a soft diagonal */}
      <div style={{ ...abs, inset: 0, background: "repeating-linear-gradient(118deg, rgba(255,110,199,0.05) 0 16px, transparent 16px 44px, rgba(120,220,255,0.035) 44px 58px, transparent 58px 96px)" }} />
      {/* bobbing gum orbs — glossy balls with an off-centre highlight */}
      {[
        { x: "12%", y: "22%", r: 26, c: "255,110,199", dur: 7.5, d: 0 },
        { x: "84%", y: "30%", r: 18, c: "120,220,255", dur: 9, d: 1.8 },
        { x: "72%", y: "70%", r: 22, c: "255,205,120", dur: 8.2, d: 3.4 },
        { x: "20%", y: "74%", r: 15, c: "200,140,255", dur: 10, d: 5.2 },
      ].map((o, i) => (
        <div key={i} className="gl-rg-anim" style={{ ...abs, left: o.x, top: o.y, width: o.r, height: o.r, borderRadius: "50%", background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.5), rgba(${o.c},0.5) 42%, rgba(${o.c},0.14) 78%)`, animation: `gl-candy-bob ${o.dur}s ease-in-out infinite`, animationDelay: `${o.d}s` }} />
      ))}
      {/* sugar sparkles */}
      <div className="gl-rg-anim" style={{ ...abs, left: "34%", top: "16%", width: 4, height: 4, borderRadius: "50%", background: "#ffd7ef", boxShadow: "0 0 8px rgba(255,160,220,0.9)", animation: "gl-twinkle 3.2s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "62%", top: "48%", width: 3, height: 3, borderRadius: "50%", background: "#cdefff", boxShadow: "0 0 7px rgba(140,220,255,0.9)", animation: "gl-twinkle 4.1s ease-in-out infinite", animationDelay: "1.2s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "9%", top: "56%", width: 3, height: 3, borderRadius: "50%", background: "#ffe6ba", boxShadow: "0 0 7px rgba(255,210,130,0.9)", animation: "gl-twinkle 3.7s ease-in-out infinite", animationDelay: "2.3s" }} />
      {/* the nova — a candy-pink bloom breathing at the base */}
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 240, background: "radial-gradient(60% 100% at 50% 100%, rgba(255,110,199,0.22), transparent 72%)", animation: "gl-alert-pulse 6s ease-in-out infinite" }} />
      <Mote x="28%" b="8%" r={2.6} c="rgba(255,140,215,0.9)" dur={7} />
      <Mote x="58%" b="12%" r={2.2} c="rgba(150,225,255,0.85)" dur={8.6} delay={2.8} />
      <Mote x="82%" b="6%" r={2} c="rgba(255,215,140,0.8)" dur={7.8} delay={4.6} />
    </>
  ),

  /* bioluminescent jungle — hanging vines, wandering fireflies, canopy dapples */
  "Verdant Overgrowth": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 340px at 50% -6%, rgba(60,160,80,0.14), transparent 62%), radial-gradient(320px 280px at 88% 78%, rgba(139,234,110,0.07), transparent 62%)", animationDuration: "19s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 10% 62%, rgba(80,200,140,0.08), transparent 62%)" }} />
      {/* vines swaying from the canopy */}
      <div className="gl-rg-anim" style={{ ...abs, top: -20, left: "14%", width: 3, height: "34%", borderRadius: 2, background: "linear-gradient(180deg, rgba(110,200,110,0.3), rgba(110,200,110,0.04))", transformOrigin: "center top", animation: "gl-vine-sway 8s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -20, left: "17%", width: 2, height: "24%", borderRadius: 2, background: "linear-gradient(180deg, rgba(139,234,110,0.24), rgba(139,234,110,0.03))", transformOrigin: "center top", animation: "gl-vine-sway 9.5s ease-in-out infinite", animationDelay: "1.1s" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -20, right: "20%", width: 3, height: "28%", borderRadius: 2, background: "linear-gradient(180deg, rgba(110,200,110,0.26), rgba(110,200,110,0.04))", transformOrigin: "center top", animation: "gl-vine-sway 10.5s ease-in-out infinite", animationDelay: "2.6s" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -20, right: "16%", width: 2, height: "40%", borderRadius: 2, background: "linear-gradient(180deg, rgba(139,234,110,0.2), rgba(139,234,110,0.03))", transformOrigin: "center top", animation: "gl-vine-sway 12s ease-in-out infinite", animationDelay: "4s" }} />
      {/* canopy light dapples wavering like leaves parting */}
      <div className="gl-rg-anim" style={{ ...abs, left: -20, right: -20, top: 0, height: 150, background: "radial-gradient(34% 80% at 30% 0%, rgba(180,255,150,0.09), transparent 70%), radial-gradient(30% 70% at 68% 0%, rgba(180,255,150,0.07), transparent 70%)", animation: "gl-caustic 9s ease-in-out infinite" }} />
      {/* fireflies — glowing dots wandering little loops, blinking */}
      <div className="gl-rg-anim" style={{ ...abs, left: "28%", top: "42%", width: 4, height: 4, borderRadius: "50%", background: "#d8ffb0", boxShadow: "0 0 10px rgba(190,255,140,0.95)", animation: "gl-firefly 11s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "66%", top: "58%", width: 3, height: 3, borderRadius: "50%", background: "#c2ff9a", boxShadow: "0 0 8px rgba(170,255,120,0.9)", animation: "gl-firefly 14s ease-in-out infinite", animationDelay: "3.5s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "48%", top: "26%", width: 3, height: 3, borderRadius: "50%", background: "#e6ffc8", boxShadow: "0 0 8px rgba(200,255,150,0.85)", animation: "gl-firefly 12.5s ease-in-out infinite", animationDelay: "6.8s" }} />
      {/* undergrowth glow */}
      <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: 180, background: "linear-gradient(180deg, transparent, rgba(60,160,80,0.16))" }} />
      <Mote x="22%" b="8%" r={2.4} c="rgba(180,255,150,0.8)" dur={9.5} />
      <Mote x="74%" b="12%" r={2} c="rgba(139,234,110,0.75)" dur={11} delay={4.2} />
    </>
  ),

  /* gothic organ rite — window columns, candle flicker, falling petals, incense */
  "Crimson Requiem": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 340px at 50% -8%, rgba(120,40,60,0.16), transparent 62%), radial-gradient(320px 280px at 86% 74%, rgba(224,72,88,0.07), transparent 62%)", animationDuration: "21s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(300px 260px at 12% 46%, rgba(160,60,90,0.08), transparent 62%)" }} />
      {/* tall cathedral-window slats */}
      <div style={{ ...abs, inset: 0, background: "repeating-linear-gradient(90deg, rgba(224,72,88,0.028) 0 3px, transparent 3px 52px)" }} />
      {/* rose petals falling in a slow waltz */}
      <div className="gl-rg-anim" style={{ ...abs, left: "22%", top: "-4%", width: 7, height: 5, borderRadius: "60% 40% 55% 45%", background: "rgba(224,72,110,0.55)", animation: "gl-petal-fall 13s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "58%", top: "-4%", width: 6, height: 4, borderRadius: "55% 45% 60% 40%", background: "rgba(200,60,90,0.45)", animation: "gl-petal-fall 16s linear infinite", animationDelay: "4.5s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "80%", top: "-4%", width: 5, height: 4, borderRadius: "50% 50% 60% 40%", background: "rgba(240,110,130,0.4)", animation: "gl-petal-fall 18s linear infinite", animationDelay: "9s" }} />
      {/* candle bank flickering at the base */}
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 220, background: "linear-gradient(180deg, transparent, rgba(200,70,60,0.2))", animation: "gl-fire-flick 2.8s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 120, background: "radial-gradient(46% 100% at 30% 100%, rgba(255,150,90,0.13), transparent 74%), radial-gradient(40% 100% at 72% 100%, rgba(255,130,80,0.11), transparent 74%)", animation: "gl-fire-flick2 2s linear infinite", animationDelay: "0.6s" }} />
      <Mote x="36%" b="10%" r={2.2} c="rgba(255,140,110,0.75)" dur={10} />
      <Mote x="68%" b="7%" r={2} c="rgba(224,72,88,0.7)" dur={12} delay={5} />
    </>
  ),

  /* zero-g lounge — spotlight cones, drifting smoke, spinning vinyl, warm bokeh */
  "Velvet Lounge": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 320px at 50% -6%, rgba(224,160,95,0.11), transparent 62%), radial-gradient(320px 280px at 90% 80%, rgba(160,80,60,0.08), transparent 62%)", animationDuration: "23s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 8% 66%, rgba(224,160,95,0.06), transparent 62%)", animationDuration: "28s" }} />
      {/* two warm spotlight cones drifting */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "36%", left: "22%", width: 76, background: "linear-gradient(180deg, rgba(255,205,140,0.09), transparent 80%)", animation: "gl-ray-drift 13s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "44%", left: "62%", width: 54, background: "linear-gradient(180deg, rgba(255,190,120,0.07), transparent 78%)", animation: "gl-ray-drift 17s ease-in-out infinite", animationDelay: "3s" }} />
      {/* the record — spinning on itself while the whole platter roams the corner */}
      <div className="gl-rg-anim" style={{ ...abs, right: -60, top: 90, width: 220, height: 220, animation: "gl-circ-search 32s ease-in-out infinite" }}>
        <div className="gl-rg-anim" style={{ ...abs, inset: 0, borderRadius: "50%", border: "1px solid rgba(224,160,95,0.2)", boxShadow: "inset 0 0 40px rgba(224,160,95,0.05)", animation: "gl-spin-slow 40s linear infinite" }}>
          <div style={{ ...abs, left: "50%", top: -1, width: 30, height: 2, marginLeft: -15, borderRadius: 2, background: "rgba(255,215,160,0.35)" }} />
        </div>
      </div>
      <div className="gl-rg-anim" style={{ ...abs, right: -20, top: 130, width: 140, height: 140, animation: "gl-circ-search2 40s ease-in-out infinite" }}>
        <div className="gl-rg-anim" style={{ ...abs, inset: 0, borderRadius: "50%", border: "1px solid rgba(224,160,95,0.12)", animation: "gl-spin-slow 26s linear infinite reverse" }} />
      </div>
      {/* floating bokeh — soft out-of-focus lights breathing */}
      <div className="gl-rg-anim" style={{ ...abs, left: "14%", top: "58%", width: 22, height: 22, borderRadius: "50%", background: "rgba(255,190,120,0.14)", filter: "blur(3px)", animation: "gl-bokeh-flick 7s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "38%", top: "70%", width: 14, height: 14, borderRadius: "50%", background: "rgba(255,215,160,0.12)", filter: "blur(2px)", animation: "gl-bokeh-flick 9.5s linear infinite", animationDelay: "2.5s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "78%", top: "64%", width: 18, height: 18, borderRadius: "50%", background: "rgba(255,170,110,0.12)", filter: "blur(3px)", animation: "gl-bokeh-flick 8.2s linear infinite", animationDelay: "5s" }} />
      {/* smoke curling through the light */}
      <div className="gl-rg-anim" style={{ ...abs, left: "10%", right: "30%", top: "30%", height: 60, borderRadius: "50%", background: "rgba(230,200,170,0.045)", filter: "blur(9px)", animation: "gl-wave-x 16s ease-in-out infinite" }} />
      <Mote x="30%" b="10%" r={2} c="rgba(255,205,140,0.7)" dur={11} />
      <Mote x="70%" b="14%" r={2.4} c="rgba(224,160,95,0.65)" dur={13} delay={5.5} />
    </>
  ),

  /* orbital beach club — sunset disc, shimmering water bands, drifting lanterns */
  "Isla Neon": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(400px 300px at 50% 108%, rgba(255,157,92,0.16), transparent 62%), radial-gradient(320px 260px at 10% 24%, rgba(60,220,220,0.08), transparent 62%)" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 90% 40%, rgba(255,120,170,0.08), transparent 62%)" }} />
      {/* the low sun — a half-disc breathing on the horizon with banding */}
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", bottom: "31%", width: 190, height: 95, marginLeft: -95, borderRadius: "190px 190px 0 0", background: "linear-gradient(180deg, rgba(255,170,90,0.3), rgba(255,110,140,0.14))", WebkitMaskImage: "repeating-linear-gradient(0deg, #000 0 10px, transparent 10px 14px)", maskImage: "repeating-linear-gradient(0deg, #000 0 10px, transparent 10px 14px)", animation: "gl-alert-pulse 8s ease-in-out infinite" }} />
      {/* the horizon line */}
      <div style={{ ...abs, left: 0, right: 0, bottom: "31%", height: 2, background: "linear-gradient(90deg, transparent, rgba(255,157,92,0.4), transparent)", boxShadow: "0 0 14px rgba(255,157,92,0.35)" }} />
      {/* water — two shimmer bands sliding opposite ways below the horizon */}
      <div className="gl-rg-anim" style={{ ...abs, left: -40, right: -40, bottom: "27%", height: 26, background: "repeating-linear-gradient(90deg, rgba(90,230,230,0.1) 0 26px, transparent 26px 60px)", animation: "gl-wave-x 9s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: -40, right: -40, bottom: "23%", height: 30, background: "repeating-linear-gradient(90deg, rgba(255,170,110,0.08) 0 34px, transparent 34px 78px)", animation: "gl-wave-x 12s ease-in-out infinite reverse" }} />
      {/* paper lanterns floating up from the deck */}
      <div className="gl-rg-anim" style={{ ...abs, left: "18%", bottom: "6%", width: 7, height: 9, borderRadius: "45% 45% 40% 40%", background: "rgba(255,180,100,0.55)", boxShadow: "0 0 12px rgba(255,170,90,0.7)", animation: "gl-bubble 12s ease-in infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "74%", bottom: "4%", width: 6, height: 8, borderRadius: "45% 45% 40% 40%", background: "rgba(255,140,150,0.5)", boxShadow: "0 0 10px rgba(255,130,150,0.6)", animation: "gl-bubble 15s ease-in infinite", animationDelay: "6s" }} />
      <Mote x="40%" b="10%" r={2.2} c="rgba(90,230,230,0.8)" dur={8.5} />
      <Mote x="62%" b="8%" r={2} c="rgba(255,170,110,0.8)" dur={10} delay={3.8} />
    </>
  ),

  /* glacial bells — aurora, heavy snowfall, white fog banks, ice shards, sparkles */
  "Frost Palace": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(440px 360px at 50% -8%, rgba(170,220,255,0.2), transparent 62%), radial-gradient(340px 300px at 88% 76%, rgba(180,230,255,0.1), transparent 62%)", animationDuration: "20s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 280px at 10% 56%, rgba(190,225,255,0.1), transparent 62%)" }} />
      {/* the aurora — a soft ribbon breathing across the top */}
      <div className="gl-rg-anim" style={{ ...abs, left: "-10%", right: "-10%", top: "6%", height: 90, borderRadius: "50%", background: "linear-gradient(90deg, transparent, rgba(120,255,210,0.13) 30%, rgba(143,216,255,0.16) 55%, rgba(190,150,255,0.1) 78%, transparent)", filter: "blur(6px)", animation: "gl-aurora 14s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "-10%", right: "-10%", top: "13%", height: 60, borderRadius: "50%", background: "linear-gradient(90deg, transparent, rgba(143,216,255,0.1) 40%, rgba(120,255,210,0.09) 70%, transparent)", filter: "blur(6px)", animation: "gl-aurora 18s ease-in-out infinite reverse" }} />
      {/* ice shards — crystalline slivers leaning out of the walls, glinting */}
      <div className="gl-rg-anim" style={{ ...abs, left: -6, top: "30%", width: 46, height: 9, background: "linear-gradient(90deg, rgba(215,240,255,0.4), transparent)", clipPath: "polygon(0 0, 100% 50%, 0 100%)", animation: "gl-twinkle 5.5s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: -4, top: "34%", width: 30, height: 6, background: "linear-gradient(90deg, rgba(190,230,255,0.32), transparent)", clipPath: "polygon(0 0, 100% 50%, 0 100%)", animation: "gl-twinkle 6.4s ease-in-out infinite", animationDelay: "1.4s" }} />
      <div className="gl-rg-anim" style={{ ...abs, right: -6, top: "48%", width: 52, height: 10, background: "linear-gradient(270deg, rgba(215,240,255,0.36), transparent)", clipPath: "polygon(100% 0, 0 50%, 100% 100%)", animation: "gl-twinkle 5s ease-in-out infinite", animationDelay: "2.2s" }} />
      <div className="gl-rg-anim" style={{ ...abs, right: -4, top: "53%", width: 32, height: 6, background: "linear-gradient(270deg, rgba(190,230,255,0.3), transparent)", clipPath: "polygon(100% 0, 0 50%, 100% 100%)", animation: "gl-twinkle 7s ease-in-out infinite", animationDelay: "3.4s" }} />
      {/* frost crackle — a faint crystalline lattice over the walls */}
      <div style={{ ...abs, inset: 0, background: "repeating-linear-gradient(62deg, rgba(200,235,255,0.03) 0 1px, transparent 1px 26px), repeating-linear-gradient(-58deg, rgba(200,235,255,0.025) 0 1px, transparent 1px 32px)" }} />
      {/* snowfall — a proper flurry on staggered drifting falls */}
      {[
        { x: "8%", r: 3.4, dur: 10, d: 0, o: 0.85 },
        { x: "20%", r: 4, dur: 11, d: 2.5, o: 0.9 },
        { x: "33%", r: 2.6, dur: 14, d: 5, o: 0.6 },
        { x: "45%", r: 3.2, dur: 9.5, d: 1.2, o: 0.8 },
        { x: "58%", r: 2.4, dur: 13, d: 6.5, o: 0.65 },
        { x: "70%", r: 3.6, dur: 10.5, d: 3.8, o: 0.85 },
        { x: "82%", r: 2.8, dur: 12, d: 8, o: 0.7 },
        { x: "93%", r: 3.2, dur: 11.5, d: 0.8, o: 0.8 },
      ].map((f, i) => (
        <div key={i} className="gl-rg-anim" style={{ ...abs, left: f.x, top: "-3%", width: f.r, height: f.r, borderRadius: "50%", background: `rgba(240,250,255,${f.o})`, animation: `gl-snow ${f.dur}s linear infinite`, animationDelay: `${f.d}s` }} />
      ))}
      {/* ice sparkles */}
      <div className="gl-rg-anim" style={{ ...abs, left: "30%", top: "44%", width: 3, height: 3, borderRadius: "50%", background: "#eaf7ff", boxShadow: "0 0 9px rgba(200,235,255,1)", animation: "gl-twinkle 3.4s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "70%", top: "34%", width: 3, height: 3, borderRadius: "50%", background: "#f2faff", boxShadow: "0 0 9px rgba(215,240,255,0.95)", animation: "gl-twinkle 4.6s ease-in-out infinite", animationDelay: "1.6s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "12%", top: "62%", width: 2.6, height: 2.6, borderRadius: "50%", background: "#e4f4ff", boxShadow: "0 0 8px rgba(190,230,255,0.9)", animation: "gl-twinkle 5.4s ease-in-out infinite", animationDelay: "2.8s" }} />
      {/* pale light shafts */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "40%", left: "36%", width: 60, background: "linear-gradient(180deg, rgba(225,242,255,0.09), transparent 75%)", animation: "gl-ray-drift 16s ease-in-out infinite", animationDelay: "1s" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "52%", left: "64%", width: 40, background: "linear-gradient(180deg, rgba(225,242,255,0.07), transparent 72%)", animation: "gl-ray-drift 20s ease-in-out infinite", animationDelay: "6s" }} />
      {/* white fog — soft banks breathing sideways at two depths */}
      <div className="gl-rg-anim" style={{ ...abs, left: "-14%", right: "-14%", bottom: "20%", height: 110, borderRadius: "50%", background: "rgba(228,242,252,0.10)", filter: "blur(16px)", animation: "gl-wave-x 15s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "-10%", right: "-10%", bottom: "6%", height: 150, borderRadius: "50%", background: "rgba(235,246,255,0.14)", filter: "blur(18px)", animation: "gl-wave-x 11s ease-in-out infinite reverse" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "-16%", right: "-16%", top: "18%", height: 90, borderRadius: "50%", background: "rgba(228,242,252,0.06)", filter: "blur(14px)", animation: "gl-wave-x 19s ease-in-out infinite", animationDelay: "4s" }} />
      {/* frozen floor sheen */}
      <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: 150, background: "linear-gradient(180deg, transparent, rgba(170,225,255,0.16))" }} />
      <Mote x="26%" b="10%" r={2} c="rgba(225,245,255,0.8)" dur={12} />
      <Mote x="66%" b="8%" r={2.2} c="rgba(190,230,255,0.75)" dur={14} delay={6} />
    </>
  ),

  /* cabinet chiptune — starfield, marquee neon, stepping invaders, perspective floor */
  "Retro Arcade": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(400px 300px at 50% 112%, rgba(255,79,225,0.13), transparent 62%), radial-gradient(320px 260px at 12% 20%, rgba(80,240,255,0.07), transparent 62%)" }} />
      {/* pixel starfield */}
      <div className="gl-rg-anim" style={{ ...abs, left: "16%", top: "18%", width: 3, height: 3, background: "#9df2ff", animation: "gl-twinkle 2.8s steps(2) infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "44%", top: "10%", width: 3, height: 3, background: "#ff9df0", animation: "gl-twinkle 3.6s steps(2) infinite", animationDelay: "0.9s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "78%", top: "22%", width: 3, height: 3, background: "#fff59d", animation: "gl-twinkle 3.1s steps(2) infinite", animationDelay: "1.7s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "64%", top: "40%", width: 2, height: 2, background: "#9dffb0", animation: "gl-twinkle 4.2s steps(2) infinite", animationDelay: "2.4s" }} />
      {/* marquee tubes flickering at the top corners */}
      <div className="gl-rg-anim" style={{ ...abs, left: 24, top: "12%", width: 40, height: 5, borderRadius: 3, background: "#ff4fe1", boxShadow: "0 0 14px rgba(255,79,225,0.8)", transformOrigin: "left center", animation: "gl-neon-h 6s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, right: 24, top: "16%", width: 32, height: 4, borderRadius: 3, background: "#50f0ff", boxShadow: "0 0 12px rgba(80,240,255,0.75)", transformOrigin: "right center", animation: "gl-neon-h 7.4s ease-in-out infinite", animationDelay: "2.2s" }} />
      {/* invaders — chunky pixel blocks stepping sideways in formation */}
      <div className="gl-rg-anim" style={{ ...abs, left: "12%", top: "30%", width: 10, height: 7, background: "rgba(255,79,225,0.4)", boxShadow: "14px 0 0 rgba(255,79,225,0.28), 28px 0 0 rgba(255,79,225,0.4)", animation: "gl-pixel-step 6s steps(6) infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "58%", top: "52%", width: 8, height: 6, background: "rgba(80,240,255,0.32)", boxShadow: "12px 0 0 rgba(80,240,255,0.22)", animation: "gl-pixel-step 8s steps(8) infinite reverse", animationDelay: "1.5s" }} />
      {/* scanlines over everything */}
      <div style={{ ...abs, inset: 0, background: "repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 4px)" }} />
      {/* the glowing perspective floor */}
      <div
        style={{
          ...abs,
          left: "-16%",
          right: "-16%",
          bottom: 0,
          height: 170,
          background: "repeating-linear-gradient(0deg, rgba(255,79,225,0.09) 0 1px, transparent 1px 21px), repeating-linear-gradient(90deg, rgba(80,240,255,0.07) 0 1px, transparent 1px 30px)",
          transform: "perspective(300px) rotateX(48deg)",
          transformOrigin: "center bottom",
          WebkitMaskImage: "linear-gradient(180deg, transparent, #000 55%)",
          maskImage: "linear-gradient(180deg, transparent, #000 55%)",
        }}
      />
      <Mote x="34%" b="12%" r={2} c="rgba(255,140,235,0.85)" dur={7.5} />
      <Mote x="72%" b="8%" r={2} c="rgba(120,240,255,0.8)" dur={9} delay={3.6} />
    </>
  ),

  /* solar anthem — the star below, flare rings, heat shimmer, ember storms */
  "Solar Flare": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(440px 340px at 50% 116%, rgba(255,158,46,0.26), transparent 62%), radial-gradient(320px 260px at 12% 26%, rgba(255,110,60,0.07), transparent 62%)" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 88% 44%, rgba(255,200,90,0.07), transparent 62%)" }} />
      {/* the star itself, cresting the bottom edge — layered breathing corona */}
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 420, background: "radial-gradient(64% 100% at 50% 108%, rgba(255,158,46,0.3), transparent 70%)", animation: "gl-alert-pulse 5.5s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 250, background: "radial-gradient(46% 100% at 50% 108%, rgba(255,220,120,0.28), transparent 74%)", animation: "gl-alert-pulse 4s ease-in-out infinite", animationDelay: "1.2s" }} />
      {/* flare rings blowing outward from the surface */}
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "76%", width: 340, height: 340, borderRadius: "50%", border: "1px solid rgba(255,180,80,0.3)", animation: "gl-radar 6s ease-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "76%", width: 340, height: 340, borderRadius: "50%", border: "1px solid rgba(255,140,60,0.2)", animation: "gl-radar 6s ease-out infinite", animationDelay: "3s" }} />
      {/* heat shimmer high above */}
      <div className="gl-rg-anim" style={{ ...abs, left: -20, right: -20, top: 0, height: 130, background: "radial-gradient(38% 80% at 32% 0%, rgba(255,190,100,0.07), transparent 70%), radial-gradient(34% 70% at 70% 0%, rgba(255,160,80,0.06), transparent 70%)", animation: "gl-caustic 6.5s ease-in-out infinite" }} />
      {/* a slow prominence sweep */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: -40, left: 0, width: 100, background: "linear-gradient(90deg, transparent, rgba(255,200,110,0.05), transparent)", animation: "gl-beam-sweep 12s ease-in-out infinite" }} />
      {/* embers, more and faster than anywhere else */}
      <Mote x="18%" b="12%" r={2.8} c="rgba(255,170,70,0.95)" dur={5.5} />
      <Mote x="38%" b="8%" r={2.2} c="rgba(255,130,50,0.9)" dur={6.8} delay={1.6} />
      <Mote x="58%" b="14%" r={2.6} c="rgba(255,210,110,0.9)" dur={6} delay={3} />
      <Mote x="78%" b="9%" r={2} c="rgba(255,150,60,0.85)" dur={7.4} delay={4.5} />
    </>
  ),

  /* a dark waltz — turning rose rings, drifting petals, violet mist, lone stars */
  "Void Rose": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 340px at 50% 30%, rgba(150,60,120,0.12), transparent 62%), radial-gradient(320px 280px at 12% 78%, rgba(232,127,168,0.06), transparent 62%)", animationDuration: "22s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(300px 260px at 88% 22%, rgba(120,70,160,0.08), transparent 62%)" }} />
      {/* the rose — nested elliptical rings turning against each other */}
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "44%", width: 560, height: 640, marginLeft: -280, marginTop: -320, borderRadius: "50%", border: "1px solid rgba(232,127,168,0.16)", animation: "gl-spin-slow 46s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "44%", width: 460, height: 600, marginLeft: -230, marginTop: -300, borderRadius: "50%", border: "1px solid rgba(200,110,190,0.13)", animation: "gl-spin-slow 34s linear infinite reverse" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "44%", width: 620, height: 520, marginLeft: -310, marginTop: -260, borderRadius: "50%", border: "1px solid rgba(160,90,200,0.12)", animation: "gl-spin-slow 58s linear infinite" }} />
      {/* petals adrift on the waltz */}
      <div className="gl-rg-anim" style={{ ...abs, left: "30%", top: "-4%", width: 7, height: 5, borderRadius: "60% 40% 55% 45%", background: "rgba(232,127,168,0.5)", animation: "gl-petal-fall 15s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "66%", top: "-4%", width: 5, height: 4, borderRadius: "55% 45% 60% 40%", background: "rgba(200,110,190,0.42)", animation: "gl-petal-fall 19s linear infinite", animationDelay: "6s" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "12%", top: "-4%", width: 6, height: 4, borderRadius: "50% 50% 60% 40%", background: "rgba(240,150,190,0.36)", animation: "gl-petal-fall 22s linear infinite", animationDelay: "11s" }} />
      {/* lone far stars */}
      <div className="gl-rg-anim" style={{ ...abs, left: "20%", top: "20%", width: 2.6, height: 2.6, borderRadius: "50%", background: "#f2d9ea", boxShadow: "0 0 7px rgba(240,200,230,0.9)", animation: "gl-twinkle 4.4s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "82%", top: "58%", width: 2.2, height: 2.2, borderRadius: "50%", background: "#e6d0f5", boxShadow: "0 0 6px rgba(215,185,245,0.85)", animation: "gl-twinkle 5.2s ease-in-out infinite", animationDelay: "2.1s" }} />
      {/* violet mist pooling below */}
      <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: 190, background: "linear-gradient(180deg, transparent, rgba(120,60,130,0.16))" }} />
      <Mote x="42%" b="8%" r={2} c="rgba(232,127,168,0.7)" dur={12} />
      <Mote x="70%" b="12%" r={2.2} c="rgba(180,120,220,0.65)" dur={14} delay={6.5} />
    </>
  ),

  /* ------------------------- THE PREMIUM WAVE (6) ------------------------- */

  /* crystal chamber — spectrum beams cycling the colour wheel, caustics, shards */
  "Prism Vault": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 340px at 30% 108%, rgba(120,140,255,0.18), transparent 62%), radial-gradient(320px 280px at 82% 8%, rgba(255,120,200,0.11), transparent 62%)", animationDuration: "19s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 60% 56%, rgba(120,255,220,0.08), transparent 62%)" }} />
      {/* three refracted spectrum beams, each slowly cycling its hue and drifting */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: -40, left: "20%", width: 90, background: "linear-gradient(180deg, rgba(255,90,140,0.14), rgba(120,150,255,0.1) 55%, transparent 82%)", filter: "hue-rotate(0deg)", animation: "gl-ray-drift 13s ease-in-out infinite, gl-hue 24s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: -40, left: "48%", width: 60, background: "linear-gradient(180deg, rgba(120,255,200,0.12), rgba(160,120,255,0.09) 60%, transparent 80%)", filter: "hue-rotate(120deg)", animation: "gl-ray-drift 17s ease-in-out infinite, gl-hue 30s linear infinite", animationDelay: "2s, 0s" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: -40, left: "74%", width: 44, background: "linear-gradient(180deg, rgba(255,200,110,0.1), rgba(120,200,255,0.08) 62%, transparent 80%)", filter: "hue-rotate(240deg)", animation: "gl-ray-drift 15s ease-in-out infinite, gl-hue 27s linear infinite", animationDelay: "4s, 0s" }} />
      {/* spectral caustic shimmer across the top */}
      <div className="gl-rg-anim" style={{ ...abs, left: -20, right: -20, top: 0, height: 150, background: "linear-gradient(90deg, rgba(255,90,140,0.09), rgba(255,210,90,0.08) 25%, rgba(120,255,180,0.08) 50%, rgba(120,170,255,0.09) 75%, rgba(210,120,255,0.09))", filter: "blur(8px)", animation: "gl-caustic 7s ease-in-out infinite, gl-hue 40s linear infinite" }} />
      {/* floating faceted shards catching the light */}
      <div className="gl-rg-anim" style={{ ...abs, left: "16%", top: "40%", width: 26, height: 34, background: "linear-gradient(150deg, rgba(210,200,255,0.5), rgba(140,120,220,0.14))", clipPath: "polygon(50% 0, 100% 34%, 78% 100%, 22% 100%, 0 34%)", animation: "gl-firefly 15s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, right: "18%", top: "56%", width: 20, height: 26, background: "linear-gradient(150deg, rgba(180,255,240,0.42), rgba(120,180,220,0.12))", clipPath: "polygon(50% 0, 100% 34%, 78% 100%, 22% 100%, 0 34%)", animation: "gl-firefly 18s ease-in-out infinite", animationDelay: "5s" }} />
      {/* prism sparkles */}
      <div className="gl-rg-anim" style={{ ...abs, left: "38%", top: "22%", width: 3.5, height: 3.5, borderRadius: "50%", background: "#fff", boxShadow: "0 0 9px rgba(200,180,255,1)", animation: "gl-twinkle 3.6s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "64%", top: "34%", width: 3, height: 3, borderRadius: "50%", background: "#eafff6", boxShadow: "0 0 8px rgba(150,255,220,0.95)", animation: "gl-twinkle 4.8s ease-in-out infinite", animationDelay: "1.8s" }} />
      <Mote x="30%" b="9%" r={2.4} c="rgba(180,170,255,0.85)" dur={9} />
      <Mote x="70%" b="12%" r={2.2} c="rgba(160,255,220,0.8)" dur={11} delay={4} />
    </>
  ),

  /* thundercloud sea — rolling clouds, lightning flashes, driving rain, static */
  "Storm Front": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(440px 340px at 50% -8%, rgba(130,200,255,0.12), transparent 62%), radial-gradient(340px 300px at 50% 110%, rgba(90,140,200,0.1), transparent 62%)", animationDuration: "16s" }} />
      {/* heavy cloud banks rolling across at two depths */}
      <div className="gl-rg-anim" style={{ ...abs, left: "-16%", right: "-16%", top: "8%", height: 130, borderRadius: "50%", background: "rgba(30,44,66,0.55)", filter: "blur(20px)", animation: "gl-wave-x 17s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "-16%", right: "-16%", top: "0%", height: 90, borderRadius: "50%", background: "rgba(20,30,48,0.6)", filter: "blur(16px)", animation: "gl-wave-x 13s ease-in-out infinite reverse" }} />
      {/* lightning — full-field flash, and a second bolt-glow off to one side */}
      <div className="gl-rg-anim" style={{ ...abs, inset: 0, background: "radial-gradient(80% 60% at 46% 8%, rgba(200,235,255,0.5), transparent 60%)", animation: "gl-flash 8s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, inset: 0, background: "radial-gradient(60% 50% at 74% 14%, rgba(150,210,255,0.4), transparent 58%)", animation: "gl-flash 11s linear infinite", animationDelay: "5.5s" }} />
      {/* the jagged bolt itself, revealed only on the flash */}
      <div className="gl-rg-anim" style={{ ...abs, left: "44%", top: "6%", width: 3, height: "42%", background: "linear-gradient(180deg, rgba(220,240,255,0.95), rgba(150,210,255,0.1))", clipPath: "polygon(40% 0, 60% 0, 45% 40%, 70% 40%, 30% 100%, 50% 52%, 25% 52%)", boxShadow: "0 0 16px rgba(180,225,255,0.9)", animation: "gl-flash 8s linear infinite" }} />
      {/* driving rain — thin streaks falling on staggered tracks */}
      {[
        { x: "10%", h: 26, dur: 0.9, d: 0, o: 0.5 },
        { x: "24%", h: 34, dur: 1.1, d: 0.4, o: 0.6 },
        { x: "38%", h: 22, dur: 0.8, d: 0.2, o: 0.4 },
        { x: "54%", h: 30, dur: 1.0, d: 0.6, o: 0.55 },
        { x: "68%", h: 24, dur: 0.85, d: 0.1, o: 0.45 },
        { x: "82%", h: 32, dur: 1.15, d: 0.5, o: 0.6 },
        { x: "92%", h: 20, dur: 0.75, d: 0.3, o: 0.4 },
      ].map((r, i) => (
        <div key={i} className="gl-rg-anim" style={{ ...abs, left: r.x, top: 0, width: 1.5, height: r.h, background: `linear-gradient(180deg, transparent, rgba(150,200,240,${r.o}))`, animation: `gl-rain-streak ${r.dur}s linear infinite`, animationDelay: `${r.d}s` }} />
      ))}
      {/* rain haze pooling at the base */}
      <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: 170, background: "linear-gradient(180deg, transparent, rgba(90,140,200,0.14))" }} />
      <Mote x="34%" b="8%" r={2} c="rgba(150,210,255,0.7)" dur={9} />
      <Mote x="72%" b="12%" r={2.2} c="rgba(120,180,230,0.65)" dur={11} delay={4} />
    </>
  ),

  /* desert dusk — twin moons breathing, dune ridges, heat shimmer, drifting sand */
  "Dune Mirage": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 320px at 50% 110%, rgba(255,160,80,0.18), transparent 62%), radial-gradient(340px 300px at 50% 4%, rgba(150,90,180,0.12), transparent 62%)", animationDuration: "20s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 84% 16%, rgba(255,120,140,0.08), transparent 62%)" }} />
      {/* twin moons low in the violet sky */}
      <div className="gl-rg-anim" style={{ ...abs, left: "22%", top: "16%", width: 46, height: 46, borderRadius: "50%", background: "radial-gradient(circle at 38% 32%, rgba(255,225,190,0.6), rgba(210,150,120,0.2) 68%, transparent)", boxShadow: "0 0 30px rgba(255,190,130,0.35)", animation: "gl-alert-pulse 9s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "62%", top: "9%", width: 26, height: 26, borderRadius: "50%", background: "radial-gradient(circle at 40% 34%, rgba(230,205,255,0.5), rgba(150,110,190,0.16) 66%, transparent)", boxShadow: "0 0 20px rgba(190,150,230,0.3)", animation: "gl-alert-pulse 7s ease-in-out infinite", animationDelay: "2s" }} />
      {/* far stars in the dusk */}
      <div className="gl-rg-anim" style={{ ...abs, left: "44%", top: "24%", width: 2.4, height: 2.4, borderRadius: "50%", background: "#ffe8cf", boxShadow: "0 0 6px rgba(255,210,160,0.9)", animation: "gl-twinkle 4.2s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "80%", top: "30%", width: 2, height: 2, borderRadius: "50%", background: "#f0d8ff", boxShadow: "0 0 6px rgba(210,180,240,0.85)", animation: "gl-twinkle 5.4s ease-in-out infinite", animationDelay: "1.9s" }} />
      {/* heat shimmer rising off the sand */}
      <div className="gl-rg-anim" style={{ ...abs, left: -20, right: -20, bottom: "24%", height: 120, background: "radial-gradient(40% 80% at 30% 100%, rgba(255,180,100,0.1), transparent 70%), radial-gradient(36% 70% at 72% 100%, rgba(255,150,90,0.08), transparent 70%)", animation: "gl-caustic 6.5s ease-in-out infinite" }} />
      {/* dune ridges — two curved silhouettes with a warm rim */}
      <div style={{ ...abs, left: "-10%", right: "-10%", bottom: "10%", height: 170, borderRadius: "50% 50% 0 0", background: "linear-gradient(180deg, rgba(90,50,40,0.5), rgba(30,16,20,0.9))", boxShadow: "inset 0 3px 0 rgba(255,170,90,0.22)" }} />
      <div style={{ ...abs, left: "-20%", right: "20%", bottom: 0, height: 150, borderRadius: "0 60% 0 0", background: "linear-gradient(180deg, rgba(70,38,32,0.6), rgba(20,10,14,0.95))", boxShadow: "inset 0 2px 0 rgba(255,150,80,0.18)" }} />
      {/* a slow wind-driven light sweep */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "30%", left: 0, width: 110, background: "linear-gradient(90deg, transparent, rgba(255,200,120,0.05), transparent)", animation: "gl-beam-sweep 16s ease-in-out infinite" }} />
      <Mote x="26%" b="14%" r={2.2} c="rgba(255,190,110,0.8)" dur={8} />
      <Mote x="58%" b="16%" r={2} c="rgba(230,160,110,0.75)" dur={10} delay={3.5} />
      <Mote x="82%" b="12%" r={2.4} c="rgba(255,170,90,0.8)" dur={9} delay={5.5} />
    </>
  ),

  /* throne room — a turning gold chandelier, tall windows, falling gilt, warm glow */
  "Regalia": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 340px at 50% -8%, rgba(240,198,116,0.14), transparent 62%), radial-gradient(340px 300px at 50% 108%, rgba(150,80,200,0.16), transparent 62%)", animationDuration: "22s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(320px 260px at 14% 50%, rgba(180,120,220,0.08), transparent 62%)" }} />
      {/* tall arched window slats */}
      <div style={{ ...abs, inset: 0, background: "repeating-linear-gradient(90deg, rgba(240,198,116,0.03) 0 3px, transparent 3px 58px)" }} />
      {/* the chandelier — nested gold rings turning against each other, hung centre-top */}
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: -120, width: 260, height: 260, marginLeft: -130, borderRadius: "50%", border: "1px solid rgba(240,198,116,0.24)", boxShadow: "inset 0 0 50px rgba(240,198,116,0.08)", animation: "gl-spin-slow 50s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: -90, width: 180, height: 180, marginLeft: -90, borderRadius: "50%", border: "1px solid rgba(240,210,150,0.18)", animation: "gl-spin-slow 38s linear infinite reverse" }} />
      {/* its glow, breathing */}
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: -30, width: 180, height: 120, marginLeft: -90, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,220,140,0.22), transparent 70%)", filter: "blur(6px)", animation: "gl-alert-pulse 6s ease-in-out infinite" }} />
      {/* candle-point lights hanging from the rings */}
      <div className="gl-rg-anim" style={{ ...abs, left: "40%", top: "18%", width: 3, height: 3, borderRadius: "50%", background: "#ffe6a8", boxShadow: "0 0 10px rgba(255,210,120,1)", animation: "gl-twinkle 3.8s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "58%", top: "22%", width: 2.6, height: 2.6, borderRadius: "50%", background: "#ffedc0", boxShadow: "0 0 9px rgba(255,220,140,0.95)", animation: "gl-twinkle 4.6s ease-in-out infinite", animationDelay: "1.4s" }} />
      {/* falling gilt — gold flecks sinking through the hall */}
      {[
        { x: "18%", r: 3, dur: 13, d: 0 },
        { x: "36%", r: 2.4, dur: 16, d: 4 },
        { x: "64%", r: 2.8, dur: 14, d: 2 },
        { x: "82%", r: 2.2, dur: 18, d: 7 },
      ].map((g, i) => (
        <div key={i} className="gl-rg-anim" style={{ ...abs, left: g.x, top: "-4%", width: g.r, height: g.r * 1.6, borderRadius: 1, background: "rgba(240,205,130,0.75)", boxShadow: "0 0 6px rgba(240,205,130,0.6)", animation: `gl-gild-fall ${g.dur}s linear infinite`, animationDelay: `${g.d}s` }} />
      ))}
      {/* amethyst-and-gold pooled light at the base */}
      <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: 190, background: "linear-gradient(180deg, transparent, rgba(120,70,160,0.16))" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: 0, right: 0, bottom: 0, height: 120, background: "radial-gradient(56% 100% at 50% 100%, rgba(240,198,116,0.12), transparent 74%)", animation: "gl-alert-pulse 7s ease-in-out infinite" }} />
      <Mote x="30%" b="10%" r={2} c="rgba(240,205,130,0.75)" dur={11} />
      <Mote x="68%" b="8%" r={2.2} c="rgba(200,140,220,0.65)" dur={13} delay={5} />
    </>
  ),

  /* above the clouds — a warm sun, drifting cloud banks, light rays, rising drift */
  "Skyward": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(460px 360px at 82% -6%, rgba(255,210,140,0.16), transparent 60%), radial-gradient(400px 340px at 20% 20%, rgba(150,200,255,0.12), transparent 62%)", animationDuration: "24s" }} />
      <div className="gl-par-b" style={{ ...layer, background: "radial-gradient(360px 300px at 50% 108%, rgba(180,220,255,0.1), transparent 62%)" }} />
      {/* the sun, high in a corner, breathing warmly */}
      <div className="gl-rg-anim" style={{ ...abs, right: "6%", top: "4%", width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle at 44% 40%, rgba(255,240,200,0.55), rgba(255,200,120,0.16) 60%, transparent 74%)", filter: "blur(2px)", animation: "gl-alert-pulse 8s ease-in-out infinite" }} />
      {/* sun rays fanning down */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "20%", right: "18%", width: 70, background: "linear-gradient(180deg, rgba(255,225,160,0.09), transparent 78%)", animation: "gl-ray-drift 15s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: "34%", right: "38%", width: 44, background: "linear-gradient(180deg, rgba(255,235,190,0.07), transparent 74%)", animation: "gl-ray-drift 19s ease-in-out infinite", animationDelay: "3s" }} />
      {/* cloud banks drifting at three depths */}
      <div className="gl-rg-anim" style={{ ...abs, left: "-20%", right: "-20%", top: "34%", height: 90, borderRadius: "50%", background: "rgba(220,238,255,0.14)", filter: "blur(16px)", animation: "gl-wave-x 21s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "-16%", right: "-16%", bottom: "22%", height: 120, borderRadius: "50%", background: "rgba(210,232,255,0.16)", filter: "blur(18px)", animation: "gl-wave-x 16s ease-in-out infinite reverse" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "-12%", right: "-12%", bottom: "6%", height: 150, borderRadius: "50%", background: "rgba(200,226,255,0.2)", filter: "blur(22px)", animation: "gl-wave-x 26s ease-in-out infinite", animationDelay: "5s" }} />
      {/* airborne sparkle */}
      <div className="gl-rg-anim" style={{ ...abs, left: "30%", top: "28%", width: 3, height: 3, borderRadius: "50%", background: "#ffffff", boxShadow: "0 0 8px rgba(255,240,200,0.95)", animation: "gl-twinkle 4s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "56%", top: "50%", width: 2.6, height: 2.6, borderRadius: "50%", background: "#eaf4ff", boxShadow: "0 0 7px rgba(180,220,255,0.9)", animation: "gl-twinkle 5.2s ease-in-out infinite", animationDelay: "2.1s" }} />
      {/* motes drifting UP like sunlit spores */}
      <Mote x="24%" b="8%" r={2.2} c="rgba(255,235,180,0.75)" dur={12} />
      <Mote x="66%" b="12%" r={2} c="rgba(200,230,255,0.7)" dur={14} delay={5} />
    </>
  ),

  /* liquid chrome — a metallic sheen sweep, mercury ripples, a turning monolith */
  "Obsidian Mirror": () => (
    <>
      <div className="gl-par-a" style={{ ...layer, background: "radial-gradient(420px 340px at 50% 108%, rgba(190,200,220,0.1), transparent 62%), radial-gradient(320px 280px at 30% 6%, rgba(150,200,255,0.06), transparent 62%)", animationDuration: "23s" }} />
      {/* faint iridescent film across the top */}
      <div className="gl-rg-anim" style={{ ...abs, left: -20, right: -20, top: 0, height: 130, background: "linear-gradient(90deg, rgba(150,200,255,0.05), rgba(210,180,255,0.05) 45%, rgba(180,255,230,0.05) 75%, transparent)", filter: "blur(9px)", animation: "gl-caustic 9s ease-in-out infinite" }} />
      {/* the monolith — a tall chrome slab turning very slowly, centre */}
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "30%", width: 150, height: 150, marginLeft: -75, borderRadius: "50%", border: "1px solid rgba(200,210,230,0.18)", boxShadow: "inset 0 0 40px rgba(200,215,240,0.06)", animation: "gl-spin-slow 44s linear infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "34%", width: 96, height: 96, marginLeft: -48, borderRadius: "50%", border: "1px solid rgba(180,195,220,0.12)", animation: "gl-spin-slow 30s linear infinite reverse" }} />
      {/* mercury ripples radiating from the centre */}
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "46%", width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(200,215,240,0.2)", animation: "gl-radar 6s ease-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "50%", top: "46%", width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(180,200,230,0.14)", animation: "gl-radar 6s ease-out infinite", animationDelay: "3s" }} />
      {/* the chrome sheen — a bright metallic band sweeping the width */}
      <div className="gl-rg-anim" style={{ ...abs, top: -40, bottom: -40, left: 0, width: 130, background: "linear-gradient(90deg, transparent, rgba(225,232,245,0.12), rgba(255,255,255,0.06), transparent)", animation: "gl-beam-sweep 11s ease-in-out infinite" }} />
      {/* silver sparkles */}
      <div className="gl-rg-anim" style={{ ...abs, left: "28%", top: "26%", width: 3, height: 3, borderRadius: "50%", background: "#f2f6ff", boxShadow: "0 0 9px rgba(220,230,250,1)", animation: "gl-twinkle 4.2s ease-in-out infinite" }} />
      <div className="gl-rg-anim" style={{ ...abs, left: "72%", top: "60%", width: 2.6, height: 2.6, borderRadius: "50%", background: "#eef2fb", boxShadow: "0 0 8px rgba(200,215,245,0.95)", animation: "gl-twinkle 5.6s ease-in-out infinite", animationDelay: "2.3s" }} />
      {/* a polished reflective floor */}
      <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: 150, background: "linear-gradient(180deg, transparent, rgba(160,180,215,0.12))" }} />
      <Mote x="34%" b="9%" r={2} c="rgba(210,220,240,0.7)" dur={12} />
      <Mote x="70%" b="12%" r={2.2} c="rgba(180,205,240,0.62)" dur={14} delay={6} />
    </>
  ),
};
