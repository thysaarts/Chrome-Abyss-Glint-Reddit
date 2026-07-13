import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer, ContactShadows, useGLTF, Html, Grid } from "@react-three/drei";
import * as THREE from "three";

/** One entry from public/models3d/manifest.json (written by scripts/meshy-gen.mjs). */
interface ModelEntry {
  id: string;
  kind: string;
  method: "image" | "text";
  note?: string;
  glb: string; // e.g. "models3d/satellite-img/model.glb"
  thumb?: string | null;
}
interface Manifest {
  version: number;
  models: ModelEntry[];
}

const asset = (p: string) => "/" + p.replace(/^\//, "");

/** Load a GLB, recenter it on the origin and scale it to a consistent ~2.4u fit. */
function Model({ url, wireframe }: { url: string; wireframe: boolean }) {
  const { scene } = useGLTF(asset(url));
  const object = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = 2.4 / maxDim;
    root.position.sub(center); // recenter
    const wrap = new THREE.Group();
    wrap.add(root);
    wrap.scale.setScalar(s);
    return wrap;
  }, [scene]);

  useEffect(() => {
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const mm = m as THREE.MeshStandardMaterial;
          if ("wireframe" in mm) mm.wireframe = wireframe;
        });
      }
    });
  }, [object, wireframe]);

  return <primitive object={object} />;
}

function Loader() {
  return (
    <Html center>
      <div style={{ font: "500 12px 'Share Tech Mono'", color: "#8a86b8", whiteSpace: "nowrap" }}>loading model…</div>
    </Html>
  );
}

const col = { panel: "rgba(13,15,26,0.94)", line: "#232640", dim: "#8a86b8", faint: "#6f6b96", accent: "#c99cff" };

