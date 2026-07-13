import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./Button";
import { theme } from "../theme/theme";
import { CONTENT, fmt } from "../content/content";
import { unlockedIndex } from "../levels/progress";
import { LEVELS } from "../levels/levels";
import { REGIONS } from "../theme/regions";
import { ThemePreview } from "./ThemePreview";
import { sfx } from "../audio/sfx";
import type { Settings } from "./settings";
import {
  customiseThemes,
  customiseMusic,
  sectors as sectorList,
  stickers as stickerList,
  themeOwned,
  musicOwned,
  stickerOwned,
  stickerProgress,
  ascentAsDecor,
  ascentItems,
  decorOwned,
} from "../game/collection";
import type { Sticker, ThemeItem, MusicItem, DecorItem } from "../game/collection";
import { unseenIds, markSeen } from "../game/unseen";
import { BookScene } from "./BookScene";
import { DetailShell, ThemeMockup, MusicPreview, DecorArt, DecorPreview, decorTypeLabel, LockIcon, cancelBtn, primaryModalBtn, neutralModalBtn, bannerLocked, bannerOwned } from "./ItemDetail";

/**
 * COLLECTION — two sub-tabs (Customise opens first):
 *   • CUSTOMISE   — board themes + music tracks you've collected (equip lives in
 *                   Settings for music; board themes equip here).
 *   • STICKER BOOK — one long scrolling interstellar voyage. Sectors are chapters;
 *                   each sticker is a stop on the winding path — a filled emblem
 *                   once earned, an outline slot with its challenge hint until then.
 *                   Planets loop down the whole journey; a subtle track plays with a
 *                   mute toggle pinned at the bottom.
 *
 * The catalogue is all CMS content; real sticker art / outlines drop into the
 * `image` / `outline` URLs per sticker.
 */
export type SeenWatch = (kind: string, key: string) => (el: HTMLElement | null) => void;

export function CollectionPage({
  sub,
  onSub,
  settings,
  onSettingsChange,
  onOpenAudioSettings,
  onOpenDecorSettings,
  onOpenShop,
  onUnseenChange,
  openItem,
  onOpenItemHandled,
  focusSticker,
  onFocusStickerHandled,
}: {
  sub: "customise" | "book";
  onSub: (s: "customise" | "book") => void;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onOpenAudioSettings: () => void;
  onOpenDecorSettings?: () => void;
  onOpenShop?: () => void;
  onUnseenChange?: () => void;
  // deep-link from a reward: open a theme/music detail, or focus a sticker
  openItem?: { kind: "themes" | "music"; key: string } | null;
  onOpenItemHandled?: () => void;
  focusSticker?: string | null;
  onFocusStickerHandled?: () => void;
}) {
  const C = CONTENT.collection;

  // UNSEEN DOTS — snapshot the unseen set per page visit: the dots stay put
  // while the player is looking (so the NEW markers are readable), and each
  // item is marked seen in storage only once it has actually been ON SCREEN
  // for a beat (IntersectionObserver, ≥60% visible for ~600ms). A fresh visit
  // re-reads the store, so seen dots disappear next time.
  const [unseen, setUnseen] = useState<Set<string>>(() => new Set(unseenIds()));
  useEffect(() => {
    setUnseen(new Set(unseenIds()));
  }, [sub]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const timersRef = useRef(new Map<Element, number>());
  // LAZY observer: ref callbacks run BEFORE effects, so the observer must exist
  // the moment the first item registers — created on demand, torn down per view.
  const getObserver = () => {
    if (!observerRef.current) {
      const timers = timersRef.current;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            const el = en.target as HTMLElement;
            const id = el.dataset.unseenId;
            if (!id) continue;
            if (en.intersectionRatio >= 0.6) {
              if (!timers.has(el)) {
                timers.set(
                  el,
                  window.setTimeout(() => {
                    const sep = id.indexOf(":");
                    markSeen([{ kind: id.slice(0, sep), key: id.slice(sep + 1) }]);
                    onUnseenChange?.();
                    observerRef.current?.unobserve(el);
                    timers.delete(el);
                  }, 600)
                );
              }
            } else {
              const t = timers.get(el);
              if (t !== undefined) {
                clearTimeout(t);
                timers.delete(el);
              }
            }
          }
        },
        { threshold: [0, 0.6] }
      );
    }
    return observerRef.current;
  };
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [sub]);
  const watch: SeenWatch = (kind, key) => (el) => {
    if (el && unseen.has(`${kind}:${key}`)) {
      el.dataset.unseenId = `${kind}:${key}`;
      getObserver().observe(el);
    }
  };
  const customiseDot = [...unseen].some((id) => !id.startsWith("sticker:"));
  const bookDot = [...unseen].some((id) => id.startsWith("sticker:"));

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* sub-tab segmented control */}
      <div style={subBar}>
        {(
          [
            ["customise", C.customiseLabel],
            ["book", C.stickerLabel],
          ] as ["customise" | "book", string][]
        ).map(([id, label]) => {
          const on = sub === id;
          return (
            <button
              key={id}
              onClick={() => { if (!on) { sfx.click(); onSub(id); } }}
              style={{
                ...subBtn,
                position: "relative",
                color: on ? "#fff" : theme.color.faint,
                background: on ? "rgba(157,123,255,0.16)" : "rgba(0,0,0,0.22)",
                border: on ? "1px solid rgba(157,123,255,0.5)" : "1px solid transparent",
                fontWeight: on ? 700 : 400,
              }}
            >
              {label}
              {(id === "customise" ? customiseDot : bookDot) && <span style={newDot} aria-label="New items here" />}
            </button>
          );
        })}
      </div>

      {sub === "customise" ? (
        <CustomiseView settings={settings} onSettingsChange={onSettingsChange} onOpenAudioSettings={onOpenAudioSettings} onOpenDecorSettings={onOpenDecorSettings} onOpenShop={onOpenShop} unseen={unseen} watch={watch} openItem={openItem} onOpenItemHandled={onOpenItemHandled} />
      ) : (
        <StickerBook reduceMotion={settings.reduceMotion} unseen={unseen} watch={watch} focusSticker={focusSticker} onFocusHandled={onFocusStickerHandled} />
      )}
    </div>
  );
}

