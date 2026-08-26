import { useEffect, useRef, useState } from "react";
import { theme } from "../theme/theme";

/**
 * THE CELEBRATION LAYER — screen-space effects for the Motion Lab flourishes
 * (design/motion-lab.html): twinkles, tinted bursts, shockwaves, smoke, arcs,
 * light-rays, beam/comet flights with fading trails, floating scores and the
 * chain commentary words.
 *
 * ONE fixed full-screen canvas plus an HTML overlay for text, mounted once in
 * the game screen. The choreography hook emits events on `fxBus`; positions
 * arrive either as explicit screen coords or as a board cell key, resolved
 * through the same mapper FlyingOverlay uses — so effects land exactly where
 * the gems are, at any zoom or viewport.
 *
 * TWO rules carried from the Lab's own bugs:
 *  - the canvas ELEMENT is pinned to CSS pixels while its bitmap is dpr-scaled
 *    (an unpinned replaced element renders at intrinsic size and every effect
 *    lands at 2× on retina);
 *  - nothing gameplay-critical ever rides these callbacks — completion here is
 *    decoration only; the hook's own timers drive the choreography.
 */

type XY = { x: number; y: number };
type Resolve = { fromKey?: string; fromXY?: XY; to?: "score" | "hand" | "opp" | XY };
export type FxEvent =
  | ({ kind: "twinkle"; color?: string; n?: number; spread?: number } & Resolve)
  | ({ kind: "burst"; colors: string[]; n?: number; sp?: number } & Resolve)
  | ({ kind: "wave"; color?: string } & Resolve)
  | ({ kind: "rays"; color?: string; n?: number } & Resolve)
  | ({ kind: "smoke"; n?: number } & Resolve)
  | ({ kind: "bolt"; toKey?: string } & Resolve)
  | ({ kind: "beam"; color?: string; dur?: number } & Resolve)
  | ({ kind: "comet"; color?: string; dur?: number } & Resolve)
  | ({ kind: "float"; text: string; white?: boolean; color?: string } & Resolve)
  | { kind: "word"; text: string; cool?: boolean; zenith?: boolean };

/* THE WORD GATE — in Versus, commentary belongs to the player, not the
   opponent: online, only the device whose player made the move speaks; against
   the House, the Broker is silenced (both hands share one viewport). The App
   owns the seat knowledge, so it installs the predicate; the hook consults it
   before emitting a word OR its sound. Default: always allowed (solo, co-op). */
let wordAllowed: () => boolean = () => true;
export const setWordGate = (fn: () => boolean): void => { wordAllowed = fn; };
export const wordGateAllows = (): boolean => { try { return wordAllowed(); } catch { return true; } };

type Listener = (e: FxEvent) => void;
const listeners = new Set<Listener>();
/** Fire an effect. Safe to call with no layer mounted (menu, tests) — it just drops. */
export const fxBus = {
  emit(e: FxEvent): void {
    for (const l of listeners) l(e);
  },
};

interface Particle {
  t0: number;
  life: number;
  draw: (ctx: CanvasRenderingContext2D, u: number, now: number) => void;
}

