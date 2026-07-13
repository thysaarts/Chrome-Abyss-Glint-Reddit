import { useEffect, useMemo, useRef } from "react";
import { decorItems, decorOwned, capDecor } from "../game/collection";
import type { DecorItem } from "../game/collection";
import type { DecorOverride } from "./settings";

/**
 * ASCENT DECOR — the layers a player has bought in the Shop and switched on in
 * Settings, rendered behind the level map. Each `effect` maps to a lightweight
 * CSS layer; `customProp` / `customPattern` render the CMS-supplied image.
 * Purely decorative (pointer-events: none); animations freeze under reduce-motion.
 */
export function AscentDecor({ keys, scrollRef, config }: { keys: string[]; scrollRef?: React.RefObject<HTMLElement | null>; config?: Record<string, DecorOverride> }) {
  const items = decorItems();
  const active = capDecor(
    keys
      .map((k) => items.find((i) => i.key === k))
      .filter((d): d is DecorItem => !!d && decorOwned(d))
      // apply the player's Settings › Decor overrides on top of the CMS defaults
      .map((d) => {
        const o = config?.[d.key];
        if (!o) return d;
        const m: DecorItem = { ...d };
        if (o.option != null) m.option = o.option;
        if (o.depth != null) m.depth = o.depth;
        if (typeof o.x === "number") m.x = o.x;
        if (o.color != null) m.color = o.color;
        return m;
      })
  );
  if (!active.length) return null;
  return (
    <div className="gl-decor" style={layer} aria-hidden>
      {active.map((d) => (
        <Effect key={d.key} d={d} scrollRef={scrollRef} />
      ))}
    </div>
  );
}

/* --------------------------- prop placement & parallax --------------------------- */

// parallax factors per depth plane: far drifts slowest, near follows the scroll most
const DEPTH_F: Record<string, number> = { far: 0.12, mid: 0.26, near: 0.45 };

// deterministic scatter for props without a CMS position — no two keys land together
function hashPos(key: string): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return { x: 10 + ((h >>> 8) % 1000) / 1000 * 74, y: 8 + ((h >>> 18) % 1000) / 1000 * 72 };
}

/** The positioned slot every single-object prop lives in: anchored at the item's
 *  X/Y (CMS percent, or a per-key scatter), drifting against the Ascent scroll by
 *  its depth's parallax factor, and WRAPPING — a prop that leaves the top fully
 *  re-enters from below, so a long scroll never empties the sky. Placement is
 *  direct-DOM on the scroll event: no React re-renders while scrolling. */
