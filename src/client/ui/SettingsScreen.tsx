import { useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { resetAllProgress } from "../levels/progress";
import { resetStats } from "../game/stats";
import { resetWallet } from "../game/wallet";
import { ownedMusic, musicTracks, resetCollection } from "../game/collection";
import type { AscentItem } from "../game/collection";
import { NebuliteGem } from "./GameHeader";
import { resetAcademyTips } from "../game/academy";
import { resetPuzzleIntro } from "../game/puzzleintro";
import { clearUnseen } from "../game/unseen";
import type { MusicTheme } from "../audio/music";
import { DEFAULT_SETTINGS } from "./settings";
import type { Settings, SceneOverride } from "./settings";

/**
 * SETTINGS — a full-screen overlay. A narrow rail of section icons on the left
 * (Visual / Audio / Data / About); the chosen section's controls fill the rest.
 * Everything is theme-aware (reads the CSS vars), so it looks right in both the
 * dark hero theme and the light / high-visibility mode.
 */

type Section = "visual" | "audio" | "game" | "decor" | "data" | "about";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: "visual",
    label: "Visual",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="4" width="19" height="13" rx="2" />
        <path d="M8 20.5h8M12 17v3.5" />
      </svg>
    ),
  },
  {
    id: "audio",
    label: "Audio",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" stroke="none" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    ),
  },
  {
    id: "game",
    label: "Game",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 6.5h11A4.5 4.5 0 0 1 22 11v4.2a2.8 2.8 0 0 1-5.1 1.6L15.5 15h-7l-1.4 1.8A2.8 2.8 0 0 1 2 15.2V11a4.5 4.5 0 0 1 4.5-4.5Z" />
        <path d="M7.5 10v3M6 11.5h3" />
        <circle cx="16" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="18.4" cy="12.4" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "data",
    label: "Data",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
    ),
  },
  {
    id: "about",
    label: "About",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 16.5v-5" />
        <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function SettingsScreen({
  settings,
  onChange,
  onClose,
  onHowToPlay,
  onCombos,
  initialSection = "visual",
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onHowToPlay?: () => void;
  onCombos?: () => void;
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [resetDone, setResetDone] = useState(false);
  const S = CONTENT.settingsScreen; // ALL copy on this screen is CMS content

  return (
    <div style={scrim} className="gl-fade">
      <div style={card}>
        {/* header */}
        <div style={header}>
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 11, letterSpacing: "0.34em", color: theme.color.accent }}>SETTINGS</span>
          <button
            onClick={() => {
              sfx.click();
              onClose();
            }}
            aria-label="Close settings"
            style={closeBtn}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div style={body}>
          {/* left rail */}
          <nav style={rail}>
            {SECTIONS.map((s) => {
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    sfx.click();
                    setSection(s.id);
                  }}
                  aria-label={s.label}
                  style={{
                    ...railBtn,
                    color: active ? "#fff" : theme.color.faint,
                    background: active ? "rgba(157,123,255,0.16)" : "transparent",
                    border: active ? "1px solid rgba(157,123,255,0.5)" : "1px solid transparent",
                  }}
                >
                  {s.icon}
                  <span style={{ fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.1em", marginTop: 4 }}>{(S.sections[s.id] ?? s.label).toUpperCase()}</span>
                </button>
              );
            })}
          </nav>

          {/* content */}
          <div style={content}>
            {section === "visual" && (
              <>
                <SettingRow
                  title={S.appearanceTitle}
                  desc={S.appearanceDesc}
                >
                  <Segmented
                    value={settings.theme}
                    options={[
                      { value: "dark", label: S.darkLabel },
                      { value: "light", label: S.lightLabel },
                    ]}
                    onChange={(v) => {
                      sfx.click();
                      onChange({ theme: v as Settings["theme"] });
                    }}
                  />
                </SettingRow>
                <SettingRow title={S.reduceTitle} desc={S.reduceDesc}>
                  <Toggle
                    on={settings.reduceMotion}
                    onChange={(on) => {
                      sfx.click();
                      onChange({ reduceMotion: on });
                    }}
                  />
                </SettingRow>
                {/* ADVANCED — the per-effect toggles. These only ever calm things
                    further, so while Reduce motion is on they all read OFF and are
                    disabled (same treatment HARD gives the combo picker). */}
                <MotionAdvanced settings={settings} onChange={onChange} />
              </>
            )}

            {section === "audio" && (
              <>
                <SettingRow title={S.sfxTitle} desc={S.sfxDesc}>
                  <VolumeSlider value={settings.sfxVolume} onChange={(v) => onChange({ sfxVolume: v })} />
                </SettingRow>
                <SettingRow title={S.musicTitle} desc={S.musicDesc}>
                  <VolumeSlider value={settings.musicVolume} onChange={(v) => onChange({ musicVolume: v })} />
                </SettingRow>
                <SettingRow title={S.tracksTitle} desc={S.tracksDesc}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 340 }}>
                    <MusicSelect label={S.gameMusicLabel} value={settings.musicGeneric} onChange={(v) => { sfx.click(); onChange({ musicGeneric: v }); }} />
                    <MusicSelect label={S.bookMusicLabel} value={settings.musicInterstellar} onChange={(v) => { sfx.click(); onChange({ musicInterstellar: v }); }} />
                    <ResetToStandard onClick={() => { sfx.click(); onChange({ sfxVolume: DEFAULT_SETTINGS.sfxVolume, musicVolume: DEFAULT_SETTINGS.musicVolume, musicGeneric: DEFAULT_SETTINGS.musicGeneric, musicInterstellar: DEFAULT_SETTINGS.musicInterstellar }); }} />
                  </div>
                </SettingRow>
              </>
            )}

            {section === "game" && (
              <>
                <SettingRow
                  title={S.difficultyTitle}
                  desc={S.difficultyDesc}
                >
                  <Segmented
                    value={settings.difficulty}
                    options={[
                      { value: "easy", label: S.easyLabel },
                      { value: "medium", label: S.mediumLabel },
                      { value: "hard", label: S.hardLabel },
                    ]}
                    onChange={(v) => {
                      sfx.click();
                      const d = v as Settings["difficulty"];
                      // easy auto-sets the friendlier bank window — still adjustable below
                      onChange(d === "easy" ? { difficulty: d, bankWindow: 5 } : { difficulty: d });
                    }}
                  />
                </SettingRow>
                <SettingRow
                  title={S.pickerTitle}
                  desc={settings.difficulty === "hard" ? S.pickerLockedDesc : S.pickerDesc}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Toggle
                      on={settings.difficulty === "hard" ? true : settings.comboPicker}
                      disabled={settings.difficulty === "hard"}
                      onChange={(on) => {
                        sfx.click();
                        onChange({ comboPicker: on });
                      }}
                    />
                    {settings.difficulty !== "hard" && !settings.comboPicker && (
                      <span style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.color.faint }}>{S.pickerOffSub}</span>
                    )}
                  </div>
                </SettingRow>
                <SettingRow
                  title={S.timerTitle}
                  desc={settings.difficulty === "hard" ? S.pickerLockedDesc : S.timerDesc}
                >
                  <Toggle
                    on={settings.difficulty === "hard" ? true : settings.comboPicker && settings.choiceTimer}
                    disabled={settings.difficulty === "hard" || !settings.comboPicker}
                    onChange={(on) => {
                      sfx.click();
                      onChange({ choiceTimer: on });
                    }}
                  />
                </SettingRow>
                <SettingRow
                  title={S.bankTitle}
                  desc={settings.difficulty === "hard" ? S.bankLockedDesc : S.bankDesc}
                >
                  <div style={{ opacity: settings.difficulty === "hard" ? 0.45 : 1, pointerEvents: settings.difficulty === "hard" ? "none" : "auto" }}>
                    <Segmented
                      value={settings.difficulty === "hard" ? "3" : String(settings.bankWindow)}
                      options={[
                        { value: "3", label: S.sec3Label },
                        { value: "5", label: S.sec5Label },
                      ]}
                      onChange={(v) => {
                        sfx.click();
                        onChange({ bankWindow: v === "5" ? 5 : 3 });
                      }}
                    />
                  </div>
                </SettingRow>
                {/* Screen shake used to live here; it's motion, not gameplay, so it
                    moved to Visual › Advanced alongside the other comfort toggles. */}
              </>
            )}


            {section === "data" && (
              <SettingRow title={S.resetTitle} desc={S.resetDesc}>
                <button
                  onClick={() => {
                    if (resetDone) return;
                    if (confirm(S.resetConfirm)) {
                      resetAllProgress();
                      resetStats();
                      resetWallet();
                      resetCollection();
                      // one-time onboarding flags — so a fresh start replays the tips
                      resetAcademyTips();
                      resetPuzzleIntro();
                      clearUnseen();
                      sfx.poof();
                      setResetDone(true);
                    }
                  }}
                  style={{ ...dangerBtn, opacity: resetDone ? 0.6 : 1, cursor: resetDone ? "default" : "pointer" }}
                >
                  {resetDone ? S.resetDoneLabel : S.resetButton}
                </button>
              </SettingRow>
            )}

            {section === "about" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.34em", color: theme.color.accent }}>{CONTENT.startScreen.kicker}</div>
                  <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 40, lineHeight: 0.95, background: theme.color.gradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", marginTop: 4 }}>
                    {CONTENT.startScreen.title}
                  </div>
                  <div style={{ fontFamily: theme.fonts.sans, fontSize: 13.5, color: theme.color.dim, marginTop: 12, lineHeight: 1.55, maxWidth: 360 }}>
                    {CONTENT.startScreen.tagline}
                  </div>
                </div>
                {onCombos && (
                  <button
                    onClick={() => {
                      sfx.click();
                      onCombos();
                    }}
                    style={aboutBtn}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <line x1="12" y1="11" x2="12" y2="16.5" />
                      <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
                    </svg>
                    {S.combosBtn}
                  </button>
                )}
                {onHowToPlay && (
                  <button
                    onClick={() => {
                      sfx.click();
                      onHowToPlay();
                    }}
                    style={aboutBtn}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.3 9.2a2.7 2.7 0 1 1 3.9 2.5c-.9.5-1.2 1-1.2 1.9" />
                      <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
                    </svg>
                    {S.howToBtn}
                  </button>
                )}
                <a
                  href="https://www.chromeabyss.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...aboutBtn, textDecoration: "none", display: "inline-flex" }}
                  onClick={() => sfx.click()}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
                  </svg>
                  {S.siteBtn}
                </a>
                <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.2em", color: theme.color.faint }}>{CONTENT.startScreen.footer}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

/**
 * VISUAL › ADVANCED — a collapsed disclosure holding the per-effect motion
 * toggles. It sits under the Reduce motion master, and every row inside it is
 * subordinate to that master: while Reduce motion is on, each toggle displays
 * OFF and is disabled, because the effective value really is off. That keeps
 * the panel honest — it never shows a switch that isn't doing anything.
 */
function MotionAdvanced({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const S = CONTENT.settingsScreen;
  const [open, setOpen] = useState(false);
  const locked = settings.reduceMotion; // the master overrides everything below

  const rows: { key: "boardZoom" | "screenShake" | "boardTilt" | "ambientFx"; title: string; desc: string }[] = [
    { key: "boardZoom", title: S.zoomTitle, desc: S.zoomDesc },
    { key: "screenShake", title: S.shakeTitle, desc: S.shakeDesc },
    { key: "boardTilt", title: S.tiltTitle, desc: S.tiltDesc },
    { key: "ambientFx", title: S.ambientTitle, desc: S.ambientDesc },
  ];

  return (
    <div style={{ paddingBottom: 22, marginBottom: 22, borderBottom: `1px solid ${theme.color.border}` }}>
      <button
        onClick={() => {
          sfx.click();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        style={advancedBtn}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
        {S.advancedShow}
      </button>

      {open && (
        <div style={{ marginTop: 16, paddingLeft: 14, borderLeft: `1px solid ${theme.color.border}`, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, lineHeight: 1.5, color: theme.color.dim, maxWidth: 420 }}>{S.advancedDesc}</div>
          {rows.map((r) => (
            <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 8, opacity: locked ? 0.55 : 1 }}>
              <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14.5, color: theme.color.text }}>{r.title}</div>
              <div style={{ fontFamily: theme.fonts.sans, fontSize: 12, lineHeight: 1.5, color: theme.color.dim, maxWidth: 420 }}>
                {locked ? S.advancedCoveredNote : r.desc}
              </div>
              <div style={{ marginTop: 2 }}>
                <Toggle
                  on={!locked && settings[r.key]}
                  disabled={locked}
                  onChange={(on) => {
                    sfx.click();
                    onChange({ [r.key]: on } as Partial<Settings>);
                  }}
                />
              </div>
            </div>
          ))}
          <ResetToStandard
            onClick={() => {
              sfx.click();
              onChange({
                boardZoom: DEFAULT_SETTINGS.boardZoom,
                boardTilt: DEFAULT_SETTINGS.boardTilt,
                ambientFx: DEFAULT_SETTINGS.ambientFx,
                screenShake: DEFAULT_SETTINGS.screenShake,
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
const advancedBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 13px",
  borderRadius: 11,
  border: `1px solid ${theme.color.border}`,
  background: "rgba(0,0,0,0.2)",
  color: theme.color.dim,
  fontFamily: theme.fonts.sans,
  fontWeight: 600,
  fontSize: 12.5,
  cursor: "pointer",
};

function SettingRow({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 22, marginBottom: 22, borderBottom: `1px solid ${theme.color.border}` }}>
      <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 16, color: theme.color.text }}>{title}</div>
      <div style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, lineHeight: 1.5, color: theme.color.dim, maxWidth: 420 }}>{desc}</div>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", padding: 3, borderRadius: 11, background: "rgba(0,0,0,0.25)", border: `1px solid ${theme.color.border}` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: "9px 22px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontFamily: theme.fonts.disp,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.03em",
              color: active ? "#1a0b2e" : theme.color.dim,
              background: active ? "linear-gradient(180deg,#e2c8ff,#b06bf5)" : "transparent",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => { if (!disabled) onChange(!on); }}
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      style={{
        width: 52,
        height: 30,
        borderRadius: 999,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        padding: 3,
        display: "flex",
        justifyContent: on ? "flex-end" : "flex-start",
        background: on ? "linear-gradient(180deg,#b06bf5,#7d3fc4)" : "rgba(0,0,0,0.3)",
        boxShadow: on ? "0 0 14px -2px rgba(176,107,245,0.6)" : `inset 0 0 0 1px ${theme.color.border}`,
        transition: "background 0.2s, opacity 0.2s",
      }}
    >
      <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 5px rgba(0,0,0,0.4)", transition: "all 0.2s" }} />
    </button>
  );
}

