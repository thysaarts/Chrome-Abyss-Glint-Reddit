import { useRef } from "react";
import { SceneDef, SceneObject, ObjKind } from "../scene-model";

const KINDS: { kind: ObjKind; label: string; glyph: string }[] = [
  { kind: "planet", label: "Planet", glyph: "◍" },
  { kind: "asteroid", label: "Asteroid", glyph: "✦" },
  { kind: "crystal", label: "Crystal", glyph: "◆" },
  { kind: "station", label: "Station", glyph: "⌗" },
  { kind: "gate", label: "Gate", glyph: "◎" },
  { kind: "core", label: "Core", glyph: "❋" },
];

// ---- tiny controls ----
const col = { dim: "#8a86b8", faint: "#6f6b96", line: "#232640", panel: "rgba(13,15,26,0.92)", accent: "#c99cff" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "82px 1fr", alignItems: "center", gap: 8, margin: "7px 0" }}>
      <span style={{ font: "500 10.5px 'Saira'", color: col.dim }}>{label}</span>
      {children}
    </label>
  );
}
function Slider({ label, value, min, max, step = 0.01, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <Row label={label}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} style={{ flex: 1, accentColor: col.accent }} />
        <span style={{ font: "500 10px 'Share Tech Mono'", color: col.faint, minWidth: 34, textAlign: "right" }}>{value.toFixed(step < 1 ? 2 : 0)}</span>
      </span>
    </Row>
  );
}
function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 30, height: 22, border: "none", background: "none", padding: 0, borderRadius: 5 }} />
        <span style={{ font: "500 10px 'Share Tech Mono'", color: col.faint }}>{value}</span>
      </span>
    </Row>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{ padding: "5px 10px", borderRadius: 7, cursor: "pointer", font: "600 10px 'Saira'", border: `1px solid ${value ? "rgba(157,123,255,0.5)" : col.line}`, background: value ? "rgba(157,123,255,0.16)" : "transparent", color: value ? "#e2c8ff" : col.faint }}
    >
      {label}
    </button>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${col.line}`, padding: "12px 0 4px" }}>
      <div style={{ font: "600 9.5px 'Share Tech Mono'", letterSpacing: "0.22em", color: col.faint, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
const btn: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: `1px solid ${col.line}`, background: "rgba(255,255,255,0.03)", color: "#cdbcff", font: "600 10.5px 'Saira'", cursor: "pointer" };

export function Editor(props: {
  scene: SceneDef;
  selected: SceneObject | null;
  onAdd: (k: ObjKind) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<SceneObject>) => void;
  onSettings: (patch: Partial<SceneDef["settings"]>) => void;
  onName: (n: string) => void;
  onSave: () => void;
  onLoad: (f: File) => void;
  onReset: () => void;
}) {
  const { scene, selected } = props;
  const file = useRef<HTMLInputElement | null>(null);
  const s = scene.settings;
  const up = (patch: Partial<SceneObject>) => selected && props.onUpdate(selected.id, patch);
  const eff = (patch: Partial<SceneObject["effects"]>) => selected && props.onUpdate(selected.id, { effects: { ...selected.effects, ...patch } });

  return (
    <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 350, background: col.panel, borderLeft: `1px solid ${col.line}`, backdropFilter: "blur(14px)", overflowY: "auto", padding: "16px 16px 40px", zIndex: 4 }}>
      <input value={scene.name} onChange={(e) => props.onName(e.target.value)} style={{ width: "100%", background: "transparent", border: "none", color: "#e7e3ff", font: "700 17px 'Chakra Petch'", outline: "none", marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btn} onClick={props.onSave}>⭳ Save</button>
        <button style={btn} onClick={() => file.current?.click()}>⭱ Load</button>
        <button style={{ ...btn, marginLeft: "auto", color: col.faint }} onClick={props.onReset}>Reset</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && props.onLoad(e.target.files[0])} />
      </div>

      <Section title="ADD OBJECT">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
          {KINDS.map((k) => (
            <button key={k.kind} onClick={() => props.onAdd(k.kind)} style={{ ...btn, display: "flex", flexDirection: "column", gap: 3, alignItems: "center", padding: "9px 4px" }}>
              <span style={{ fontSize: 16, color: col.accent }}>{k.glyph}</span>
              <span style={{ fontSize: 9.5 }}>{k.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={`SCENE · ${scene.objects.length} OBJECTS`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 168, overflowY: "auto" }}>
          {scene.objects
            .map((o, i) => ({ o, i }))
            .sort((a, b) => b.o.t - a.o.t)
            .map(({ o }) => {
              const sel = selected?.id === o.id;
              return (
                <div key={o.id} onClick={() => props.onSelect(o.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, cursor: "pointer", border: `1px solid ${sel ? "rgba(157,123,255,0.5)" : "transparent"}`, background: sel ? "rgba(157,123,255,0.12)" : "rgba(255,255,255,0.02)" }}>
                  <span style={{ color: col.accent, fontSize: 12, width: 14 }}>{KINDS.find((k) => k.kind === o.kind)?.glyph}</span>
                  <span style={{ font: "500 11px 'Saira'", color: sel ? "#e7e3ff" : col.dim, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
                  <span style={{ font: "500 9px 'Share Tech Mono'", color: col.faint }}>{Math.round(o.t * 100)}</span>
                  <button onClick={(e) => { e.stopPropagation(); props.onRemove(o.id); }} style={{ background: "none", border: "none", color: col.faint, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
              );
            })}
        </div>
      </Section>

      {selected && (
        <Section title="SELECTED">
          <input value={selected.name} onChange={(e) => up({ name: e.target.value })} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${col.line}`, borderRadius: 7, color: "#e7e3ff", font: "600 12px 'Saira'", padding: "6px 9px", marginBottom: 6, outline: "none" }} />
          <Slider label="Height" value={selected.t} min={0} max={1} onChange={(v) => up({ t: v })} />
          <Slider label="Lateral" value={selected.lateral} min={-1} max={1} onChange={(v) => up({ lateral: v })} />
          <Slider label="Depth" value={selected.depth} min={-1} max={1} onChange={(v) => up({ depth: v })} />
          <Slider label="Scale" value={selected.scale} min={0.3} max={6} onChange={(v) => up({ scale: v })} />
          <Slider label="Spin" value={selected.spin} min={0} max={4} onChange={(v) => up({ spin: v })} />
          <Slider label="Bob" value={selected.bob} min={0} max={1.5} onChange={(v) => up({ bob: v })} />
          <Row label="Motion">
            <select
              value={selected.motion ?? ""}
              onChange={(e) => up({ motion: (e.target.value || undefined) as SceneObject["motion"] })}
              style={{ flex: 1, background: "#12101f", border: `1px solid ${col.line}`, borderRadius: 7, color: "#e7e3ff", font: "500 11px 'Saira'", padding: "5px 8px" }}
            >
              <option value="">static</option>
              <option value="driftUp">drift up (respawns)</option>
              <option value="hover">hover in place</option>
              <option value="flyby">fly-by (diagonal)</option>
              <option value="cruise">cruise (horizontal)</option>
            </select>
          </Row>
          {selected.motion === "driftUp" && (
            <Slider label="Speed" value={selected.motionSpeed ?? 1} min={0.2} max={4} onChange={(v) => up({ motionSpeed: v })} />
          )}
          <Color label="Color" value={selected.color} onChange={(v) => up({ color: v })} />
          <Color label="Emissive" value={selected.emissive} onChange={(v) => up({ emissive: v })} />
          <Slider label="Glow" value={selected.emissiveIntensity} min={0} max={4} onChange={(v) => up({ emissiveIntensity: v })} />
          <Slider label="Metalness" value={selected.metalness} min={0} max={1} onChange={(v) => up({ metalness: v })} />
          <Slider label="Roughness" value={selected.roughness} min={0} max={1} onChange={(v) => up({ roughness: v })} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <Toggle label="Light" value={selected.effects.light} onChange={(v) => eff({ light: v })} />
            <Toggle label="Halo" value={selected.effects.halo} onChange={(v) => eff({ halo: v })} />
            <Toggle label="Ring" value={selected.effects.ring} onChange={(v) => eff({ ring: v })} />
            <Toggle label="Dust" value={selected.effects.dust} onChange={(v) => eff({ dust: v })} />
          </div>
          {selected.effects.light && <Slider label="Light ✦" value={selected.effects.lightIntensity} min={0} max={5} onChange={(v) => eff({ lightIntensity: v })} />}
        </Section>
      )}

      <Section title="ATMOSPHERE">
        <Slider label="Path len" value={s.pathLength} min={40} max={240} step={1} onChange={(v) => props.onSettings({ pathLength: v })} />
        <Slider label="Nebula A" value={s.nebulaHueA} min={0} max={1} onChange={(v) => props.onSettings({ nebulaHueA: v })} />
        <Slider label="Nebula B" value={s.nebulaHueB} min={0} max={1} onChange={(v) => props.onSettings({ nebulaHueB: v })} />
        <Slider label="Nebula C" value={s.nebulaHueC} min={0} max={1} onChange={(v) => props.onSettings({ nebulaHueC: v })} />
        <Slider label="Nebula ✦" value={s.nebulaIntensity} min={0} max={1.5} onChange={(v) => props.onSettings({ nebulaIntensity: v })} />
        <Slider label="Filaments" value={s.nebulaFilaments} min={0} max={1} onChange={(v) => props.onSettings({ nebulaFilaments: v })} />
        <Color label="Fog" value={s.fogColor} onChange={(v) => props.onSettings({ fogColor: v })} />
        <Slider label="Fog dens" value={s.fogDensity} min={0} max={1.5} onChange={(v) => props.onSettings({ fogDensity: v })} />
        <Slider label="Stars" value={s.stars} min={0} max={16} step={0.5} onChange={(v) => props.onSettings({ stars: v })} />
      </Section>

      <Section title="SPACE FX">
        <Slider label="Hero ✦" value={s.heroStars} min={0} max={40} step={1} onChange={(v) => props.onSettings({ heroStars: v })} />
        <Slider label="Dust" value={s.dust} min={0} max={1} onChange={(v) => props.onSettings({ dust: v })} />
        <Slider label="Dust gold" value={s.dustWarm} min={0} max={1} onChange={(v) => props.onSettings({ dustWarm: v })} />
        <Slider label="Comets" value={s.comets} min={0} max={1} onChange={(v) => props.onSettings({ comets: v })} />
        <Slider label="Galaxy" value={s.galaxy} min={0} max={1} onChange={(v) => props.onSettings({ galaxy: v })} />
        <Slider label="Flicker" value={s.flicker} min={0} max={1} onChange={(v) => props.onSettings({ flicker: v })} />
        {/* shop-gated FX — these set the LOOK; ownership decides who sees them */}
        <Slider label="Embers" value={s.embers} min={0} max={1} onChange={(v) => props.onSettings({ embers: v })} />
        <Slider label="Star rain" value={s.rain} min={0} max={1} onChange={(v) => props.onSettings({ rain: v })} />
        <Slider label="Aurora" value={s.aurora} min={0} max={1} onChange={(v) => props.onSettings({ aurora: v })} />
        <Slider label="Shafts" value={s.shafts} min={0} max={1} onChange={(v) => props.onSettings({ shafts: v })} />
      </Section>

      <Section title="RENDER">
        <Slider label="Bloom" value={s.bloom} min={0} max={2.5} onChange={(v) => props.onSettings({ bloom: v })} />
        <Slider label="Exposure" value={s.exposure} min={0.3} max={2} onChange={(v) => props.onSettings({ exposure: v })} />
        <Slider label="Vignette" value={s.vignette} min={0} max={1.4} onChange={(v) => props.onSettings({ vignette: v })} />
        <Slider label="Grain" value={s.grain} min={0} max={0.8} onChange={(v) => props.onSettings({ grain: v })} />
        <div style={{ marginTop: 6 }}>
          <Toggle label="Depth of field" value={s.dof} onChange={(v) => props.onSettings({ dof: v })} />
        </div>
        <div style={{ marginTop: 8 }}>
          <Color label="Key light" value={s.keyLightColor} onChange={(v) => props.onSettings({ keyLightColor: v })} />
          <Slider label="Key ✦" value={s.keyLightIntensity} min={0} max={5} onChange={(v) => props.onSettings({ keyLightIntensity: v })} />
          <Slider label="Ambient" value={s.ambient} min={0} max={1.5} onChange={(v) => props.onSettings({ ambient: v })} />
        </div>
      </Section>
    </div>
  );
}