export function ModelGallery() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const reloadRef = useRef(0);

  const load = () => {
    fetch(asset("models3d/manifest.json") + `?v=${reloadRef.current++}`)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      })
      .then((m: Manifest) => {
        setManifest(m);
        setError(null);
        setSelId((cur) => cur ?? m.models[0]?.id ?? null);
      })
      .catch((e) => setError(String(e.message || e)));
  };
  useEffect(load, []);

  const models = manifest?.models ?? [];
  const selected = models.find((m) => m.id === selId) ?? null;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", background: "#05060d" }}>
      {/* ── left: model list ── */}
      <aside style={{ width: 268, flexShrink: 0, background: col.panel, borderRight: `1px solid ${col.line}`, overflowY: "auto", padding: "16px 14px 40px", zIndex: 3 }}>
        <div style={{ font: "700 16px 'Chakra Petch'", letterSpacing: "0.02em", marginBottom: 2 }}>MODEL GALLERY</div>
        <div style={{ font: "500 10px 'Share Tech Mono'", color: col.faint, marginBottom: 14 }}>
          {models.length} model{models.length === 1 ? "" : "s"} · meshy.ai
          <button onClick={load} style={{ marginLeft: 8, background: "none", border: `1px solid ${col.line}`, borderRadius: 6, color: col.dim, cursor: "pointer", font: "600 9px 'Saira'", padding: "2px 7px" }}>
            ⟳ refresh
          </button>
        </div>

        {error && <div style={{ font: "500 11px 'Saira'", color: "#ff8a8a", lineHeight: 1.5 }}>No manifest yet.<br />Run <code style={{ color: col.accent }}>node scripts/meshy-gen.mjs</code> then hit refresh.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {models.map((m) => {
            const sel = m.id === selId;
            return (
              <button
                key={m.id}
                onClick={() => setSelId(m.id)}
                style={{
                  display: "flex", gap: 10, alignItems: "center", textAlign: "left", cursor: "pointer",
                  padding: 7, borderRadius: 9,
                  border: `1px solid ${sel ? "rgba(157,123,255,0.55)" : col.line}`,
                  background: sel ? "rgba(157,123,255,0.13)" : "rgba(255,255,255,0.02)",
                }}
              >
                <span style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 7, overflow: "hidden", background: "#0c0e18", border: `1px solid ${col.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {m.thumb ? <img src={asset(m.thumb)} alt={m.id} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: col.faint, fontSize: 18 }}>◆</span>}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", font: "600 12px 'Saira'", color: sel ? "#e7e3ff" : col.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.id}</span>
                  <span style={{ display: "block", font: "500 9px 'Share Tech Mono'", color: col.faint, marginTop: 2 }}>{m.method} → {m.kind}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── center: 3D viewport ── */}
      <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <Canvas dpr={[1, 2]} shadows camera={{ fov: 42, position: [3.2, 1.4, 3.2] }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
          <color attach="background" args={["#070812"]} />
          <hemisphereLight args={["#cdd6ff", "#20122f", 0.5]} />
          <directionalLight position={[5, 6, 4]} intensity={1.6} color="#e9edff" castShadow />
          <directionalLight position={[-5, 2, -4]} intensity={0.7} color="#8a5cff" />
          <directionalLight position={[0, -3, -5]} intensity={0.5} color="#37c8ff" />

          <Environment resolution={256} background={false}>
            <Lightformer form="rect" intensity={3} color="#cdd6ff" position={[0, 6, 5]} scale={[10, 10, 1]} />
            <Lightformer form="rect" intensity={1.6} color="#7a55ff" position={[-7, 0, 2]} scale={[5, 12, 1]} rotation={[0, Math.PI / 2, 0]} />
            <Lightformer form="rect" intensity={1.4} color="#37c8ff" position={[7, -1, 2]} scale={[5, 12, 1]} rotation={[0, -Math.PI / 2, 0]} />
          </Environment>

          <Suspense fallback={<Loader />}>
            {selected && <Model key={selected.id} url={selected.glb} wireframe={wireframe} />}
          </Suspense>

          {showGrid && <Grid args={[20, 20]} cellSize={0.5} cellColor="#1b2340" sectionSize={2.5} sectionColor="#33305e" position={[0, -1.3, 0]} fadeDistance={22} infiniteGrid />}
          <ContactShadows position={[0, -1.28, 0]} opacity={0.5} scale={12} blur={2.4} far={4} color="#000010" />

          <OrbitControls autoRotate={autoRotate} autoRotateSpeed={1.1} enablePan enableDamping minDistance={1.6} maxDistance={12} target={[0, 0, 0]} />
        </Canvas>

        {/* top-right controls */}
        <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 7, zIndex: 4 }}>
          {[
            { l: "⟳ Spin", v: autoRotate, t: () => setAutoRotate((x) => !x) },
            { l: "⧉ Wire", v: wireframe, t: () => setWireframe((x) => !x) },
            { l: "▦ Grid", v: showGrid, t: () => setShowGrid((x) => !x) },
          ].map((b) => (
            <button key={b.l} onClick={b.t} style={{ padding: "6px 11px", borderRadius: 8, cursor: "pointer", font: "600 10px 'Saira'", border: `1px solid ${b.v ? "rgba(157,123,255,0.5)" : col.line}`, background: b.v ? "rgba(157,123,255,0.16)" : "rgba(13,15,26,0.8)", color: b.v ? "#e2c8ff" : col.faint, backdropFilter: "blur(8px)" }}>
              {b.l}
            </button>
          ))}
        </div>

        {/* bottom caption */}
        {selected && (
          <div style={{ position: "absolute", left: 18, bottom: 16, maxWidth: 460, zIndex: 4, pointerEvents: "none" }}>
            <div style={{ font: "700 15px 'Chakra Petch'", color: "#e7e3ff" }}>{selected.id}</div>
            {selected.note && <div style={{ font: "500 11px 'Saira'", color: col.dim, marginTop: 3, lineHeight: 1.5 }}>{selected.note}</div>}
            <div style={{ font: "500 9.5px 'Share Tech Mono'", color: col.faint, marginTop: 4 }}>drag to orbit · scroll to zoom</div>
          </div>
        )}
      </main>
    </div>
  );
}