export function GameFxLayer({ mapper, scoreAnchor, handAnchor, opponentAnchor, boardCenter, unit }: {
  mapper: ((key: string) => XY | null) | null;
  scoreAnchor: () => XY | null;
  handAnchor: () => XY | null;
  /** VERSUS: the opponent's footer box — where a watched bank's gems fly */
  opponentAnchor?: () => XY | null;
  boardCenter: () => XY;
  /** DESKTOP AWARENESS: effect geometry scales with the board's rendered size.
   *  1 ≈ a phone board; a laptop's larger board gets proportionally larger
   *  twinkles, bursts, trails and text, so the effects read the same at any
   *  viewport instead of shrinking relative to the gems. */
  unit?: () => number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const partsRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number; text: string; white?: boolean; color?: string }[]>([]);
  const [word, setWord] = useState<{ id: number; text: string; cool?: boolean; zenith?: boolean } | null>(null);
  const seq = useRef(0);
  const propsRef = useRef({ mapper, scoreAnchor, handAnchor, opponentAnchor, boardCenter, unit });
  propsRef.current = { mapper, scoreAnchor, handAnchor, opponentAnchor, boardCenter, unit };

  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      // the retina rule: bitmap dpr-scaled, ELEMENT pinned to CSS pixels
      c.style.width = window.innerWidth + "px";
      c.style.height = window.innerHeight + "px";
    };
    fit();
    window.addEventListener("resize", fit);
    const ctx = c.getContext("2d")!;

    const loop = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      const now = performance.now();
      partsRef.current = partsRef.current.filter((p) => now - p.t0 < p.life);
      for (const p of partsRef.current) p.draw(ctx, (now - p.t0) / p.life, now);
      ctx.restore();
      rafRef.current = partsRef.current.length ? requestAnimationFrame(loop) : null;
    };
    const add = (p: Omit<Particle, "t0">) => {
      partsRef.current.push({ t0: performance.now(), ...p });
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop);
    };

    // motion-sensitive scaling: fewer particles under reduced motion. Settings
    // stamps data-motion on <html> (applySettings), so this is always current.
    const scale = () => (document.documentElement.getAttribute("data-motion") === "reduced" ? 0.5 : 1);
    // geometry unit — the board-size factor (see the `unit` prop)
    const U = () => propsRef.current.unit?.() ?? 1;

    const resolveFrom = (e: Resolve): XY | null =>
      e.fromXY ?? (e.fromKey ? propsRef.current.mapper?.(e.fromKey) ?? null : null);
    const resolveTo = (e: Resolve): XY | null => {
      if (!e.to) return null;
      if (e.to === "score") return propsRef.current.scoreAnchor();
      if (e.to === "hand") return propsRef.current.handAnchor();
      if (e.to === "opp") return propsRef.current.opponentAnchor?.() ?? null;
      return e.to;
    };

    /* ---- the particle vocabulary (ported from the Lab, coordinates in CSS px) ---- */
    const twinkle = (x: number, y: number, color: string, n: number, spread: number) => {
      const u = U();
      for (let i = 0; i < Math.round(n * scale()); i++) {
        const dx = (Math.random() - 0.5) * spread * u, vy = (14 + Math.random() * 26) * u;
        const s = (1 + Math.random() * 1.8) * u, ph = Math.random() * 7;
        add({ life: 900 + Math.random() * 500, draw(ctx, u, now) {
          const a = Math.sin(Math.min(u * 3, 1) * Math.PI) * (0.5 + 0.5 * Math.sin(now / 90 + ph));
          const px = x + dx + Math.sin(now / 300 + ph) * 3, py = y - u * vy * 2.4;
          ctx.globalAlpha = Math.max(a * (1 - u), 0); ctx.fillStyle = color;
          ctx.fillRect(px - s / 2, py - s * 1.6, s, s * 3.2);
          ctx.fillRect(px - s * 1.6, py - s / 2, s * 3.2, s);
          ctx.globalAlpha = 1;
        } });
      }
    };
    const burst = (x: number, y: number, colors: string[], n: number, sp: number) => {
      const uu0 = U();
      for (let i = 0; i < Math.round(n * scale()); i++) {
        const a = Math.random() * Math.PI * 2, v = (0.35 + Math.random() * 0.65) * sp * uu0;
        const col = colors[i % colors.length], s = (1.4 + Math.random() * 2.2) * uu0;
        add({ life: 520 + Math.random() * 380, draw(ctx, u) {
          const d = v * u * 90, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + u * u * 26 * uu0;
          ctx.globalAlpha = 1 - u; ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(px, py, s * (1 - u * 0.5), 0, 7); ctx.fill();
          ctx.globalAlpha = 1;
        } });
      }
    };
    const wave = (x: number, y: number, color: string) => {
      const u0 = U();
      add({ life: 480, draw(ctx, u) {
        ctx.globalAlpha = (1 - u) * 0.7; ctx.strokeStyle = color; ctx.lineWidth = (2.6 * (1 - u) + 0.4) * u0;
        ctx.beginPath(); ctx.arc(x, y, (8 + u * 64) * u0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      } });
    };
    const rays = (x: number, y: number, color: string, n: number) => {
      const u0 = U();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, len = (30 + Math.random() * 26) * u0;
        add({ life: 420, draw(ctx, u) {
          ctx.globalAlpha = (1 - u) * 0.85; ctx.strokeStyle = color; ctx.lineWidth = 2.4 * (1 - u) + 0.4;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 10 * (1 + u * 2), y + Math.sin(a) * 10 * (1 + u * 2));
          ctx.lineTo(x + Math.cos(a) * (10 + len * u + 14), y + Math.sin(a) * (10 + len * u + 14));
          ctx.stroke(); ctx.globalAlpha = 1;
        } });
      }
    };
    const smoke = (x: number, y: number, n: number) => {
      const u0 = U();
      for (let i = 0; i < Math.round(n * scale()); i++) {
        const dx = (Math.random() - 0.5) * 22 * u0, r0 = (6 + Math.random() * 8) * u0;
        const dr = (18 + Math.random() * 14) * u0, vy = (26 + Math.random() * 18) * u0, ph = Math.random() * 9;
        add({ life: 1400 + Math.random() * 600, draw(ctx, u, now) {
          ctx.globalAlpha = 0.16 * (1 - u); ctx.fillStyle = "#9aa0b4";
          ctx.beginPath(); ctx.arc(x + dx + Math.sin(now / 500 + ph) * 6, y - u * vy, r0 + dr * u, 0, 7);
          ctx.fill(); ctx.globalAlpha = 1;
        } });
      }
    };
    const bolt = (x1: number, y1: number, x2: number, y2: number) =>
      add({ life: 340, draw(ctx, u, now) {
        if (Math.floor(now / 45) % 2 === 0) return;
        ctx.globalAlpha = 1 - u; ctx.strokeStyle = "#9be8ff"; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x1, y1);
        const seg = 6;
        for (let i = 1; i < seg; i++) {
          const t = i / seg;
          ctx.lineTo(x1 + (x2 - x1) * t + (Math.random() - 0.5) * 10, y1 + (y2 - y1) * t + (Math.random() - 0.5) * 10);
        }
        ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1;
      } });
    const beam = (x1: number, y1: number, x2: number, y2: number, color: string, dur: number) =>
      add({ life: dur + 220, draw(ctx, u) {
        const uu = Math.min((u * (dur + 220)) / dur, 1);
        ctx.globalAlpha = 0.14 * (uu < 1 ? 1 : 1 - (u * (dur + 220) - dur) / 220);
        ctx.strokeStyle = color; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (uu < 1) {
          const hx = x1 + (x2 - x1) * uu, hy = y1 + (y2 - y1) * uu;
          const bx = x1 + (x2 - x1) * Math.max(uu - 0.3, 0), by = y1 + (y2 - y1) * Math.max(uu - 0.3, 0);
          const grd = ctx.createLinearGradient(bx, by, hx, hy);
          grd.addColorStop(0, "rgba(255,206,106,0)"); grd.addColorStop(1, color);
          ctx.globalAlpha = 0.95; ctx.strokeStyle = grd; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } });
    const comet = (x1: number, y1: number, x2: number, y2: number, color: string, dur: number) => {
      const trail: XY[] = [];
      add({ life: dur + 260, draw(ctx, u) {
        const uu = Math.min((u * (dur + 260)) / dur, 1);
        const e = 1 - Math.pow(1 - uu, 2.4);
        const px = x1 + (x2 - x1) * e, py = y1 + (y2 - y1) * e - Math.sin(e * Math.PI) * 18;
        if (uu < 1) { trail.push({ x: px, y: py }); if (trail.length > 14) trail.shift(); }
        for (let i = 1; i < trail.length; i++) {
          ctx.globalAlpha = (i / trail.length) * 0.5 * (uu < 1 ? 1 : 1 - (u * (dur + 260) - dur) / 260);
          ctx.strokeStyle = color; ctx.lineWidth = (i / trail.length) * 4;
          ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
        }
        if (uu < 1) {
          const u0 = U();
          ctx.globalAlpha = 1; ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(px, py, 3.4 * u0, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(px, py, 1.6 * u0, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } });
    };

    const on: Listener = (e) => {
      if (e.kind === "word") {
        const id = ++seq.current;
        setWord({ id, text: e.text, cool: e.cool, zenith: e.zenith });
        setTimeout(() => setWord((w) => (w?.id === id ? null : w)), 1550);
        return;
      }
      const from = resolveFrom(e);
      if (e.kind === "float") {
        if (!from) return;
        const id = ++seq.current;
        setFloats((f) => [...f, { id, x: from.x, y: from.y, text: e.text, white: e.white, color: e.color }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400);
        return;
      }
      if (!from) return;
      if (e.kind === "twinkle") twinkle(from.x, from.y, e.color ?? "#dfe8ff", e.n ?? 6, e.spread ?? 30);
      else if (e.kind === "burst") burst(from.x, from.y, e.colors, e.n ?? 22, e.sp ?? 2.8);
      else if (e.kind === "wave") { wave(from.x, from.y, e.color ?? "#ffce6a"); wave(from.x, from.y, "#ff9e2e"); }
      else if (e.kind === "rays") rays(from.x, from.y, e.color ?? "#ffce6a", e.n ?? 12);
      else if (e.kind === "smoke") smoke(from.x, from.y, e.n ?? 7);
      else if (e.kind === "bolt") {
        const to = e.toKey ? propsRef.current.mapper?.(e.toKey) ?? null : resolveTo(e);
        if (to) bolt(from.x, from.y, to.x, to.y);
      } else if (e.kind === "beam") {
        const to = resolveTo(e);
        if (to) beam(from.x, from.y, to.x, to.y, e.color ?? "#ffce6a", e.dur ?? 450);
      } else if (e.kind === "comet") {
        const to = resolveTo(e);
        if (to) comet(from.x, from.y, to.x, to.y, e.color ?? "#7fe9f5", e.dur ?? 450);
      }
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
      window.removeEventListener("resize", fit);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      partsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bc = boardCenter();
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 99 }}>
      <canvas ref={canvasRef} style={{ position: "absolute", left: 0, top: 0 }} />
      {floats.map((f) => (
        <div key={f.id} className="gl-fx-float" style={{ left: f.x, top: f.y, fontSize: 21 * (unit?.() ?? 1),
          color: f.color ?? (f.white ? "#eef2ff" : undefined),
          textShadow: f.color
            ? `0 0 14px ${f.color}aa, 0 2px 4px rgba(0,0,0,.8)`
            : f.white ? "0 0 12px rgba(180,200,255,.6), 0 2px 4px rgba(0,0,0,.8)" : undefined }}>
          {f.text}
        </div>
      ))}
      {word && (
        <div key={word.id} className={"gl-fx-word" + (word.zenith ? " zenith" : word.cool ? " cool" : "")}
          style={{ left: bc.x, top: bc.y - 40, fontSize: 30 * (unit?.() ?? 1) }}>
          {word.text}
        </div>
      )}
    </div>
  );
}

/** The glow family per mineral — a lighter, hotter sibling of the body colour
 *  (the Lab's card 6 rule: a Verdite burns green, never generic gold). */
export const GEM_GLOW: Record<number, string> = {
  1: "#e8eef8", 2: "#ffd98a", 3: "#eef3fa", 4: "#8affc4", 5: "#d9a6ff", 6: "#a6f2ff",
  0: "#ffe9a8", 7: "#e0bbff", 8: "#ffb3c2", 9: "#ffb3bd", 10: "#f0ffb0",
};
/** Body colours for tinted bursts (theme hues). */
export const GEM_HUE: Record<number, string> = {
  1: theme.minerals[1].hue, 2: theme.minerals[2].hue, 3: theme.minerals[3].hue,
  4: theme.minerals[4].hue, 5: theme.minerals[5].hue, 6: theme.minerals[6].hue,
  0: theme.special.glint.hue, 7: theme.special.core.hue,
  8: theme.special.resurrect.hue, 9: theme.special.quadriant.hue, 10: theme.special.zenith.hue,
};