function PropSlot({ d, size, scrollRef, children }: { d: DecorItem; size: number; scrollRef?: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const seed = hashPos(d.key);
  const x = typeof d.x === "number" ? d.x : seed.x;
  const y = typeof d.y === "number" ? d.y : seed.y;
  useEffect(() => {
    const node = ref.current;
    const host = node?.parentElement;
    if (!node || !host) return;
    const f = DEPTH_F[d.depth ?? "mid"] ?? DEPTH_F.mid;
    const el = scrollRef?.current ?? null;
    const place = () => {
      const H = host.clientHeight || 1;
      const R = H + size * 2; // the wrap range: fully exit the top before re-entering below
      const base = (y / 100) * H;
      const yy = ((((base - (el?.scrollTop ?? 0) * f) + size) % R) + R) % R - size;
      node.style.transform = `translate3d(0, ${yy}px, 0)`;
    };
    place();
    el?.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      el?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [d.depth, y, size, scrollRef]);
  return (
    <div ref={ref} style={{ position: "absolute", left: `${x}%`, top: 0, width: size, height: size, marginLeft: -size / 2 }}>
      {children}
    </div>
  );
}

// the item's tint as rgba (falls back to the standard violet)
function tint(d: DecorItem, a: number): string {
  const hex = /^#[0-9a-fA-F]{6}$/.test(d.color ?? "") ? (d.color as string) : "#9d7bff";
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A 3D prop: a CMS-uploaded .glb rendered on a small transparent canvas in the
 *  prop slot, with an idle animation (spin / bob / both / none). three.js loads
 *  lazily as its own chunk, and ONLY when a 3D prop is actually active — the
 *  main bundle carries none of it. Falls back to nothing on load failure (the
 *  map simply shows without the prop). */
function Prop3D({ d, px }: { d: DecorItem; px: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let dead = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      const [three, loaderMod, envMod] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
      ]);
      if (dead || !hostRef.current) return;
      const renderer = new three.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(px, px);
      // filmic tone mapping — PBR highlights roll off instead of clipping
      renderer.toneMapping = three.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.domElement.style.display = "block";
      hostRef.current.appendChild(renderer.domElement);
      const scene = new three.Scene();
      // image-based lighting: a soft studio environment so metal/rough surfaces
      // pick up real reflections instead of reading flat. Kept subtle; the
      // directional key + violet rim below still shape the form.
      const pmrem = new three.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new envMod.RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.55;
      pmrem.dispose();
      const cam = new three.PerspectiveCamera(32, 1, 0.01, 100);
      cam.position.set(0, 0.55, 3.1);
      cam.lookAt(0, 0, 0);
      scene.add(new three.AmbientLight(0xffffff, 0.4)); // reduced — the env map carries the fill now
      const key = new three.DirectionalLight(0xffffff, 1.5);
      key.position.set(2.2, 3, 2.4);
      scene.add(key);
      const rim = new three.DirectionalLight(0x9d7bff, 0.8); // the game's violet rim light
      rim.position.set(-2.5, 1, -2);
      scene.add(rim);
      const gltf = await new loaderMod.GLTFLoader().loadAsync(d.model!);
      if (dead) { renderer.dispose(); renderer.domElement.remove(); return; }
      const obj = gltf.scene;
      // normalise: centre the model and scale its bounding sphere to frame size
      const box = new three.Box3().setFromObject(obj);
      const centre = box.getCenter(new three.Vector3());
      const span = box.getSize(new three.Vector3()).length() || 1;
      const pivot = new three.Group();
      obj.position.sub(centre);
      pivot.add(obj);
      pivot.scale.multiplyScalar(2.1 / span);
      scene.add(pivot);
      const anim = d.anim ?? "spin";
      const still = anim === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let raf = 0;
      const t0 = performance.now();
      const frame = (t: number) => {
        const s = (t - t0) / 1000;
        if (anim === "spin" || anim === "spin-bob") pivot.rotation.y = s * 0.55;
        if (anim === "bob" || anim === "spin-bob") pivot.position.y = Math.sin(s * 1.5) * 0.09;
        renderer.render(scene, cam);
        if (!still) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        cancelAnimationFrame(raf);
        envRT.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => { /* bad URL / unsupported file — render no prop */ });
    return () => {
      dead = true;
      cleanup?.();
    };
  }, [d.model, d.anim, px]);
  return <div ref={hostRef} style={{ width: "100%", height: "100%", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.5))" }} />;
}

/** A whole GROUP of elements on one parallax plane: the band translates against
 *  the Ascent scroll by its factor and carries a duplicate of itself one screen
 *  below, so the plane wraps seamlessly — depth for particles and rock fields,
 *  not just the single-object props. Direct-DOM on scroll; no re-renders. */
function ParallaxBand({ factor, scrollRef, children }: { factor: number; scrollRef?: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    const host = node?.parentElement;
    if (!node || !host) return;
    const el = scrollRef?.current ?? null;
    const place = () => {
      const H = host.clientHeight || 1;
      const off = ((el?.scrollTop ?? 0) * factor) % H;
      node.style.transform = `translate3d(0, ${-off}px, 0)`;
    };
    place();
    el?.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      el?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [factor, scrollRef]);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", inset: 0 }}>{children}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: "100%", height: "100%" }}>{children}</div>
    </div>
  );
}

/** Fly animations: the prop crosses / wanders the WHOLE decor layer, so it gets
 *  a full-layer transparent canvas instead of a positioned slot. The model is
 *  turned to face its direction of travel using the item's FRONT axis. fly-x /
 *  fly-y are repeating fly-bys (fresh lane + a beat offscreen between passes);
 *  fly-around is a smooth pseudo-random wander centred on the item's X/Y. */
const FLY_ANIMS = new Set(["fly-x", "fly-y", "fly-around"]);
const FRONT_VEC: Record<string, [number, number, number]> = {
  "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1],
};

