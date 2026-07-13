import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { SceneDef, SceneObject, ObjKind, makeObject, defaultScene, migrateScene, SCENE_BUILD } from "./scene-model";
import { JourneyScene } from "./scene/JourneyScene";
import { Editor } from "./editor/Editor";

const STORE = "glint.demo.scene.v2"; // bumped: curated scene with real models + procedural planets

function load(): SceneDef {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const parsed = JSON.parse(raw) as SceneDef;
      // discard any stale/poisoned copy from an older curated build
      if (parsed && parsed.build === SCENE_BUILD) return migrateScene(parsed);
    }
  } catch {
    /* fall through to default */
  }
  return defaultScene();
}

export function DemoApp({
  value,
  onChange,
  embedded,
}: {
  /** CONTROLLED mode (the CMS): the scene lives in the caller's state (the content
   *  draft) — edits go through onChange and nothing touches localStorage. Without
   *  these, the standalone demo.html keeps its own localStorage scratchpad. */
  value?: SceneDef;
  onChange?: (s: SceneDef) => void;
  /** fill the parent box instead of the viewport (for the CMS tab) */
  embedded?: boolean;
} = {}) {
  const controlled = !!(value && onChange);
  const [localScene, setLocalScene] = useState<SceneDef>(load);
  const scene = controlled ? migrateScene(value) : localScene;
  const setScene = (updater: SceneDef | ((s: SceneDef) => SceneDef)) => {
    const next = typeof updater === "function" ? updater(scene) : updater;
    if (controlled) onChange!(next);
    else setLocalScene(next);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(true);
  const progress = useRef(0.02); // 0..1 up the column, read by the camera rig (no re-render)
  const railFill = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y: number; p: number } | null>(null);

  // persist on every change (standalone scratchpad only — the CMS owns its draft)
  useEffect(() => {
    if (controlled) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(localScene));
    } catch {
      /* storage unavailable */
    }
  }, [localScene, controlled]);

  // animate the left progress rail from the ref (no React churn while scrubbing)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (railFill.current) railFill.current.style.height = `${progress.current * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scrub = (dp: number) => {
    progress.current = Math.max(0, Math.min(1, progress.current + dp));
  };
  const onWheel = (e: React.WheelEvent) => scrub(e.deltaY * 0.0006);
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, p: progress.current };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = drag.current;
    progress.current = Math.max(0, Math.min(1, d.p - (e.clientY - d.y) * 0.0016));
  };
  const onPointerUp = () => (drag.current = null);

  // ---- scene mutations ---- (plain closures: setScene must see THIS render's
  // scene/onChange, so no useCallback memoisation here)
  const updateSettings = (patch: Partial<SceneDef["settings"]>) => setScene((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const updateObject = (id: string, patch: Partial<SceneObject>) => setScene((s) => ({ ...s, objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const addObject = (kind: ObjKind) => {
    const o = makeObject(kind, progress.current);
    setScene((s) => ({ ...s, objects: [...s.objects, o] }));
    setSelectedId(o.id);
  };
  const removeObject = (id: string) => {
    setScene((s) => ({ ...s, objects: s.objects.filter((o) => o.id !== id) }));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scene.name.replace(/\s+/g, "-").toLowerCase() || "scene"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const upload = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        setScene(migrateScene(JSON.parse(String(r.result)) as SceneDef));
        setSelectedId(null);
      } catch {
        alert("Not a valid scene file.");
      }
    };
    r.readAsText(file);
  };
  const reset = () => {
    setScene(defaultScene());
    setSelectedId(null);
  };

  const selected = scene.objects.find((o) => o.id === selectedId) ?? null;

  return (
    <div style={embedded ? { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#05060d", borderRadius: 12 } : { position: "fixed", inset: 0, background: "#05060d" }}>
      <div
        style={{ position: "absolute", inset: 0, touchAction: "none", cursor: drag.current ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping, alpha: false }}
          camera={{ fov: 50, near: 0.1, far: 600, position: [0, 0, 17] }}
        >
          <JourneyScene scene={scene} progress={progress} selectedId={selectedId} onSelect={setSelectedId} />
        </Canvas>
      </div>

      {/* journey progress rail */}
      <div style={{ position: "absolute", left: 14, top: "18%", bottom: "18%", width: 4, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden", pointerEvents: "none" }}>
        <div ref={railFill} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2%", background: "linear-gradient(180deg,#c99cff,#37c8ff)", borderRadius: 4 }} />
      </div>

      {/* title */}
      <div style={{ position: "absolute", left: 34, top: 20, pointerEvents: "none", userSelect: "none" }}>
        <div style={{ font: "600 10px/1 'Share Tech Mono', monospace", letterSpacing: "0.34em", color: "#8a86b8" }}>GLINT · 3D STUDIO</div>
        <div style={{ font: "700 26px/1.05 'Chakra Petch', sans-serif", marginTop: 5, background: "linear-gradient(90deg,#e2c8ff,#7fd0ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{scene.name}</div>
        <div style={{ font: "400 11px 'Saira', sans-serif", color: "#6f6b96", marginTop: 4 }}>scroll / drag to travel the ascent</div>
      </div>

      <button
        onClick={() => setShowEditor((v) => !v)}
        style={{ position: "absolute", right: showEditor ? 350 : 16, top: 16, zIndex: 5, transition: "right .2s", padding: "8px 12px", borderRadius: 9, border: "1px solid #2c2f4a", background: "rgba(16,18,30,0.85)", color: "#cdbcff", font: "600 11px 'Saira'", cursor: "pointer", backdropFilter: "blur(8px)" }}
      >
        {showEditor ? "Hide ›" : "‹ Editor"}
      </button>

      {showEditor && (
        <Editor
          scene={scene}
          selected={selected}
          onAdd={addObject}
          onRemove={removeObject}
          onSelect={setSelectedId}
          onUpdate={updateObject}
          onSettings={updateSettings}
          onName={(name) => setScene((s) => ({ ...s, name }))}
          onSave={download}
          onLoad={upload}
          onReset={reset}
        />
      )}
    </div>
  );
}
