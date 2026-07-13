import { useEffect } from "react";
import type { GameContent } from "../content/content";
import { DemoApp } from "../demo/DemoApp";
import { defaultScene, defaultStickerScene, SceneDef } from "../demo/scene-model";
import { ascentItems } from "../game/collection";

/**
 * The 3D scene editor, embedded in the CMS — one tab per scene:
 *   ASCENT 3D        → content.ascentScene   (the level-map background)
 *   STICKER BOOK 3D  → content.stickerScene  (the book's planets-only journey)
 * Same editor as the standalone /demo.html, but wired to the content draft:
 * every tweak lands in the draft, previews via ?cmspreview=1, and ships with
 * the normal PUBLISH button. (demo.html itself stays a localStorage scratchpad.)
 */
export default function AscentTab({
  content,
  setContent,
  variant = "ascent",
}: {
  content: GameContent;
  setContent: (c: GameContent) => void;
  variant?: "ascent" | "sticker";
}) {
  const field = variant === "sticker" ? ("stickerScene" as const) : ("ascentScene" as const);
  const scene = (content[field] as unknown as SceneDef | null) ?? null;

  // heal a missing/empty scene (older draft) by seeding the code-side default once
  useEffect(() => {
    if (!scene || !Array.isArray(scene.objects) || scene.objects.length === 0) {
      const seed = variant === "sticker" ? defaultStickerScene() : defaultScene();
      setContent({ ...content, [field]: seed as unknown as GameContent[typeof field] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!scene || !Array.isArray(scene.objects) || scene.objects.length === 0) return null;

  // ASCENT only: Settings › Decor + the Shop list items by `element` name — flag
  // any item whose element no longer matches a scene object (e.g. after a rename).
  const sceneNames = new Set(scene.objects.map((o) => o.name));
  const skyNames = new Set(["Nebula", "Stars", "Dust", "Comets", "Galaxy glow", "Gold Embers", "Stardust Rain", "Aurora Veil", "Solar Shafts", "Crimson Drift", "Emerald Abyss"]);
  const orphans = variant === "ascent" ? ascentItems().filter((a) => !skyNames.has(a.element) && !sceneNames.has(a.element)) : [];

  const help: React.CSSProperties = { fontFamily: "'Saira', sans-serif", fontSize: 12.5, lineHeight: 1.55, color: "#857fab", maxWidth: 860, margin: "0 0 10px" };

  return (
    <div>
      {variant === "ascent" ? (
        <p style={help}>
          <b style={{ color: "#cdbcff" }}>THE ASCENT · 3D SCENE</b> — the live background behind the level map. Everything you change here
          (placement, scale, motion, materials, atmosphere, effects) is saved into the content draft and goes live with <b>PUBLISH</b>,
          exactly like copy or levels. Scroll / drag the view to travel the column; click an object to select it. The COLLECTION tab's
          Ascent items sell these elements by <b>name</b> — if you rename an object here, keep its item's <i>element</i> in sync. After big
          visual changes, re-render the shop thumbnails with <code style={{ background: "#191430", padding: "1px 6px", borderRadius: 5 }}>node scripts/ascent-thumbs.mjs</code>.
        </p>
      ) : (
        <p style={help}>
          <b style={{ color: "#cdbcff" }}>STICKER BOOK · 3D SCENE</b> — the background behind the Sticker Book: its own planets-only journey
          with an original indigo/cyan/gold sky (nothing here is sold in the Shop). Edits save into the content draft and go live with{" "}
          <b>PUBLISH</b>. Note: as the player browses, each sector's colour (COLLECTION › sectors) tints this scene automatically — keep the
          base sky fairly neutral so the sector light reads.
        </p>
      )}
      {orphans.length > 0 && (
        <p style={{ ...help, color: "#ffce8a" }}>
          ⚠ {orphans.length} shop item(s) point at scene elements that no longer exist: {orphans.map((o) => `"${o.element}"`).join(", ")}.
          Rename the objects back, or update those items' element mapping in content.
        </p>
      )}
      <div style={{ height: "78vh", minHeight: 520, border: "1px solid #2c2f4a", borderRadius: 12 }}>
        <DemoApp
          embedded
          value={scene}
          onChange={(s) => setContent({ ...content, [field]: s as unknown as GameContent[typeof field] })}
        />
      </div>
    </div>
  );
}
