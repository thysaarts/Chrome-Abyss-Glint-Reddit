import type { RegionTheme } from "../theme/regions";

/**
 * A mini mock of a board theme's CHROME — the thing a theme actually re-tints in
 * game — so the thumbnail is telling. A hexagon in the theme's main colour on the
 * left, then a HUD-style panel, accent badge and two buttons (primary + outlined)
 * on the right, over the theme's background. Used in Collection and the Shop.
 */

// the standard (violet) look for the factory-default board (no region)
const STD = {
  accent: "#9d7bff",
  border: "#2c2f4a",
  panelGrad: "linear-gradient(180deg,#1a1d2e,#101322)",
  tileGrad: "linear-gradient(180deg,#222639,#141726)",
  edge: "#060810",
  screenBg: "#0a0b16",
  dimInk: "#9b95bd",
  wash: "radial-gradient(120% 100% at 50% 0%, rgba(124,90,224,0.35), transparent 70%)",
};

export function ThemePreview({ region, image, transparent, fill, hexScale = 1, chromeScale = 1 }: { region: RegionTheme | null; image?: string; transparent?: boolean; fill?: boolean; hexScale?: number; chromeScale?: number }) {
  const t = region
    ? { accent: region.accent, border: region.border, panelGrad: region.panelGrad, tileGrad: region.tileGrad, edge: region.edge, screenBg: region.screenBg, dimInk: region.dimInk, wash: region.tileWash }
    : STD;
  const h = fill ? "100%" : 76;

  // a CMS thumbnail replaces the whole procedural mock (same banner box)
  if (image) {
    return <img src={image} alt="" style={{ display: "block", height: h, width: "100%", objectFit: "cover", background: t.screenBg }} />;
  }

  // element sizing — the shop / collection mock-up scales the hexagon and the
  // chrome up (hexScale / chromeScale) so they fill the larger preview box.
  const hx = hexScale, cs = chromeScale;

  // `transparent` renders only the chrome (no screen bg / wash) so a live
  // RegionBackdrop can show through behind it (the shop / collection mock-up).
  return (
    <div style={{ position: "relative", height: h, width: "100%", overflow: "hidden", background: transparent ? "transparent" : t.screenBg }}>
      {!transparent && <div style={{ position: "absolute", inset: 0, background: t.wash }} />}
      <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 * Math.max(1, cs * 0.8), padding: "0 13px" }}>
        {/* left: a hexagon in the theme's main colour */}
        <svg width={44 * hx} height={50 * hx} viewBox="0 0 44 50" style={{ flex: "0 0 auto", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }}>
          <polygon points="22,2 42,13 42,37 22,48 2,37 2,13" fill={t.accent} stroke="rgba(255,255,255,0.3)" strokeWidth="1.3" strokeLinejoin="round" />
          <polygon points="22,2 42,13 22,25 2,13" fill="#ffffff" opacity="0.22" />
          <polygon points="2,37 22,48 42,37 22,25" fill="#000000" opacity="0.16" />
        </svg>

        {/* right: chrome mock */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 * cs }}>
          <div style={{ display: "flex", gap: 6 * cs, alignItems: "center" }}>
            <div style={{ width: 56 * cs, height: 19 * cs, borderRadius: 6 * cs, background: t.panelGrad, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 5 * cs, padding: `0 ${6 * cs}px` }}>
              <span style={{ width: 6 * cs, height: 6 * cs, borderRadius: 1.5 * cs, background: t.accent, flex: "0 0 auto" }} />
              <span style={{ flex: 1, height: 3.5 * cs, borderRadius: 2 * cs, background: t.dimInk, opacity: 0.5 }} />
            </div>
            <div style={{ width: 19 * cs, height: 19 * cs, borderRadius: 6 * cs, background: t.tileGrad, border: `1px solid ${t.border}`, display: "grid", placeItems: "center" }}>
              <span style={{ width: 7 * cs, height: 7 * cs, borderRadius: "50%", background: t.accent }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 * cs }}>
            <span style={{ width: 42 * cs, height: 16 * cs, borderRadius: 6 * cs, background: `linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0)), ${t.accent}`, borderBottom: `${2 * cs}px solid ${t.edge}` }} />
            <span style={{ width: 42 * cs, height: 16 * cs, borderRadius: 6 * cs, background: t.tileGrad, border: `1px solid ${t.accent}`, borderBottom: `${2 * cs}px solid ${t.edge}` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