function ResetToStandard({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} style={resetBtn}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
      {label ?? CONTENT.settingsScreen.resetStandard}
    </button>
  );
}
const resetBtn: React.CSSProperties = { alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, marginTop: 6, padding: "8px 13px", borderRadius: 11, border: "1px solid var(--border)", background: "rgba(0,0,0,0.2)", color: theme.color.dim, fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 12, cursor: "pointer" };

function MusicSelect({ label, value, onChange }: { label: string; value: MusicTheme; onChange: (v: MusicTheme) => void }) {
  // options are the tracks you own; if the equipped one somehow isn't owned, still
  // list it so the control reflects reality.
  const owned = ownedMusic();
  const list = owned.some((m) => m.theme === value) ? owned : [...owned, ...musicTracks().filter((m) => m.theme === value)];
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 13, color: theme.color.text }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MusicTheme)}
        style={{
          fontFamily: theme.fonts.sans,
          fontSize: 12.5,
          color: theme.color.text,
          background: "rgba(0,0,0,0.28)",
          border: `1px solid ${theme.color.border}`,
          borderRadius: 9,
          padding: "8px 10px",
          minWidth: 150,
          cursor: "pointer",
        }}
      >
        {list.map((m) => (
          <option key={m.theme} value={m.theme}>{m.name}</option>
        ))}
      </select>
    </label>
  );
}

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 320 }}>
      <SpeakerIcon muted={value === 0} />
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onMouseUp={() => sfx.click()}
        onTouchEnd={() => sfx.click()}
        style={{ flex: 1, accentColor: theme.color.accent }}
      />
      <span style={{ fontFamily: theme.fonts.mono, fontSize: 12, color: theme.color.dim, minWidth: 34, textAlign: "right" }}>{Math.round(value * 100)}</span>
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.color.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" fill={theme.color.dim} stroke="none" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      )}
    </svg>
  );
}