function FlyProp3D({ d, px }: { d: DecorItem; px: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let dead = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      const [three, loaderMod, envMod] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
      ]);
      if (dead || !hostRef.current) return;
      const host = hostRef.current;
      const renderer = new three.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.toneMapping = three.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.domElement.style.display = "block";
      host.appendChild(renderer.domElement);
      const scene = new three.Scene();
      const pmrem = new three.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new envMod.RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.55;
      pmrem.dispose();
      const cam = new three.PerspectiveCamera(32, 1, 0.01, 100);
      cam.position.set(0, 0, 3.1);
      cam.lookAt(0, 0, 0);
      scene.add(new three.AmbientLight(0xffffff, 0.4));
      const key = new three.DirectionalLight(0xffffff, 1.5);
      key.position.set(2.2, 3, 2.4);
      scene.add(key);
      const rim = new three.DirectionalLight(0x9d7bff, 0.8);
      rim.position.set(-2.5, 1, -2);
      scene.add(rim);
      // the world-space window: V world-units tall, V·aspect wide
      const V = 2 * 3.1 * Math.tan((32 / 2) * (Math.PI / 180));
      let W = V;
      const fit = () => {
        const w = host.clientWidth || 1, h = host.clientHeight || 1;
        renderer.setSize(w, h);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        W = V * cam.aspect;
      };
      fit();
      const gltf = await new loaderMod.GLTFLoader().loadAsync(d.model!);
      if (dead) { renderer.dispose(); renderer.domElement.remove(); return; }
      const obj = gltf.scene;
      const box = new three.Box3().setFromObject(obj);
      const centre = box.getCenter(new three.Vector3());
      const span = box.getSize(new three.Vector3()).length() || 1;
      obj.position.sub(centre);
      const pivot = new three.Group();
      pivot.add(obj);
      // world size ≈ the prop's slot size as a share of the layer height
      const worldSize = () => V * (px / Math.max(1, host.clientHeight)) * 1.4;
      const applyScale = () => pivot.scale.setScalar(worldSize() / span);
      applyScale();
      scene.add(pivot);
      const front = new three.Vector3(...(FRONT_VEC[d.front ?? "+z"] ?? FRONT_VEC["+z"]));
      const q = new three.Quaternion();
      const dir = new three.Vector3();
      const seed = Math.random() * 100;
      // anchor from the item's X/Y (the wander centre / preferred lane)
      const ax = () => (((d.x ?? 50) / 100) - 0.5) * W;
      const ay = () => (0.5 - ((d.y ?? 25) / 100)) * V;
      const anim = d.anim!;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // fly-by state: one pass = cross the window with margins, then a new lane
      let pass = { dir: 1, lane: 0, t0: 0, dur: 14 + Math.random() * 6, gap: 1.5 + Math.random() * 2.5 };
      const newPass = (now: number) => {
        pass = {
          dir: Math.random() < 0.5 ? -1 : 1,
          lane: (Math.random() - 0.5) * (anim === "fly-x" ? V * 0.55 : W * 0.55) + (anim === "fly-x" ? ay() * 0.5 : ax() * 0.5),
          t0: now,
          dur: 14 + Math.random() * 6,
          gap: 1.5 + Math.random() * 2.5,
        };
      };
      let raf = 0;
      const t0 = performance.now();
      const frame = (tms: number) => {
        const t = (tms - t0) / 1000;
        if (still) {
          pivot.position.set(ax(), ay(), 0);
          renderer.render(scene, cam);
          return; // one static frame
        }
        const margin = worldSize() * 1.4;
        if (anim === "fly-around") {
          // a smooth Lissajous wander around the anchor; face the velocity
          const rx = W * 0.34, ry = V * 0.3;
          const x = ax() + rx * (0.62 * Math.sin(t * 0.23 + seed) + 0.38 * Math.sin(t * 0.084 + seed * 2));
          const y = ay() + ry * (0.62 * Math.sin(t * 0.17 + seed * 3) + 0.38 * Math.sin(t * 0.061 + seed * 4));
          dir.set(x - pivot.position.x, y - pivot.position.y, 0);
          if (dir.lengthSq() > 1e-8) {
            q.setFromUnitVectors(front, dir.clone().normalize());
            pivot.quaternion.slerp(q, 0.06);
          }
          pivot.position.set(x, y, 0);
        } else {
          const along = anim === "fly-x" ? W : V;
          const p = (t - pass.t0) / pass.dur;
          if (p >= 1) {
            if (t - pass.t0 > pass.dur + pass.gap) newPass(t);
            pivot.visible = false;
          } else {
            pivot.visible = true;
            const s = -along / 2 - margin + p * (along + margin * 2);
            const run = pass.dir === 1 ? s : -s;
            const wob = Math.sin(t * 1.1 + seed) * 0.06;
            if (anim === "fly-x") pivot.position.set(run, pass.lane + wob, 0);
            else pivot.position.set(pass.lane + wob, run, 0);
            dir.set(anim === "fly-x" ? pass.dir : 0, anim === "fly-y" ? pass.dir : 0, 0);
            q.setFromUnitVectors(front, dir);
            pivot.quaternion.slerp(q, 0.14);
            // a light bank into the travel, so the pass reads as flight
            pivot.rotateOnAxis(front, Math.sin(t * 0.9 + seed) * 0.05);
          }
        }
        renderer.render(scene, cam);
        raf = requestAnimationFrame(frame);
      };
      const onResize = () => { fit(); applyScale(); };
      window.addEventListener("resize", onResize);
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        envRT.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => { /* bad URL / unsupported file — render no prop */ });
    return () => {
      dead = true;
      cleanup?.();
    };
  }, [d.model, d.anim, d.front, d.x, d.y, px]);
  return <div ref={hostRef} style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.5))" }} />;
}

