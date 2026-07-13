import { Component, ReactNode, Suspense, lazy, useEffect, useRef, useState } from "react";
import { liveScene } from "../demo/scene-model";
import type { SceneOverride } from "./settings";

// three.js + the whole R3F scene only load when this is actually rendered
const SceneCanvas = lazy(() => import("./AscentSceneCanvas"));

let _webgl: boolean | null = null;
function webglOK(): boolean {
  if (_webgl != null) return _webgl;
  try {
    const c = document.createElement("canvas");
    _webgl = !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    _webgl = false;
  }
  return _webgl;
}

/** The atmosphere/FX layer names (non-landmark elements). */
export const ATMOSPHERE_ELEMENTS = ["Nebula", "Stars", "Dust", "Comets", "Galaxy glow", "Gold Embers", "Stardust Rain", "Aurora Veil", "Solar Shafts", "Crimson Drift", "Emerald Abyss"];
export function ascentElements(): string[] {
  return [...liveScene().objects.map((o) => o.name), ...ATMOSPHERE_ELEMENTS];
}

/** If the WebGL scene throws for any reason, fall back to nothing (the CSS Backdrop shows instead). */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn("[AscentScene] disabled after error:", e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A black veil that deepens as the player scrolls DOWN into the undiscovered
 *  reaches of the map — the universe darkening below the frontier. */
function DepthVeil({ scrollRef }: { scrollRef?: React.RefObject<HTMLElement | null> }) {
  const veil = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = scrollRef?.current;
      if (veil.current && el && el.scrollHeight > el.clientHeight + 4) {
        const k = el.scrollTop / (el.scrollHeight - el.clientHeight);
        // ease in past halfway down, up to a 0.38 veil at the very bottom
        const u = Math.min(1, Math.max(0, (k - 0.45) / 0.55));
        veil.current.style.opacity = String(u * u * 0.38);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollRef]);
  return <div ref={veil} style={{ position: "absolute", inset: 0, background: "#000", opacity: 0, pointerEvents: "none" }} />;
}

export function AscentScene({
  scrollRef,
  off,
  config,
  contained,
  reduceMotion,
}: {
  scrollRef?: React.RefObject<HTMLElement | null>;
  off?: string[];
  config?: Record<string, SceneOverride>;
  contained?: boolean;
  reduceMotion?: boolean;
}) {
  const [shown, setShown] = useState(false);
  if (reduceMotion || !webglOK()) return null;
  const wrap: React.CSSProperties = contained
    ? { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }
    : { position: "fixed", inset: 0, pointerEvents: "none", zIndex: -1, overflow: "hidden" };
  return (
    <div style={{ ...wrap, opacity: shown ? 1 : 0, transition: "opacity 1200ms ease" }} aria-hidden="true">
      <Guard>
        <Suspense fallback={null}>
          {/* the fade starts on the first RENDERED frame (sky first — landmarks then
              fade in one by one as their models arrive, see GLBModel) */}
          <SceneCanvas scrollRef={scrollRef} off={off} config={config} onFirstFrame={() => setShown(true)} />
        </Suspense>
      </Guard>
      <DepthVeil scrollRef={scrollRef} />
    </div>
  );
}