/* ---------- styles (theme-var driven, so light mode adapts) ---------- */

const scrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 90,
  background: "rgba(4,5,10,0.72)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(0px, 3vw, 32px)",
};
const card: React.CSSProperties = {
  width: "min(760px, 100%)",
  height: "min(600px, 100%)",
  display: "flex",
  flexDirection: "column",
  borderRadius: 20,
  overflow: "hidden",
  background: "linear-gradient(180deg, var(--panel-hi), var(--panel))",
  border: "1px solid var(--border)",
  boxShadow: "0 40px 90px -24px rgba(0,0,0,0.75)",
};
const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "18px 20px",
  borderBottom: "1px solid var(--border)",
};
const closeBtn: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "rgba(0,0,0,0.2)",
  color: "var(--dim)",
  cursor: "pointer",
};
const body: React.CSSProperties = { flex: 1, display: "flex", minHeight: 0 };
const rail: React.CSSProperties = {
  width: 78,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "14px 10px",
  borderRight: "1px solid var(--border)",
};
const railBtn: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 4px",
  borderRadius: 12,
  cursor: "pointer",
};
const content: React.CSSProperties = {
  flex: 1,
  padding: "26px 28px",
  overflowY: "auto",
};
const dangerBtn: React.CSSProperties = {
  padding: "11px 20px",
  borderRadius: 11,
  border: "1px solid rgba(255,90,118,0.5)",
  background: "rgba(255,90,118,0.12)",
  color: "#ff8a9c",
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: "0.02em",
};
const aboutBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "rgba(157,123,255,0.1)",
  color: "var(--text)",
  fontFamily: theme.fonts.sans,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  alignSelf: "flex-start",
};
