import { useState, useRef, useEffect } from "react";
import { theme } from "../theme/theme";
import { REGIONS } from "../theme/regions";
import { ThemePreview } from "./ThemePreview";
import { RegionBackdrop } from "./RegionBackdrop";
import { Backdrop } from "./Backdrop";
import { sfx } from "../audio/sfx";
import { music } from "../audio/music";
import { loadSettings, saveSettings } from "./settings";
import type { ThemeItem, MusicItem, DecorItem } from "../game/collection";

/**
 * Shared item-detail modal used by both the Shop and Collection › Customise.
 * The shell renders type / title / art / description / an optional status banner
 * and an actions row supplied by the caller (Buy in the Shop, Equip/Unequip in
 * the Collection). The art bodies (theme mock-up, music preview player, decor
 * render) live here so both surfaces stay identical.
 */

const KIND_LABEL: Record<string, string> = { prop: "Landmark", particle: "Particle", light: "Light", pattern: "Sky" };
export const decorTypeLabel = (d: DecorItem) => KIND_LABEL[d.kind] ?? "Ascent Decor";

export function DetailShell({
  typeLabel,
  title,
  desc,
  banner,
  actions,
  onClose,
  children,
}: {
  typeLabel: string;
  title: string;
  desc?: string;
  banner?: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalType}>{typeLabel}</div>
        <div style={modalTitle}>{title}</div>
        {children}
        {desc && <p style={modalDesc}>{desc}</p>}
        {banner}
        <div style={modalActions}>{actions}</div>
      </div>
    </div>
  );
}

/** Big art + a live mock-up of the theme's colours, chrome and buttons. */
export function ThemeMockup({ item }: { item: ThemeItem }) {
  const rt = item.region ? REGIONS[item.region] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* header art — shorter than the mock-up so the shop's lore text + Buy row
          still fit on screen without the pop-up running off the bottom */}
      {item.image && <img src={item.image} alt="" style={{ ...bigArt, height: 150, objectFit: "cover" }} />}
      {/* the live mock-up: the theme's ACTUAL in-game background (animated) with the
          board chrome / buttons on top, scaled up to fill the box. */}
      <div>
        <div style={mockLabel}>In action</div>
        <div style={{ position: "relative", height: 200, borderRadius: 12, overflow: "hidden", border: `1px solid ${theme.color.border}` }}>
          {rt ? <RegionBackdrop region={rt} contained /> : <Backdrop contained />}
          <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "grid", placeItems: "center" }}>
            <ThemePreview region={rt} transparent fill hexScale={1.5} chromeScale={2} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Big cover + a play/pause preview player (restores prior track on close). */