function Effect({ d, scrollRef }: { d: DecorItem; scrollRef?: React.RefObject<HTMLElement | null> }) {
  // the EFFECT decides what renders. Custom art only applies through the custom*
  // effects (a lingering placeholder image can no longer hijack a built-in — that
  // was silently turning stardust/light items into an invisible stacked img).
  const eff = d.effect;
  const opt = d.option ?? "medium";
  // density (particles) / intensity (lights) / size (props, pattern tiles)
  const dens = opt === "high" ? 1.6 : opt === "low" ? 0.5 : 1;
  const inten = opt === "high" ? 1.35 : opt === "low" ? 0.6 : 1;
  const sizeF = opt === "big" ? 1.35 : opt === "small" ? 0.65 : 1;

  const stars = useMemo(
    () => Array.from({ length: Math.round(60 * dens) }, () => ({ l: Math.random() * 100, t: Math.random() * 100, s: 1 + Math.random() * 1.8, d: -Math.random() * 3 })),
    [dens]
  );
  const embers = useMemo(
    () => Array.from({ length: Math.round(14 * dens) }, () => ({ l: Math.random() * 100, dur: 4 + Math.random() * 4, d: -Math.random() * 6 })),
    [dens]
  );
  const rocks = useMemo(
    () => [[12, 26], [82, 18], [70, 58], [20, 72], [88, 40], [40, 12]].map(([l, t], i) => ({ l, t, d: -i * 1.6, sc: 0.7 + Math.random() * 0.7 })),
    []
  );

  // SINGLE-OBJECT props live in a positioned, parallax-wrapped slot: the 3D
  // model wins, then the customProp image; built-in prop effects (horizonPlanet,
  // probe, asteroids…) fall through to the switch and place themselves.
  const px = Math.round(120 * sizeF);
  if (d.model && d.kind === "prop") {
    // fly animations own the whole layer; the rest live in a parallax slot
    if (FLY_ANIMS.has(d.anim ?? "")) return <FlyProp3D d={d} px={px} />;
    return (
      <PropSlot d={d} size={px} scrollRef={scrollRef}>
        <Prop3D d={d} px={px} />
      </PropSlot>
    );
  }
  if (eff === "customProp") {
    if (!d.image) return null;
    return (
      <PropSlot d={d} size={px} scrollRef={scrollRef}>
        <img src={d.image} alt="" className="gl-dec-float" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.5))" }} />
      </PropSlot>
    );
  }

  switch (eff) {
    case "stardust":
      // three depth planes: far stars are smaller, dimmer and barely drift with
      // the scroll; near ones are bold and track it — the dust field has depth
      return (
        <>
          {[
            { f: 0.08, scale: 0.65, op: 0.55 },
            { f: 0.22, scale: 1, op: 0.8 },
            { f: 0.4, scale: 1.5, op: 1 },
          ].map((band, bi) => (
            <ParallaxBand key={bi} factor={band.f} scrollRef={scrollRef}>
              {stars.filter((_, i) => i % 3 === bi).map((s, i) => (
                <span key={i} className="gl-dec-tw" style={{ position: "absolute", left: `${s.l}%`, top: `${s.t}%`, width: s.s * band.scale, height: s.s * band.scale, borderRadius: "50%", background: tint(d, band.op), animationDelay: `${s.d}s` }} />
              ))}
            </ParallaxBand>
          ))}
        </>
      );
    case "embers":
      return (
        <ParallaxBand factor={0.2} scrollRef={scrollRef}>
          {embers.map((e, i) => (
            <span key={i} className="gl-dec-rise" style={{ position: "absolute", left: `${e.l}%`, bottom: 0, width: 3, height: 3, borderRadius: "50%", background: tint(d, 0.9), boxShadow: `0 0 6px ${tint(d, 0.8)}`, animationDuration: `${e.dur}s`, animationDelay: `${e.d}s` }} />
          ))}
        </ParallaxBand>
      );
    case "comets":
      return (
        <>
          {[0, 1, 2].map((i) => (
            <span key={i} className="gl-dec-cross" style={{ position: "absolute", top: `${12 + i * 22}%`, left: 0, width: 5, height: 5, borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px #fff, -16px 0 12px -4px rgba(127,233,245,0.9)", animationDuration: `${8 + i * 3}s`, animationDelay: `${-i * 2.5}s` }} />
          ))}
        </>
      );
    case "aurora":
      return <span className="gl-dec-auro" style={{ position: "absolute", left: "-10%", right: "-10%", top: "10%", height: "34%", background: `linear-gradient(90deg,transparent,rgba(80,230,200,${0.22 * inten}),${tint(d, 0.28 * inten)},transparent)`, filter: "blur(24px)" }} />;
    case "nebulaPulse":
      return <span className="gl-dec-pulse" style={{ position: "absolute", left: "50%", top: "34%", width: 320, height: 320, margin: "-160px 0 0 -160px", borderRadius: "50%", background: `radial-gradient(circle,${tint(d, 0.4 * inten)},transparent 70%)` }} />;
    case "grid":
      return <span style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${tint(d, 0.35)} 1px, transparent 1px)`, backgroundSize: `${Math.round(26 * sizeF)}px ${Math.round(26 * sizeF)}px`, opacity: 0.35, WebkitMaskImage: "linear-gradient(180deg,transparent,#000 28%,#000 72%,transparent)", maskImage: "linear-gradient(180deg,transparent,#000 28%,#000 72%,transparent)" }} />;
    case "orbitalRing":
      return (
        <span style={{ position: "absolute", left: "50%", top: "42%", width: Math.round(300 * sizeF), height: Math.round(300 * sizeF), margin: `-${Math.round(150 * sizeF)}px 0 0 -${Math.round(150 * sizeF)}px`, border: `2px solid ${tint(d, 0.32)}`, borderRadius: "50%", boxShadow: "0 0 30px rgba(157,123,255,0.22) inset" }} />
      );
    case "horizonPlanet":
      return (
        <span style={{ position: "absolute", bottom: -110, left: "50%", transform: "translateX(-50%)", width: Math.round(320 * sizeF), height: Math.round(320 * sizeF), borderRadius: "50%", background: "radial-gradient(circle at 38% 32%, #6a5cff, #1c1440 72%)", boxShadow: "0 0 90px -22px rgba(106,92,255,0.6)" }}>
          <span style={{ position: "absolute", left: "-14%", top: "36%", width: "128%", height: "26%", borderRadius: "50%", border: "5px solid rgba(180,150,255,0.28)", transform: "rotate(-10deg)" }} />
        </span>
      );
    case "asteroids":
      // the rock field drifts on two planes — small far rocks, bolder near ones
      return (
        <>
          {[
            { f: 0.14, scale: 0.7 },
            { f: 0.36, scale: 1.15 },
          ].map((band, bi) => (
            <ParallaxBand key={bi} factor={band.f} scrollRef={scrollRef}>
              {rocks.filter((_, i) => i % 2 === bi).map((r, i) => (
                <span key={i} className="gl-dec-float" style={{ position: "absolute", left: `${r.l}%`, top: `${r.t}%`, width: 22, height: 18, borderRadius: "45% 55% 50% 60%", background: "linear-gradient(180deg,#6b6478,#2c2836)", boxShadow: "inset 2px 2px 3px rgba(255,255,255,0.15)", transform: `scale(${r.sc * band.scale})`, animationDelay: `${r.d}s` }} />
              ))}
            </ParallaxBand>
          ))}
        </>
      );
    case "probe":
      return (
        <span className="gl-dec-cross" style={{ position: "absolute", top: "22%", left: 0, animationDuration: "16s" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#cfe6ff" style={{ filter: "drop-shadow(0 0 6px rgba(127,233,245,0.7))" }}>
            <rect x="9" y="9" width="6" height="6" rx="1" />
            <rect x="1" y="10" width="6" height="4" />
            <rect x="17" y="10" width="6" height="4" />
            <path d="M12 9V4" stroke="#cfe6ff" strokeWidth="1.4" fill="none" />
          </svg>
        </span>
      );
    case "customPattern":
      if (!d.image) return null;
      return <span style={{ position: "absolute", inset: 0, backgroundImage: `url(${d.image})`, backgroundSize: `${Math.round(180 * sizeF)}px`, opacity: 0.4, WebkitMaskImage: "linear-gradient(180deg,transparent,#000 28%,#000 72%,transparent)", maskImage: "linear-gradient(180deg,transparent,#000 28%,#000 72%,transparent)" }} />;
    default:
      return null;
  }
}

const layer: React.CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 };
