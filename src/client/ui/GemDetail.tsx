import { useRef, useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { TileGem } from "./TileGem";
import { GLINT, CORE, RESURRECT, QUADRIANT, ZENITH, TileVal } from "../game/engine";
import { loadStats } from "../game/stats";
import { abilityUnlocked } from "../game/challenges";
import { renderRich } from "./richText";

/**
 * GEM DETAIL — the drill-down view behind every mineral/gem row: title,
 * TYPE line, art (CMS image or the live crystal), body copy, optional
 * LOCKED/UNLOCKED status, slide dots + swipe between items, and GO BACK.
 * Used inside the Combos & Values pop-up (all visible minerals/tiles) and by
 * the Challenges tab's UNLOCK SPECIAL GEMS rows (the three reward gems only).
 * All copy lives in the CMS (mineralDetails).
 */

export interface GemDetailItem {
  key: string;
  title: string;
  type: string;
  image: string;
  body: string;
  tile: TileVal;
  locked?: boolean;
}

// content key → the crystal the game renders when no CMS image is set
const TILE_OF: Record<string, TileVal> = {
  duneglass: 1, vigilite: 2, chromite: 3, verdite: 4, umbrite: 5, nuracite: 6,
  dross: GLINT, nebulite: CORE, resurrect: RESURRECT, quadriant: QUADRIANT, zenith: ZENITH,
};
// reward-gem content key → the achievement that unlocks it
const GEM_ACHIEVEMENT: Record<string, string> = { resurrect: "invincible", quadriant: "crimsonEndurance", zenith: "superluminal" };

/** The detail slides for a scope: "all" = every mineral + special tile the
 *  player can currently see (reward gems only once unlocked); "gems" = the
 *  three reward gems always, with their locked state attached. */
export function gemDetailItems(scope: "all" | "gems"): GemDetailItem[] {
  const md = CONTENT.mineralDetails;
  const stats = loadStats();
  const items: GemDetailItem[] = [];
  for (const it of md.items) {
    const tile = TILE_OF[it.key];
    if (tile === undefined) continue;
    const ach = GEM_ACHIEVEMENT[it.key];
    const unlocked = ach ? abilityUnlocked(ach, stats) : true;
    if (scope === "gems") {
      if (!ach) continue;
      items.push({ ...it, tile, locked: !unlocked });
    } else {
      if (ach && !unlocked) continue; // reward gems stay hidden until earned
      items.push({ ...it, tile });
    }
  }
  return items;
}

export function GemDetailView({ items, index, onIndex, onBack, showStatus, boxStyle }: {
  items: GemDetailItem[];
  index: number;
  onIndex: (i: number) => void;
  onBack: () => void;
  showStatus?: boolean;
  /** when set, the content (title → dots) sits inside this box and GO BACK
   *  renders UNDER it — the Combos & Values frame passes the legend's card */
  boxStyle?: React.CSSProperties;
}) {
  const md = CONTENT.mineralDetails;
  const it = items[Math.max(0, Math.min(index, items.length - 1))];
  const [dragX, setDragX] = useState<number | null>(null);
  const startX = useRef(0);
  if (!it) return null;
  const step = (dir: -1 | 1) => {
    const n = index + dir;
    if (n < 0 || n >= items.length) return;
    sfx.click();
    onIndex(n);
  };
  return (
    <div
      style={{ display: "flex", flexDirection: "column", touchAction: "pan-y" }}
      onPointerDown={(e) => { startX.current = e.clientX; setDragX(0); }}
      onPointerUp={(e) => {
        if (dragX === null) return;
        const dx = e.clientX - startX.current;
        setDragX(null);
        if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => setDragX(null)}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "6px 4px 2px", ...boxStyle }}>
        <div style={{ fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", color: theme.color.text }}>{it.title}</div>
        <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.22em", color: theme.color.dim, marginTop: 5, textTransform: "uppercase" }}>
          {md.typeLabel} {it.type}
        </div>
        <div style={{ margin: "16px 0 14px", minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {it.image ? (
            <img src={it.image} alt="" style={{ width: 200, height: 200, objectFit: "contain", borderRadius: 14, filter: it.locked ? "grayscale(1) brightness(0.6)" : "none" }} />
          ) : (
            // the crystal renders its own locked look (dim) — no CSS filter, so
            // its glow never gets clipped and the colours stay true
            <TileGem value={it.tile} size={84} dim={it.locked} />
          )}
        </div>
        <div style={{ fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.6, color: theme.color.dim, maxWidth: 280 }}>{renderRich(it.body)}</div>
        {showStatus && (
          <div
            style={{
              marginTop: 12, padding: "4px 12px", borderRadius: 999, fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.2em",
              color: it.locked ? theme.color.faint : theme.color.good,
              border: `1px solid ${it.locked ? theme.color.border : "rgba(52,217,139,0.4)"}`,
              background: it.locked ? "rgba(0,0,0,0.25)" : "rgba(52,217,139,0.1)",
            }}
          >
            {it.locked ? md.lockedTag : md.unlockedTag}
          </div>
        )}
        {items.length > 1 && (
          <div style={{ display: "flex", gap: 7, marginTop: 16 }}>
            {items.map((s, i) => (
              <button
                key={s.key}
                aria-label={s.title}
                onClick={() => { if (i !== index) { sfx.click(); onIndex(i); } }}
                style={{
                  width: 8, height: 8, padding: 0, borderRadius: "50%", border: "none", cursor: "pointer",
                  background: i === index ? theme.color.accent : "rgba(157,123,255,0.25)",
                  boxShadow: i === index ? "0 0 8px rgba(157,123,255,0.7)" : "none",
                }}
              />
            ))}
          </div>
        )}
      </div>
      <button onClick={() => { sfx.click(); onBack(); }} style={gemDetailBtn}>
        {md.backButton}
      </button>
    </div>
  );
}

/** The full-width button that sits UNDER the detail box — GO BACK here, and the
 *  Combos & Values minerals list's LEARN MORE, which sits in the same spot. */
export const gemDetailBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", width: "100%", marginTop: 14, padding: "10px 0",
  background: "rgba(157,123,255,0.08)", border: `1px solid ${theme.color.border}`, borderRadius: 10,
  color: theme.color.accent, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, cursor: "pointer",
};