export function MusicPreview({ item }: { item: MusicItem }) {
  const [playing, setPlaying] = useState(false);
  const prevRef = useRef(music.current());

  useEffect(() => () => {
    const p = prevRef.current;
    if (p) music.play(p); else music.stop();
  }, []);

  const toggle = () => {
    sfx.click();
    if (playing) {
      const p = prevRef.current;
      if (p) music.play(p); else music.stop();
      setPlaying(false);
    } else {
      music.play(item.theme);
      setPlaying(true);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {item.image ? (
        <img src={item.image} alt="" style={{ ...bigArt, aspectRatio: "1 / 1", objectFit: "cover" }} />
      ) : (
        <div style={{ ...bigArt, aspectRatio: "1 / 1", display: "grid", placeItems: "center", background: "radial-gradient(circle at 40% 30%, rgba(157,123,255,0.28), rgba(157,123,255,0.05))" }}><NoteIcon big /></div>
      )}
      <div style={playerBar}>
        <button style={playBtn} onClick={toggle} aria-label={playing ? "Pause preview" : "Play preview"}>
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill={theme.color.text}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill={theme.color.text}><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, color: theme.color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{playing ? "Playing preview…" : "Preview track"}</div>
          <div style={{ fontFamily: theme.fonts.sans, fontSize: 10.5, color: theme.color.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sub}</div>
        </div>
        {playing && <Equalizer active />}
        <MusicVolume />
      </div>
    </div>
  );
}

/** A speaker button that opens a vertical music-volume slider. The icon shows a
 *  muted look when the MUSIC volume is at zero (you'd hear nothing on preview) —
 *  it isn't a mute toggle, it just changes the music-volume setting. */
function MusicVolume() {
  const [vol, setVol] = useState(() => loadSettings().musicVolume);
  const [open, setOpen] = useState(false);

  const change = (v: number) => {
    setVol(v);
    music.setVolume(v);
    saveSettings({ ...loadSettings(), musicVolume: v });
  };

  return (
    <div style={{ position: "relative", flex: "0 0 auto" }}>
      <button style={volBtn} onClick={() => { sfx.click(); setOpen((o) => !o); }} aria-label="Music volume">
        <SpeakerIcon muted={vol <= 0.001} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 1 }} onClick={() => setOpen(false)} />
          <div style={volPopover}>
            <span style={{ fontFamily: theme.fonts.mono, fontSize: 8.5, color: theme.color.faint }}>{Math.round(vol * 100)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol}
              onChange={(e) => change(parseFloat(e.target.value))}
              aria-label="Music volume"
              style={{ writingMode: "vertical-lr" as React.CSSProperties["writingMode"], direction: "rtl", width: 22, height: 96, accentColor: theme.color.accent, cursor: "pointer" }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SpeakerIcon({ muted }: { muted?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={muted ? theme.color.faint : theme.color.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill={muted ? theme.color.faint : theme.color.text} stroke="none" />
      {muted ? (
        <path d="M17 9l5 6M22 9l-5 6" />
      ) : (
        <>
          <path d="M16 8a5 5 0 0 1 0 8" />
          <path d="M19 5a9 9 0 0 1 0 14" />
        </>
      )}
    </svg>
  );
}

/** Big decor render — the custom art/3D thumbnail, or a scaled effect preview. */
export function DecorArt({ item }: { item: DecorItem }) {
  // the in-situ Ascent thumbnails are SQUARE — the box takes the image's own
  // aspect ratio so the art fills it edge to edge, no letterbox bars at the
  // sides. Image-less effect previews keep the old shallow violet box.
  const box: React.CSSProperties = item.image
    ? { aspectRatio: "1 / 1", background: "radial-gradient(60% 62% at 50% 46%, #15101f, #050409 78%)" }
    : { height: 200, background: "radial-gradient(120% 100% at 50% 0%, rgba(60,40,120,0.55), #0a0812 78%)" };
  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${theme.color.border}`, ...box }}>
      {item.image ? (
        <img src={item.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <DecorPreview d={item} large />
      )}
    </div>
  );
}

/** A tiny hint of a decor effect for a card (small) or the detail modal (large).
 *  Shared by the Shop and the Collection so they match. */
export function DecorPreview({ d, large }: { d: DecorItem; large?: boolean }) {
  if (d.image) return <img src={d.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: large ? "contain" : "cover", opacity: large ? 1 : 0.7, padding: large ? 10 : 0 }} />;
  const e = d.effect;
  const k = large ? 2 : 1;
  if (e === "horizonPlanet") return <span style={{ position: "absolute", bottom: -22 * k, left: "50%", transform: "translateX(-50%)", width: 66 * k, height: 66 * k, borderRadius: "50%", background: "radial-gradient(circle at 36% 30%, #7a6bff, #241a54 70%)" }} />;
  if (e === "aurora") return <span style={{ position: "absolute", left: "-10%", right: "-10%", top: "30%", height: "40%", background: "linear-gradient(90deg,transparent,rgba(80,230,200,0.5),rgba(150,120,255,0.5),transparent)", filter: "blur(8px)" }} />;
  if (e === "nebulaPulse") return <span style={{ position: "absolute", inset: 0, background: "radial-gradient(50% 60% at 50% 50%, rgba(157,123,255,0.5), transparent 70%)" }} />;
  if (e === "grid") return <span style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(157,123,255,0.5) 1px, transparent 1px)", backgroundSize: `${12 * k}px ${12 * k}px`, opacity: 0.6 }} />;
  if (e === "orbitalRing") return <span style={{ position: "absolute", left: "50%", top: "50%", width: 70 * k, height: 70 * k, transform: "translate(-50%,-50%)", border: "2px solid rgba(157,123,255,0.5)", borderRadius: "50%" }} />;
  if (e === "asteroids") return <>{[[26, 30], [60, 24], [44, 52]].map(([l, t], i) => <span key={i} style={{ position: "absolute", left: `${l}%`, top: `${t}%`, width: 12 * k, height: 10 * k, borderRadius: "45% 55% 50% 60%", background: "linear-gradient(180deg,#6b6478,#2c2836)" }} />)}</>;
  if (e === "probe") return <svg width={26 * k} height={26 * k} viewBox="0 0 24 24" fill="#cfe6ff" style={{ position: "absolute", left: "38%", top: "34%" }}><rect x="9" y="9" width="6" height="6" rx="1" /><rect x="1" y="10" width="6" height="4" /><rect x="17" y="10" width="6" height="4" /></svg>;
  if (e === "embers") return <>{[20, 45, 62, 80].map((l, i) => <span key={i} style={{ position: "absolute", left: `${l}%`, top: `${30 + (i % 2) * 24}%`, width: 4 * k, height: 4 * k, borderRadius: "50%", background: "rgba(255,150,80,0.9)", boxShadow: "0 0 6px rgba(255,150,80,0.8)" }} />)}</>;
  if (e === "comets") return <span style={{ position: "absolute", left: "30%", top: "40%", width: 5 * k, height: 5 * k, borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px #fff, -14px 0 10px -4px rgba(127,233,245,0.9)" }} />;
  return <>{[[20, 30], [40, 60], [65, 25], [80, 55], [30, 75], [55, 40], [72, 70]].map(([l, t], i) => <span key={i} style={{ position: "absolute", left: `${l}%`, top: `${t}%`, width: 2 * k, height: 2 * k, borderRadius: "50%", background: "#fff", opacity: 0.8 }} />)}</>;
}

export function Equalizer({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 20 }} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ width: 3, height: active ? 18 : 4, borderRadius: 2, background: theme.color.accent, transformOrigin: "bottom", animation: active ? `gl-eq 0.9s ease-in-out ${i * 0.12}s infinite` : "none", opacity: active ? 1 : 0.4 }} />
      ))}
    </div>
  );
}

export function NoteIcon({ big }: { big?: boolean }) {
  const s = big ? 44 : 20;
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={theme.color.accent} strokeWidth="2" strokeLinecap="round"><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.4" fill={theme.color.accent} /><circle cx="16.5" cy="16" r="2.4" fill={theme.color.accent} /></svg>;
}

export function LockIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flex: "0 0 auto" }}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}

/* ---- shared modal styles ---- */
export const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,4,10,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 18, animation: "gl-fade-in 0.18s ease" };
export const modal: React.CSSProperties = { width: "min(400px, 100%)", maxHeight: "88vh", overflowY: "auto", background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))", border: `1px solid ${theme.color.border}`, borderRadius: 18, boxShadow: "0 26px 60px -18px rgba(0,0,0,0.85)", padding: "16px 16px 14px", animation: "gl-drop-in 0.22s cubic-bezier(0.16,1,0.3,1)" };
const modalType: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.2em", textTransform: "uppercase", color: theme.color.accent };
const modalTitle: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 20, color: theme.color.text, margin: "3px 0 12px", lineHeight: 1.1 };
const bigArt: React.CSSProperties = { display: "block", width: "100%", borderRadius: 12, border: `1px solid ${theme.color.border}` };
const mockLabel: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 8.5, letterSpacing: "0.18em", textTransform: "uppercase", color: theme.color.faint, margin: "0 0 5px 2px" };
const modalDesc: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.5, color: theme.color.dim, margin: "12px 2px 0" };
const modalActions: React.CSSProperties = { display: "flex", gap: 10, marginTop: 16 };
export const cancelBtn: React.CSSProperties = { flex: "0 0 auto", padding: "10px 18px", background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.color.border}`, borderRadius: 10, color: theme.color.dim, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, cursor: "pointer" };
export const primaryModalBtn: React.CSSProperties = { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 13.5, color: "#1a0b2e", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", border: "none", borderBottom: "3px solid #7d3fc4", boxShadow: "0 10px 22px -8px rgba(176,107,245,0.6)", borderRadius: 10, cursor: "pointer" };
export const neutralModalBtn: React.CSSProperties = { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 13.5, color: theme.color.good, background: "rgba(52,217,139,0.12)", border: "1px solid rgba(52,217,139,0.5)", borderRadius: 10, cursor: "pointer" };
export const bannerOwned: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, padding: "8px", borderRadius: 10, fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.1em", color: theme.color.good, background: "rgba(52,217,139,0.1)", border: "1px solid rgba(52,217,139,0.4)" };
export const bannerLocked: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, padding: "8px", borderRadius: 10, fontFamily: theme.fonts.sans, fontSize: 12, fontWeight: 600, color: "#ffb27a", background: "rgba(255,140,60,0.1)", border: "1px solid rgba(255,140,60,0.4)" };
const playerBar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${theme.color.border}` };
const playBtn: React.CSSProperties = { width: 40, height: 40, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: "50%", background: "linear-gradient(180deg, rgba(157,123,255,0.35), rgba(157,123,255,0.12))", border: "1px solid rgba(157,123,255,0.5)", cursor: "pointer" };
const volBtn: React.CSSProperties = { width: 34, height: 34, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.color.border}`, cursor: "pointer" };
const volPopover: React.CSSProperties = { position: "absolute", bottom: "calc(100% + 8px)", right: 0, zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px", borderRadius: 12, background: theme.color.panel, border: `1px solid ${theme.color.border}`, boxShadow: "0 12px 26px -10px rgba(0,0,0,0.8)" };
