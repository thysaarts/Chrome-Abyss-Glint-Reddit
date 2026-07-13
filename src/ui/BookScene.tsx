import { Component, ReactNode, Suspense, lazy, useState } from "react";

// three.js + the R3F scene only load when the Sticker Book actually shows this
const SceneCanvas = lazy(() => import("./BookSceneCanvas"));

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

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn("[BookScene] disabled after error:", e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The Sticker Book's 3D background (see BookSceneCanvas). Mount contained inside
 * the book's window; `tintRef` carries the in-view sector's colour so the scene
 * settles into its tone family. Reduce Motion / no WebGL → renders nothing and
 * the classic backdrop below shows through.
 */
export function BookScene({
  scrollRef,
  tintRef,
  reduceMotion,
}: {
  scrollRef?: React.RefObject<HTMLElement | null>;
  tintRef: React.MutableRefObject<string>;
  reduceMotion?: boolean;
}) {
  const [shown, setShown] = useState(false);
  if (reduceMotion || !webglOK()) return null;
  return (
    <div
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden", opacity: shown ? 1 : 0, transition: "opacity 1400ms ease" }}
      aria-hidden="true"
    >
      <Guard>
        <Suspense fallback={null}>
          <SceneCanvas scrollRef={scrollRef} tintRef={tintRef} onFirstFrame={() => setShown(true)} />
        </Suspense>
      </Guard>
    </div>
  );
}