// the gold "new here" dot — matches the tab bar's alert dot
const newDot: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  width: 9,
  height: 9,
  borderRadius: "50%",
  background: "#ffd257",
  boxShadow: "0 0 8px rgba(255,210,87,0.85)",
  zIndex: 3,
  pointerEvents: "none",
};

/* =============================== CUSTOMISE =============================== */

function CustomiseView({ settings, onSettingsChange, onOpenAudioSettings, onOpenDecorSettings, onOpenShop, unseen, watch, openItem, onOpenItemHandled }: { settings: Settings; onSettingsChange: (patch: Partial<Settings>) => void; onOpenAudioSettings: () => void; onOpenDecorSettings?: () => void; onOpenShop?: () => void; unseen: Set<string>; watch: SeenWatch; openItem?: { kind: "themes" | "music"; key: string } | null; onOpenItemHandled?: () => void }) {
  const C = CONTENT.collection;
  const themesAll = customiseThemes();
  const musicAll = customiseMusic();
  const themesOwned = themesAll.filter(themeOwned).length;
  const tracksOwned = musicAll.filter(musicOwned).length;

  // show the first 12 per section (CMS order kept — no reordering), then a toggle
  const CUST_LIMIT = 12;
  const [openThemes, setOpenThemes] = useState(false);
  const [openMusic, setOpenMusic] = useState(false);
  const themesShown = openThemes ? themesAll : themesAll.slice(0, CUST_LIMIT);
  const musicShown = openMusic ? musicAll : musicAll.slice(0, CUST_LIMIT);

  // detail pop-up (opens on tapping the item box, not the equip control)
  const [detail, setDetail] = useState<{ kind: "themes"; item: ThemeItem } | { kind: "music"; item: MusicItem } | { kind: "decor"; item: DecorItem } | null>(null);
  const ownedDecor = ascentAsDecor().filter(decorOwned); // Ascent scene elements (the old decor is retired)

  // deep-link from a reward chip: open the matching item's detail pop-up
  useEffect(() => {
    if (!openItem) return;
    if (openItem.kind === "themes") {
      const item = themesAll.find((t) => t.key === openItem.key);
      if (item) setDetail({ kind: "themes", item });
    } else {
      const item = musicAll.find((m) => m.key === openItem.key);
      if (item) setDetail({ kind: "music", item });
    }
    onOpenItemHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItem]);

  return (
    <div style={scroll}>
      <div style={inner}>
        {/* BOARD THEMES */}
        <div style={eyebrow}><span>{C.themesLabel}</span><span style={{ color: theme.color.faint }}>{themesOwned} / {themesAll.length}</span></div>
        <div style={themeGrid}>
          {themesShown.map((t) => {
            const rt = t.region ? REGIONS[t.region] : null;
            const owned = themeOwned(t);
            const equipped = settings.boardTheme === t.region;
            return (
              <div key={t.key} ref={watch("theme", t.key)} role="button" tabIndex={0} onClick={() => { sfx.click(); setDetail({ kind: "themes", item: t }); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sfx.click(); setDetail({ kind: "themes", item: t }); } }} style={{ ...card, position: "relative", overflow: "hidden", opacity: owned ? 1 : 0.72, cursor: "pointer" }}>
                {unseen.has(`theme:${t.key}`) && <span style={newDot} aria-label="New" />}
                <div style={{ position: "relative", filter: owned ? "none" : "grayscale(0.7) brightness(0.6)" }}>
                  <ThemePreview region={rt} image={t.image} />
                  {t.standard && <span style={stdBadge}>{C.standardTag}</span>}
                </div>
                <div style={{ padding: "9px 11px 11px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12.5, color: owned ? theme.color.text : theme.color.faint }}>{t.name}</span>
                  {/* the equip control toggles inline; tapping it must NOT open the pop-up */}
                  <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    {!owned ? (
                      <LockChip label={C.lockedTag} />
                    ) : equipped ? (
                      t.region ? (
                        <button style={{ ...chip, color: theme.color.good, borderColor: "rgba(52,217,139,0.45)", background: "rgba(52,217,139,0.1)", cursor: "pointer" }} onClick={() => { sfx.click(); onSettingsChange({ boardTheme: "" }); }} title="Tap to unequip">{C.equippedTag}</button>
                      ) : (
                        <span style={{ ...chip, color: theme.color.good, borderColor: "rgba(52,217,139,0.45)", background: "rgba(52,217,139,0.1)" }}>{C.equippedTag}</span>
                      )
                    ) : (
                      <Button variant="primary" size="sm" onClick={() => { sfx.click(); onSettingsChange({ boardTheme: t.region }); }}>{C.equipTag}</Button>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <CustMoreToggle open={openThemes} total={themesAll.length} limit={CUST_LIMIT} onClick={() => { sfx.click(); setOpenThemes((v) => !v); }} />

        {/* MUSIC */}
        <div style={eyebrow}><span>{C.musicLabel}</span><span style={{ color: theme.color.faint }}>{tracksOwned} / {musicAll.length}</span></div>
        <div style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.color.dim, margin: "-4px 2px 10px", lineHeight: 1.4 }}>
          Slot your collected tracks into the game and the Sticker Book from Settings › Audio.
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          {musicShown.map((m, i) => {
            const owned = musicOwned(m);
            const game = m.theme === settings.musicGeneric;
            const book = m.theme === settings.musicInterstellar;
            return (
              <div
                key={m.key}
                ref={watch("music", m.key)}
                onClick={() => { sfx.click(); setDetail({ kind: "music", item: m }); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sfx.click(); setDetail({ kind: "music", item: m }); } }}
                title="View track"
                style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i === musicShown.length - 1 ? "none" : `1px solid ${theme.color.border}`, opacity: owned ? 1 : 0.7, cursor: "pointer" }}
              >
                {unseen.has(`music:${m.key}`) && <span style={newDot} aria-label="New" />}
                <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 11, overflow: "hidden", display: "grid", placeItems: "center", background: "radial-gradient(circle at 35% 30%, rgba(157,123,255,0.28), rgba(157,123,255,0.05))", border: "1px solid rgba(157,123,255,0.35)", filter: owned ? "none" : "grayscale(1) brightness(0.6)" }}>
                  {m.image ? (
                    <img src={m.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.color.accent} strokeWidth="2" strokeLinecap="round"><path d="M6 15v4M12 9v10M18 5v14" /></svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, color: owned ? theme.color.text : theme.color.faint }}>{m.name}</span>
                    {m.standard && <span style={stdTag}>{C.standardTag}</span>}
                  </div>
                  <div style={{ fontFamily: theme.fonts.sans, fontSize: 10.5, color: theme.color.dim, marginTop: 1 }}>{m.sub}</div>
                </div>
                {!owned ? (
                  <LockChip label={C.lockedTag} />
                ) : (
                  <div style={{ display: "flex", gap: 5 }}>
                    {game && <span style={{ ...chip, color: theme.color.gold, borderColor: "rgba(232,181,63,0.45)", background: "rgba(232,181,63,0.1)" }}>GAME</span>}
                    {book && <span style={{ ...chip, color: "#7fe9f5", borderColor: "rgba(127,233,245,0.4)", background: "rgba(127,233,245,0.08)" }}>BOOK</span>}
                    {!game && !book && <span style={{ ...chip, color: theme.color.good, borderColor: "rgba(52,217,139,0.4)", background: "rgba(52,217,139,0.08)" }}>{C.collectedWord}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <CustMoreToggle open={openMusic} total={musicAll.length} limit={CUST_LIMIT} onClick={() => { sfx.click(); setOpenMusic((v) => !v); }} />

        {/* DECOR — only appears once you own decor. Never collapsed: all owned shown.
            Tapping opens the pop-up; a shop link sits alongside as one more tile. */}
        {ownedDecor.length > 0 && (
          <>
            <div style={eyebrow}><span>{C.ascentLabel ?? C.decorLabel}</span><span style={{ color: theme.color.faint }}>{ownedDecor.length} {C.collectedWord}</span></div>
            <div style={decorGrid}>
              {ownedDecor.map((d) => (
                <button key={d.key} style={decorCard} onClick={() => { sfx.click(); setDetail({ kind: "decor", item: d }); }}>
                  <div style={{ height: 64, position: "relative", overflow: "hidden", background: "radial-gradient(120% 100% at 50% 0%, rgba(60,40,120,0.5), #0a0812 75%)" }}>
                    {d.image ? (
                      <img src={d.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <DecorPreview d={d} />
                    )}
                  </div>
                  <div style={{ padding: "7px 9px 9px" }}>
                    <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 11, color: theme.color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                    <div style={{ fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.color.faint, marginTop: 4 }}>{decorTypeLabel(d)}</div>
                  </div>
                </button>
              ))}
              {/* a shop link the same size as a decor tile */}
              <button style={{ ...decorCard, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 10, textAlign: "center", cursor: "pointer" }} onClick={() => { sfx.click(); onOpenShop?.(); }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={theme.color.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></svg>
                <span style={{ fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 10.5, lineHeight: 1.25, color: theme.color.accent }}>More Decor available in the Shop</span>
              </button>
            </div>
          </>
        )}
      </div>

      {detail && (
        <CustomiseModal
          detail={detail}
          settings={settings}
          onClose={() => setDetail(null)}
          onEquipTheme={(region) => { onSettingsChange({ boardTheme: region }); setDetail(null); }}
          onEquipMusic={() => { setDetail(null); onOpenAudioSettings(); }}
          onEquipDecor={() => { setDetail(null); onOpenDecorSettings?.(); }}
        />
      )}
    </div>
  );
}

const decorGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 };
const decorCard: React.CSSProperties = { position: "relative", background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))", border: `1px solid ${theme.color.border}`, borderRadius: 15, overflow: "hidden", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", boxShadow: "0 10px 22px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };

/** The Customise detail pop-up — same art as the Shop, but Equip/Unequip instead
 *  of Buy. Themes toggle inline; Music's Equip hands off to Settings › Audio. */
function CustomiseModal({
  detail, settings, onClose, onEquipTheme, onEquipMusic, onEquipDecor,
}: {
  detail: { kind: "themes"; item: ThemeItem } | { kind: "music"; item: MusicItem } | { kind: "decor"; item: DecorItem };
  settings: Settings;
  onClose: () => void;
  onEquipTheme: (region: string) => void;
  onEquipMusic: () => void;
  onEquipDecor: () => void;
}) {
  const C = CONTENT.collection;
  if (detail.kind === "decor") {
    const d = detail.item;
    // an Ascent element is "equipped" when its scene element isn't switched off
    const element = ascentItems().find((a) => a.key === d.key)?.element;
    const on = element ? !settings.sceneOff.includes(element) : false;
    const actions = (
      <>
        <button style={cancelBtn} onClick={() => { sfx.click(); onClose(); }}>Cancel</button>
        {/* equip/unequip is done on the Decor settings page — hand off there */}
        <button style={on ? neutralModalBtn : primaryModalBtn} onClick={() => { sfx.click(); onEquipDecor(); }}>{on ? C.equippedTag : C.equipTag}</button>
      </>
    );
    return (
      <DetailShell typeLabel={decorTypeLabel(d)} title={d.name} desc={d.desc} actions={actions} onClose={onClose}>
        <DecorArt item={d} />
      </DetailShell>
    );
  }
  if (detail.kind === "themes") {
    const t = detail.item;
    const owned = themeOwned(t);
    const equipped = settings.boardTheme === t.region;
    const banner = !owned ? <div style={bannerLocked}><LockIcon /> {C.lockedTag} — not yet collected</div> : equipped ? <div style={bannerOwned}>{C.equippedTag}</div> : undefined;
    // full-width Cancel (no action button) when locked, or when this is the equipped
    // standard board (Slate) — there's nothing to equip/unequip.
    const soloCancel = !owned || (equipped && !t.region);
    const actions = soloCancel ? (
      <button style={{ ...cancelBtn, flex: 1 }} onClick={() => { sfx.click(); onClose(); }}>Cancel</button>
    ) : (
      <>
        <button style={cancelBtn} onClick={() => { sfx.click(); onClose(); }}>Cancel</button>
        {equipped && t.region ? (
          <button style={neutralModalBtn} onClick={() => { sfx.click(); onEquipTheme(""); }}>Unequip</button>
        ) : (
          <button style={primaryModalBtn} onClick={() => { sfx.click(); onEquipTheme(t.region); }}>{C.equipTag}</button>
        )}
      </>
    );
    return (
      <DetailShell typeLabel="Board Theme" title={t.name} desc={t.desc} banner={banner} actions={actions} onClose={onClose}>
        <ThemeMockup item={t} />
      </DetailShell>
    );
  }

  const m = detail.item;
  const owned = musicOwned(m);
  const game = m.theme === settings.musicGeneric;
  const book = m.theme === settings.musicInterstellar;
  const slotted = game || book;
  const banner = !owned ? <div style={bannerLocked}><LockIcon /> {C.lockedTag} — not yet collected</div> : slotted ? <div style={bannerOwned}>{game && book ? "GAME · BOOK" : game ? "Equipped · GAME" : "Equipped · BOOK"}</div> : undefined;
  const actions = !owned ? (
    // locked → just a full-width Cancel (the locked state is shown in the banner)
    <button style={{ ...cancelBtn, flex: 1 }} onClick={() => { sfx.click(); onClose(); }}>Cancel</button>
  ) : (
    <>
      <button style={cancelBtn} onClick={() => { sfx.click(); onClose(); }}>Cancel</button>
      <button style={primaryModalBtn} onClick={() => { sfx.click(); onEquipMusic(); }}>{slotted ? "Manage in Settings" : C.equipTag}</button>
    </>
  );
  return (
    <DetailShell typeLabel="Music Track" title={m.name} desc={m.desc} banner={banner} actions={actions} onClose={onClose}>
      <MusicPreview item={m} />
    </DetailShell>
  );
}

/** Show-more / show-less toggle for a Customise section (appears only past the limit). */
function CustMoreToggle({ open, total, limit, onClick }: { open: boolean; total: number; limit: number; onClick: () => void }) {
  if (total <= limit) return null;
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", marginTop: 10, marginBottom: 2, padding: "9px 0", background: "rgba(157,123,255,0.08)", border: `1px solid ${theme.color.border}`, borderRadius: 10, color: theme.color.accent, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
    >
      {open ? "Show less" : `Show ${total - limit} more`}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
}

/* ============================== STICKER BOOK ============================== */

const DESIGN_W = 374; // the journey column's design width
const TOP_PAD = 44;
const SECTOR_H = 156;
const STICKER_GAP = 224;
const BOTTOM_PAD = 90;

/** The journey column shrinks to the viewport on narrow phones (≤374px) so it
 *  never overflows sideways; the slot columns pull in proportionally. */
function useBookWidth() {
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : DESIGN_W));
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const W = Math.min(DESIGN_W, vw);
  const inset = Math.round(90 * (W / DESIGN_W));
  return { W, X_L: inset, X_R: W - inset };
}

export const GLOW = ["#9d7bff", "#40c8e0", "#ff8a3c", "#ffd166", "#7fe9f5", "#ff5aa5"];
const PLANETS = [
  { size: 150, grad: "radial-gradient(circle at 32% 28%, #6a5cff, #241a54 70%)", glow: "rgba(106,92,255,0.5)", ring: false, side: "L" },
  { size: 188, grad: "radial-gradient(circle at 34% 30%, #ff9a5a, #6a2a1a 72%)", glow: "rgba(255,150,80,0.4)", ring: true, side: "R" },
  { size: 112, grad: "radial-gradient(circle at 36% 30%, #7fe9f5, #12484a 72%)", glow: "rgba(127,233,245,0.4)", ring: false, side: "L" },
  { size: 130, grad: "radial-gradient(circle at 34% 30%, #ffd166, #6a5220 72%)", glow: "rgba(255,209,102,0.38)", ring: false, side: "R" },
];

const LOCK_COL = "#4a4d66"; // greyed tint for a locked sector

type Row =
  | { type: "sector"; y: number; name: string; color: string; unlockLine: string | null; locked: boolean }
  | { type: "sticker"; y: number; side: "L" | "R" | "C"; sticker: Sticker; idx: number; finale?: boolean; color: string; locked: boolean };

function StickerBook({ reduceMotion, unseen, watch, focusSticker, onFocusHandled }: { reduceMotion: boolean; unseen: Set<string>; watch: SeenWatch; focusSticker?: string | null; onFocusHandled?: () => void }) {
  const C = CONTENT.collection;
  const scrollRef = useRef<HTMLDivElement>(null);
  const prog = stickerProgress();
  const secs = sectorList();
  const all = stickerList();
  const { W, X_L, X_R } = useBookWidth();
  // in-situ zoom: the tapped sticker scales up IN PLACE — art ends up ~40% of
  // the screen width (capped on desktop). Tap it again / elsewhere to release.
  const [selected, setSelected] = useState<string | null>(null);
  // zoom target: art at ~62% of a phone screen, capped at 256px — exactly 2× of
  // the 512px upload pipeline, so it's the biggest retina-safe size
  const vw = typeof window !== "undefined" ? window.innerWidth : DESIGN_W;
  const zoomScale = Math.min(0.62 * vw, 256) / 128;
  // the FINALE: the journey's last sticker rests centred and big
  const finaleScale = Math.min(0.72 * vw, 300) / 168;

  const { rows, height } = useMemo(() => {
    const out: Row[] = [];
    let y = TOP_PAD;
    let idx = 0;
    const frontier = unlockedIndex();
    const place = (list: Sticker[], color: string, locked: boolean) => {
      list.forEach((s) => {
        out.push({ type: "sticker", y, side: idx % 2 === 0 ? "L" : "R", sticker: s, idx, color, locked });
        y += STICKER_GAP;
        idx++;
      });
    };
    secs.forEach((sec, si) => {
      const secStickers = all.filter((s) => s.sector === sec.id);
      // the sector's OPENER (first sticker) may gate it: a puzzle-board sticker
      // carries the level whose unlock reveals this sector
      const opener = secStickers[0] as (Sticker & { unlockLevel?: number }) | undefined;
      const gate = opener && typeof opener.unlockLevel === "number" && opener.unlockLevel >= 0 ? opener.unlockLevel : -1;
      const locked = gate >= 0 && frontier < gate;
      const color = (sec as { color?: string }).color || GLOW[si % GLOW.length];
      const lvl = gate >= 0 ? LEVELS[gate] : null;
      const unlockLine = locked && lvl ? fmt(C.sectorUnlockLabel ?? "UNLOCK LEVEL {n} · {title}", { n: gate, title: lvl.title }) : null;
      out.push({ type: "sector", y, name: sec.name, color, unlockLine, locked });
      y += SECTOR_H + (unlockLine ? 20 : 0);
      place(secStickers, color, locked);
    });
    const orphans = all.filter((s) => !secs.some((sec) => sec.id === s.sector));
    place(orphans, GLOW[0], false);
    // the FINALE — the very last sticker lands centred, larger, with extra air
    const stickersOnly = out.filter((r): r is Extract<Row, { type: "sticker" }> => r.type === "sticker");
    const last = stickersOnly[stickersOnly.length - 1];
    if (last) {
      last.side = "C";
      last.finale = true;
      last.y += 110;
      y += 110 + 150; // the finale's own extra space + room for its bigger disc
    }
    return { rows: out, height: y + BOTTOM_PAD };
  }, [secs, all]);

  const slots = rows.filter((r): r is Extract<Row, { type: "sticker" }> => r.type === "sticker");

  // deep-link from a reward chip: select the sticker and scroll it into view.
  // NOTE: clear the focus only AFTER scrolling — clearing it synchronously re-runs
  // this effect and its cleanup would cancel the pending scroll before it fires.
  useEffect(() => {
    if (!focusSticker) return;
    setSelected(focusSticker);
    const slot = slots.find((s) => s.sticker.id === focusSticker);
    const t = window.setTimeout(() => {
      const sc = scrollRef.current;
      if (slot && sc) sc.scrollTo({ top: Math.max(0, slot.y - sc.clientHeight / 2), behavior: "smooth" });
      onFocusHandled?.();
    }, 160);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSticker]);

  // winding dashed path, split into per-sector-COLOURED segments (each segment
  // takes the colour of the sticker it leads to; a locked sector's path greys)
  const pathSegs = useMemo(() => {
    if (!slots.length) return [] as { d: string; color: string }[];
    const pt = (s: typeof slots[number]) => [s.side === "L" ? X_L : s.side === "R" ? X_R : W / 2, s.y] as const;
    const segs: { d: string; color: string }[] = [];
    const c0 = pt(slots[0]);
    segs.push({ d: `M ${W / 2} ${TOP_PAD - 12} C ${W / 2} ${c0[1] - 44}, ${c0[0]} ${c0[1] - 44}, ${c0[0]} ${c0[1]}`, color: slots[0].locked ? LOCK_COL : slots[0].color });
    for (let k = 1; k < slots.length; k++) {
      const a = pt(slots[k - 1]);
      const b = pt(slots[k]);
      const my = (a[1] + b[1]) / 2;
      segs.push({ d: `M ${a[0]} ${a[1]} C ${a[0]} ${my}, ${b[0]} ${my}, ${b[0]} ${b[1]}`, color: slots[k].locked ? LOCK_COL : slots[k].color });
    }
    return segs;
  }, [slots, W, X_L, X_R]);

  const planets = useMemo(() => {
    const n = Math.ceil(height / 620);
    return Array.from({ length: n }, (_, i) => {
      const p = PLANETS[i % PLANETS.length];
      return { ...p, top: 120 + i * 620 + (i % 2 === 0 ? 0 : 40) };
    });
  }, [height]);

  // SECTOR LIGHT — track which sector is in view while scrolling and hand its
  // colour to the 3D background, which eases the whole sky into that tone
  // family (locked sectors read as undiscovered grey). Sector Y positions are
  // known analytically from the rows layout — no DOM measuring needed.
  const tintRef = useRef<string>("#9d7bff");
  useEffect(() => {
    if (reduceMotion) return;
    const el = scrollRef.current;
    if (!el) return;
    const sectors = rows.filter((r): r is Extract<Row, { type: "sector" }> => r.type === "sector");
    const update = () => {
      const mid = el.scrollTop + el.clientHeight * 0.45;
      let cur = sectors[0];
      for (const s of sectors) {
        if (s.y <= mid) cur = s;
        else break;
      }
      if (cur) tintRef.current = cur.locked ? LOCK_COL : cur.color;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [rows, reduceMotion]);

  return (
    <>
      <div style={bookHead}>
        <span style={bookProg}><b style={{ color: theme.color.gold }}>{prog.owned}</b> / {prog.total} {C.collectedWord}</span>
        <span style={bookProg}>{secs.length ? `${secs.length} ${secs.length === 1 ? "SECTOR" : "SECTORS"}` : ""}</span>
      </div>

      {/* the 3D Interstellar journey; Reduce Motion falls back to the classic 2D backdrop */}
      {reduceMotion ? (
        <BookBackdrop scrollRef={scrollRef} reduceMotion={reduceMotion} planets={planets} />
      ) : (
        <div style={backdrop}>
          <BookScene scrollRef={scrollRef} tintRef={tintRef} />
        </div>
      )}
      <div ref={scrollRef} style={bookScroll} onClick={() => setSelected(null)}>
        {/* the trail + slots scroll at full speed OVER the slower parallax scenery */}
        <div style={{ position: "relative", width: "100%", height }}>
          {/* the trail + slots stay in a centred column so the path lines up */}
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: W, height }}>
            <svg style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: selected ? 0.15 : 1, transition: "opacity 0.3s ease" }} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
              {pathSegs.map((seg, i) => (
                <path key={i} d={seg.d} fill="none" stroke={`${seg.color}70`} strokeWidth={2.5} strokeDasharray="2 9" strokeLinecap="round" />
              ))}
            </svg>
            {(() => {
              // push everything else apart while a sticker is zoomed, so the grown
              // disc never overlaps a neighbour or a sector title
              const selRow = selected ? slots.find((s) => s.sticker.id === selected) : null;
              const shift = selRow ? Math.ceil((168 * ((selRow.finale ? finaleScale : zoomScale) - (selRow.finale ? finaleScale : 1))) / 2) + 16 : 0;
              const dyOf = (yy: number) => (selRow ? (yy < selRow.y ? -shift : yy > selRow.y ? shift : 0) : 0);
              return rows.map((r, i) =>
                r.type === "sector" ? (
                  <div key={`s${i}`} style={{ position: "absolute", top: r.y, left: 0, right: 0, textAlign: "center", fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.28em", transform: `translateY(${dyOf(r.y)}px)`, transition: "transform 0.32s cubic-bezier(0.34, 1.26, 0.5, 1)" }}>
                    <SectorLabel name={r.name} color={r.locked ? LOCK_COL : r.color} unlockLine={r.unlockLine} />
                  </div>
                ) : (
                  <Slot
                    key={r.sticker.id}
                    isNew={unseen.has(`sticker:${r.sticker.id}`)}
                    watchRef={watch("sticker", r.sticker.id)}
                    row={r}
                    x={r.side === "L" ? X_L : r.side === "R" ? X_R : W / 2}
                    centerX={W / 2}
                    dy={dyOf(r.y)}
                    selected={selected === r.sticker.id}
                    zoomScale={r.finale ? Math.max(zoomScale, finaleScale) : zoomScale}
                    baseScale={r.finale ? finaleScale : 1}
                    onToggle={() => setSelected((cur) => (cur === r.sticker.id ? null : r.sticker.id))}
                  />
                )
              );
            })()}
          </div>
        </div>
      </div>

    </>
  );
}

/**
 * The parallax deep-space backdrop — a full-width, fixed layer behind the
 * scrolling journey. A canvas paints three depth layers of twinkling stars
 * (each drifting at its own parallax speed as you scroll), slow dust particles,
 * and a few flickering distant lights. Static single-frame when motion is reduced.
 */
type PlanetVis = { size: number; grad: string; glow: string; ring: boolean; side: string; top: number };

function BookBackdrop({ scrollRef, reduceMotion, planets }: { scrollRef: React.RefObject<HTMLDivElement>; reduceMotion: boolean; planets: PlanetVis[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const planetLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    type Star = { x: number; y: number; r: number; base: number; ph: number; tw: number; speed: number; hue: string };
    type Part = { x: number; y: number; r: number; a: number; vx: number; vy: number; speed: number; hue: string };
    type Light = { x: number; y: number; r: number; col: string; ph: number; speed: number };
    let stars: Star[] = [], parts: Part[] = [], lights: Light[] = [];

    function build() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width; h = rect.height;
      if (w === 0 || h === 0) return;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = w * h;
      const layers = [
        { n: area / 9000, speed: 0.12, sz: [0.5, 1.1], a: [0.14, 0.5], tw: 0.7, hue: "255,255,255" },
        { n: area / 15000, speed: 0.3, sz: [0.8, 1.6], a: [0.25, 0.7], tw: 1.3, hue: "210,225,255" },
        { n: area / 28000, speed: 0.55, sz: [1.1, 2.1], a: [0.4, 0.9], tw: 2.1, hue: "225,215,255" },
      ];
      stars = [];
      layers.forEach((L) => {
        for (let i = 0; i < L.n; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, r: rnd(L.sz[0], L.sz[1]), base: rnd(L.a[0], L.a[1]), ph: Math.random() * 6.28, tw: L.tw * rnd(0.7, 1.3), speed: L.speed, hue: L.hue });
      });
      parts = [];
      for (let i = 0; i < area / 30000; i++) parts.push({ x: Math.random() * w, y: Math.random() * h, r: rnd(0.6, 1.9), a: rnd(0.05, 0.2), vx: rnd(-4, 4), vy: rnd(-11, -3), speed: rnd(0.2, 0.5), hue: Math.random() < 0.5 ? "180,220,255" : "200,180,255" });
      lights = [];
      const lc = ["120,230,245", "190,150,255", "255,180,120", "120,255,190"];
      for (let i = 0; i < Math.max(3, Math.round(w / 130)); i++) lights.push({ x: Math.random() * w, y: Math.random() * h, r: rnd(1.4, 2.6), col: lc[i % lc.length], ph: Math.random() * 100, speed: rnd(0.35, 0.6) });
    }

    const t0 = performance.now();
    function frame(now: number) {
      if (w === 0 || h === 0) { raf = requestAnimationFrame(frame); return; }
      const t = (now - t0) / 1000;
      const scroll = scrollRef.current ? scrollRef.current.scrollTop : 0;
      ctx!.clearRect(0, 0, w, h);
      const wrap = (v: number) => ((v % h) + h) % h;

      for (const s of stars) {
        const y = wrap(s.y - scroll * s.speed);
        const tw = reduceMotion ? 0.85 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph);
        ctx!.globalAlpha = Math.max(0, s.base * tw);
        ctx!.fillStyle = `rgb(${s.hue})`;
        ctx!.beginPath();
        ctx!.arc(s.x, y, s.r, 0, 6.2832);
        ctx!.fill();
      }

      for (const p of parts) {
        if (!reduceMotion) {
          p.x += p.vx * 0.016;
          p.y += p.vy * 0.016;
          if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
          if (p.x < -4) p.x = w + 4;
          else if (p.x > w + 4) p.x = -4;
        }
        const y = wrap(p.y - scroll * p.speed);
        ctx!.globalAlpha = p.a;
        ctx!.fillStyle = `rgb(${p.hue})`;
        ctx!.beginPath();
        ctx!.arc(p.x, y, p.r, 0, 6.2832);
        ctx!.fill();
      }

      for (const L of lights) {
        const fl = reduceMotion ? 0.7 : Math.max(0.1, 0.5 + 0.35 * Math.sin(t * L.speed * 2 + L.ph) - (Math.random() < 0.06 ? Math.random() * 0.6 : 0));
        const y = wrap(L.y - scroll * 0.62);
        const g = ctx!.createRadialGradient(L.x, y, 0, L.x, y, L.r * 4.5);
        g.addColorStop(0, `rgba(${L.col},${0.85 * fl})`);
        g.addColorStop(0.4, `rgba(${L.col},${0.3 * fl})`);
        g.addColorStop(1, `rgba(${L.col},0)`);
        ctx!.globalAlpha = 1;
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(L.x, y, L.r * 4.5, 0, 6.2832);
        ctx!.fill();
        ctx!.globalAlpha = fl;
        ctx!.fillStyle = `rgb(${L.col})`;
        ctx!.beginPath();
        ctx!.arc(L.x, y, L.r * 0.7, 0, 6.2832);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    }

    // planet scenery drifts SLOWER than the sticker trail (which scrolls 1:1),
    // sitting between the far stars and the near trail for real depth
    const pFactor = reduceMotion ? 1 : 0.72;
    const sc = scrollRef.current;
    const onScroll = () => {
      const st = sc ? sc.scrollTop : 0;
      if (planetLayerRef.current) planetLayerRef.current.style.transform = `translate3d(0, ${-st * pFactor}px, 0)`;
    };
    onScroll();
    sc?.addEventListener("scroll", onScroll, { passive: true });

    build();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => { build(); if (reduceMotion) requestAnimationFrame(frame); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); sc?.removeEventListener("scroll", onScroll); };
  }, [reduceMotion, scrollRef]);

  return (
    <div style={backdrop}>
      <span style={nebula} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div ref={planetLayerRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", willChange: "transform" }}>
        {planets.map((p, i) => (
          <span key={i} style={{ position: "absolute", top: p.top, [p.side === "L" ? "left" : "right"]: -44, width: p.size, height: p.size, borderRadius: "50%", background: p.grad, opacity: 0.92, boxShadow: `0 0 60px -12px ${p.glow}` }}>
            {p.ring && <span style={{ position: "absolute", left: "-30%", top: "42%", width: "160%", height: "22%", borderRadius: "50%", border: "4px solid rgba(255,190,130,0.32)", transform: "rotate(-12deg)" }} />}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectorLabel({ name, color, unlockLine }: { name: string; color: string; unlockLine: string | null }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, color }}>
        <span style={{ width: 34, height: 1, background: `${color}88` }} />
        {name}
        <span style={{ width: 34, height: 1, background: `${color}88` }} />
      </span>
      {/* a locked sector shows which level unlocks it */}
      {unlockLine && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 8, letterSpacing: "0.16em", color, opacity: 0.9 }}>
          <svg viewBox="0 0 12 11" width="9" height="9" aria-hidden><rect x="1.5" y="4" width="9" height="7" rx="1.6" fill="none" stroke={color} strokeWidth="1.1" /><path d="M3.4 4 v-1.6 a2.6 2.6 0 0 1 5.2 0 v1.6" fill="none" stroke={color} strokeWidth="1.1" /></svg>
          {unlockLine}
        </span>
      )}
    </span>
  );
}

function Slot({ row, x, centerX, dy, selected, zoomScale, baseScale, onToggle, isNew, watchRef }: { row: Extract<Row, { type: "sticker" }>; x: number; centerX: number; dy: number; selected: boolean; zoomScale: number; baseScale: number; onToggle: () => void; isNew?: boolean; watchRef?: (el: HTMLElement | null) => void }) {
  const s = row.sticker;
  // a locked sector greys ALL its stickers regardless of earned state
  const owned = stickerOwned(s) && !row.locked;
  const color = row.locked ? LOCK_COL : row.color;
  const scale = selected ? zoomScale : baseScale;
  // a zoomed lane slot slides most of the way to the centre so the grown disc
  // never clips the screen edge (the finale already lives at the centre)
  const dx = selected && !row.finale ? (centerX - x) * 0.85 : 0;
  return (
    <div
      ref={watchRef}
      onClick={(e) => { e.stopPropagation(); sfx.click(); onToggle(); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sfx.click(); onToggle(); } }}
      aria-label={`View ${s.name}`}
      style={{
        position: "absolute",
        left: x,
        top: row.y,
        width: 174,
        // in-situ zoom: the slot grows in place (sliding centre-ward) with a
        // springy lean-in; the push-apart dy keeps neighbours clear
        transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale})`,
        transition: "transform 0.32s cubic-bezier(0.34, 1.26, 0.5, 1)",
        zIndex: selected ? 10 : row.finale ? 2 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        cursor: selected ? "zoom-out" : "pointer",
      }}
    >
      {isNew && <span style={{ ...newDot, top: 10, right: 14 }} aria-label="New" />}
      {owned ? (
        <>
          {/* resting: QUIET (faint thin ring, no colour). Selected: the full
              treatment — coloured radial wash, thick white ring, glow. */}
          <div
            style={{
              width: 168,
              height: 168,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              color,
              border: selected ? "3px solid rgba(255,255,255,0.92)" : "2px solid rgba(255,255,255,0.33)",
              background: selected
                ? `radial-gradient(circle at 34% 28%, ${color}, ${color}99 65%, ${color}55)`
                : "rgba(10,10,22,0.35)",
              boxShadow: selected
                ? `0 12px 30px -8px rgba(0,0,0,0.7), 0 0 44px -10px ${color}`
                : "0 8px 20px -6px rgba(0,0,0,0.55)",
              transition: "background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease",
            }}
          >
            {s.image ? <img src={s.image} alt={s.name} style={{ width: 128, height: 128, objectFit: "contain" }} /> : <Emblem i={row.idx} mode="fill" size={78} />}
          </div>
          <div style={{ fontFamily: theme.fonts.sans, fontWeight: 700, fontSize: 11, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.9)", textAlign: "center" }}>{s.name}</div>
        </>
      ) : (
        <>
          <div style={{ width: 168, height: 168, borderRadius: "50%", display: "grid", placeItems: "center", color: theme.color.faint, border: `2px dashed ${color}${selected ? "cc" : "88"}`, background: "rgba(10,10,22,0.4)", transition: "border 0.3s ease" }}>
            {s.outline ? <img src={s.outline} alt="" style={{ width: 118, height: 118, objectFit: "contain", opacity: 0.55, filter: row.locked ? "grayscale(1)" : undefined }} /> : <Emblem i={row.idx} mode="outline" size={78} />}
          </div>
          {s.requirement && (
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.03em", lineHeight: 1.35, color: "rgba(155,149,189,0.9)", maxWidth: 132, textAlign: "center", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>{s.requirement}</div>
          )}
        </>
      )}
    </div>
  );
}


/** Placeholder emblems until real sticker art lands (fill = earned, outline = ghost). */
export function Emblem({ i, mode, size = 34 }: { i: number; mode: "fill" | "outline"; size?: number }) {
  const fill = mode === "fill" ? "#fff" : "none";
  const stroke = mode === "fill" ? "none" : "currentColor";
  const sw = 1.7;
  const shape = i % 6;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {shape === 0 && (<><path d="M12 2c3 2 5 6 5 11l-2 3H9l-2-3C7 8 9 4 12 2z" /><path d="M7 15l-3 4 4-1M17 15l3 4-4-1" /></>)}
      {shape === 1 && (<><circle cx="12" cy="12" r="7" /><ellipse cx="12" cy="13" rx="11" ry="3.4" fill="none" stroke={mode === "fill" ? "#1a0b2e" : "currentColor"} strokeWidth="1.4" opacity="0.6" /></>)}
      {shape === 2 && (<><circle cx="15" cy="9" r="4" /><path d="M12 12 L4 20 M13 13 L7 21 M11 10 L3 16" fill="none" strokeWidth="1.5" /></>)}
      {shape === 3 && (<><rect x="9" y="9" width="6" height="6" rx="1" /><rect x="1" y="10" width="6" height="4" /><rect x="17" y="10" width="6" height="4" /><path d="M12 9V4" fill="none" strokeWidth="1.3" /></>)}
      {shape === 4 && (<><circle cx="13" cy="11" r="6" /><path d="M8 16 L3 21 M11 17 L7 21" fill="none" strokeWidth="1.5" /></>)}
      {shape === 5 && (<path d="M12 3 L14 9 L20 9 L15 13 L17 20 L12 16 L7 20 L9 13 L4 9 L10 9 Z" />)}
    </svg>
  );
}

/* --------------------------------- bits --------------------------------- */

function LockChip({ label }: { label: string }) {
  return (
    <span style={{ ...chip, color: theme.color.faint, borderColor: theme.color.border, background: "rgba(0,0,0,0.2)", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      {label}
    </span>
  );
}

/* --------------------------------- styles --------------------------------- */

const subBar: React.CSSProperties = { position: "absolute", top: 0, left: 0, right: 0, height: 52, display: "flex", gap: 5, padding: "12px 16px", zIndex: 3 };
const subBtn: React.CSSProperties = { flex: 1, borderRadius: 10, cursor: "pointer", fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.12em", padding: "8px 6px" };
const scroll: React.CSSProperties = { position: "absolute", top: 52, left: 0, right: 0, bottom: 0, overflowY: "auto" };
const inner: React.CSSProperties = { padding: "6px 18px 30px", maxWidth: 460, margin: "0 auto" };
const eyebrow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.22em", color: theme.color.faint, margin: "20px 2px 12px" };
const card: React.CSSProperties = { background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))", border: `1px solid ${theme.color.border}`, borderRadius: 15, boxShadow: "0 10px 22px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
const themeGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const chip: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 8.5, letterSpacing: "0.1em", padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap", border: "1px solid" };
const stdBadge: React.CSSProperties = { position: "absolute", top: 6, left: 6, fontFamily: theme.fonts.mono, fontSize: 7.5, letterSpacing: "0.14em", color: "#e8cf8f", background: "rgba(18,14,8,0.72)", border: "1px solid rgba(232,181,63,0.4)", borderRadius: 4, padding: "2px 5px", backdropFilter: "blur(2px)" };
const stdTag: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 7.5, letterSpacing: "0.14em", color: "#e8cf8f", background: "rgba(232,181,63,0.1)", border: "1px solid rgba(232,181,63,0.35)", borderRadius: 999, padding: "2px 6px", whiteSpace: "nowrap", flex: "0 0 auto" };

const bookHead: React.CSSProperties = { position: "absolute", top: 52, left: 0, right: 0, height: 30, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", zIndex: 2 };
const bookProg: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.16em", color: theme.color.faint };
const bookScroll: React.CSSProperties = { position: "absolute", top: 82, left: 0, right: 0, bottom: 0, overflowY: "auto", zIndex: 1 };
const backdrop: React.CSSProperties = { position: "absolute", top: 82, left: 0, right: 0, bottom: 0, overflow: "hidden", zIndex: 0, background: "linear-gradient(180deg, #0a0c18, #0b0916 45%, #0a0812 75%, #0a0c18)" };
const nebula: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background:
    "radial-gradient(360px 280px at 82% 10%, rgba(157,123,255,0.16), transparent 70%)," +
    "radial-gradient(320px 280px at 10% 34%, rgba(64,200,224,0.10), transparent 70%)," +
    "radial-gradient(380px 340px at 82% 64%, rgba(224,139,255,0.11), transparent 72%)," +
    "radial-gradient(340px 320px at 16% 90%, rgba(255,150,60,0.07), transparent 72%)",
};
