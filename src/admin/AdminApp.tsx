import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";

// the 3D scene editor tab — lazy so three.js only loads when it's opened
const AscentTab = lazy(() => import("./AscentTab"));
import {
  GameContent,
  DEFAULT_CONTENT,
  CONTENT_DRAFT_KEY,
  LEVELS_DRAFT_KEY,
  readDraft,
  deepMerge,
} from "../content/content";
import type { LevelDef, UnlockRule } from "../levels/levels";
import type { BoardShape } from "../game/hex";
import { generateLevels } from "../levels/generator";
import { Glyph, GLYPH_KEYS } from "../ui/Glyphs";
import rawLevels from "../levels/levels.json";
import { DEFAULT_REPO, RepoConfig, publishFiles, publishBinaryFiles, fetchRepoFile } from "./publish";
import { generatePropGlb, PROP_TYPES, PropType } from "./propGen";
import { THUMB_KEYWORD_SUGGESTIONS } from "./thumbArt";
import { renderGlbThumb } from "./renderGlb";
import { getimgConfigured, generateThumb, colourPhrase, GetimgCfg } from "./getimg";

/**
 * GLINT CMS — the admin page (/admin.html). Deployed alongside the game but
 * never linked from it. Edits live as a DRAFT in this browser's localStorage;
 * "Preview" opens the game with ?cmspreview=1 so the draft overlays the live
 * content; "Publish" commits src/content/content.json + src/levels/levels.json
 * to GitHub, which triggers the Render deploy that makes them live for players.
 */

const SETTINGS_KEY = "glint.cms.settings.v1";
const PUBLISHED_KEY = "glint.cms.published.v1"; // snapshot of the last publish, for dirty-tracking
const AUTH_KEY = "glint.cms.auth.v1"; // sessionStorage flag once the password checked out

// SHA-256 of the admin password — only the hash ships in the bundle. This is a
// front-door lock, not real security (a static site has no server to enforce
// auth); the thing that actually guards publishing is the GitHub token, which
// never leaves the owner's browser.
const PASS_HASH = "f55bf18db637b5287a7dade51c8c9a26533bdb29fe6cfa8c88aa86520b12fc5f";

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const BUNDLED_LEVELS = (rawLevels as { levels: LevelDef[] }).levels;

// sweep the pre-reconciliation v1 draft keys (see content.ts on the v2 bump)
try {
  localStorage.removeItem("glint.cms.draft.content.v1");
  localStorage.removeItem("glint.cms.draft.levels.v1");
} catch {
  /* ignore */
}

type Tab = "levels" | "start" | "howto" | "combos" | "tutorial" | "challenges" | "achievements" | "collection" | "ascent" | "stickerscene" | "logs" | "puzzletext" | "gamesettings" | "settings";

interface Settings {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  // getimg.ai thumbnail generation (via the Cloudflare Worker proxy). All
  // optional — when the proxy URL is blank, auto-generate falls back to the
  // built-in procedural thumbnails.
  getimgProxyUrl?: string;
  getimgToken?: string; // matches the Worker's optional CMS_TOKEN
  getimgModel?: string; // default "essential-v2"
  getimgElements?: string; // comma-separated element ids, default "@glintstyle, @glintcolours"
  getimgWeight?: number; // element weight, default 0.85
  getimgReference?: string; // optional reference-image URL (for models that use references)
}

interface Snapshot {
  content: GameContent;
  levels: LevelDef[];
}

function loadSettings(): Settings {
  return readDraft<Settings>(SETTINGS_KEY) ?? { ...DEFAULT_REPO, token: "" };
}

/** Map the CMS Settings' getimg* fields onto the getimg client's config shape — the
 *  client reads proxyUrl/token/model/etc., which the Settings store under getimg*. */
function getimgCfg(s: Settings): GetimgCfg {
  return {
    proxyUrl: s.getimgProxyUrl,
    token: s.getimgToken,
    model: s.getimgModel,
    elements: s.getimgElements,
    weight: s.getimgWeight,
    reference: s.getimgReference,
  };
}

/* ---------------- sticker asset pipeline (upload → repo) ---------------- */

// Stickers render at ~108px inside a 144px circle; 512px covers 3× retina with
// headroom. Every upload is normalised to this square regardless of input size.
const STICKER_PX = 512;

/** Load a File or URL into an image element (same-origin / CORS-clean only). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load the image"));
    img.src = src;
  });
}

/** Draw `img` contained in a transparent STICKER_PX square. */
function drawContained(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = STICKER_PX;
  c.height = STICKER_PX;
  const ctx = c.getContext("2d")!;
  const scale = Math.min(STICKER_PX / img.naturalWidth, STICKER_PX / img.naturalHeight);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  ctx.drawImage(img, Math.round((STICKER_PX - w) / 2), Math.round((STICKER_PX - h) / 2), w, h);
  return c;
}

/** Draw `img` covering a W×H canvas (centre-cropped) — for thumbnails, where a
 *  full frame beats the sticker pipeline's transparent letterboxing. */
function drawCover(img: HTMLImageElement, W: number, H: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return c;
}

/** Draw the WHOLE image at its native aspect, scaled to fit within `maxDim` — no
 *  crop, no letterbox. Puzzle images keep their full frame (the board cover-crops
 *  at render time; the sticker + reveal pop-up show the complete picture). */
function drawFit(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c;
}

/** Encode a canvas as WebP when the browser can, else PNG. Returns raw base64 + ext. */
function encodeCanvas(c: HTMLCanvasElement): Promise<{ base64: string; ext: "webp" | "png" }> {
  return new Promise((resolve, reject) => {
    const finish = (blob: Blob | null, ext: "webp" | "png") => {
      if (!blob) return reject(new Error("image encoding failed"));
      const fr = new FileReader();
      fr.onload = () => resolve({ base64: String(fr.result).split(",")[1], ext });
      fr.onerror = () => reject(new Error("image encoding failed"));
      fr.readAsDataURL(blob);
    };
    c.toBlob((webp) => {
      if (webp && webp.type === "image/webp") finish(webp, "webp");
      else c.toBlob((png) => finish(png, "png"), "image/png"); // Safari has no WebP encoder
    }, "image/webp", 0.9);
  });
}

/** The OUTLINE (empty-slot) art, derived from the earned art: the shape's
 *  silhouette edge, ~2px thick, in the book's light violet. */
function outlineFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const src = drawContained(img);
  const ctx = src.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, STICKER_PX, STICKER_PX);
  const N = STICKER_PX;
  const mask = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) mask[i] = data[i * 4 + 3] > 40 ? 1 : 0;
  // erode by ~1/128th of the canvas; the edge = mask minus its eroded core
  const R = Math.max(2, Math.round(N / 128));
  const R2 = R * R;
  const eroded = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!mask[i]) continue;
      let ok = 1;
      for (let dy = -R; ok && dy <= R; dy++) {
        for (let dx = -R; ok && dx <= R; dx++) {
          if (dx * dx + dy * dy > R2) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N || !mask[yy * N + xx]) ok = 0;
        }
      }
      eroded[i] = ok;
    }
  }
  const out = document.createElement("canvas");
  out.width = N;
  out.height = N;
  const octx = out.getContext("2d")!;
  const img2 = octx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    if (mask[i] && !eroded[i]) {
      img2.data[i * 4] = 203; // the book's light violet (#cbb8ff)
      img2.data[i * 4 + 1] = 184;
      img2.data[i * 4 + 2] = 255;
      img2.data[i * 4 + 3] = 235;
    }
  }
  octx.putImageData(img2, 0, 0);
  return out;
}

/* ---------------- decor 3D model pipeline (optimize → repo) ---------------- */

// Props render at ~120px (a "big" prop ~160px), so a 512px texture is already
// 3–4× the on-screen size — generous. Meshy-style GLBs arrive with the full 4K
// PBR set (~50 MB); the textures are ~99% of that.
const PROP_TEXTURE_PX = 512;

/** base64 for large binaries (btoa chokes on spread args past ~100 KB). */
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  return btoa(s);
}

/** Rebuild a GLB, hard-compressing its textures — the single biggest lever on a
 *  Meshy-style export, where textures are ~99% of the weight. Two changes vs a
 *  plain re-export:
 *   1. every texture is re-encoded as WebP@0.8 instead of the exporter's default
 *      lossless PNG (GLTFExporter reads `texture.userData.mimeType`); and
 *   2. capped at PROP_TEXTURE_PX (512).
 *  Together that's typically a 20–40× texture cut (7 MB → ~300–600 KB) with no
 *  visible loss at the ~120px these props render. Geometry passes through
 *  untouched — at prop poly counts it's a rounding error next to the textures,
 *  and leaving it uncompressed keeps the model loadable by a plain GLTFLoader
 *  (no Draco/meshopt decoder needed). WebP textures decode via EXT_texture_webp,
 *  which GLTFLoader supports on every modern browser / native webview. three
 *  loads lazily; the admin bundle doesn't carry it. */
export async function optimizeGlb(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const [{ GLTFLoader }, { GLTFExporter }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/exporters/GLTFExporter.js"),
  ]);
  const gltf = await new Promise<{ scene: unknown; animations: unknown[] }>((resolve, reject) =>
    new GLTFLoader().parse(buf, "", (g) => resolve(g as unknown as { scene: unknown; animations: unknown[] }), reject)
  );
  // flag every material texture for WebP embedding
  const scene = gltf.scene as { traverse: (cb: (o: unknown) => void) => void };
  scene.traverse((o) => {
    const mat = (o as { material?: unknown }).material;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      const rec = m as Record<string, unknown>;
      for (const key of Object.keys(rec)) {
        const tex = rec[key] as { isTexture?: boolean; userData?: Record<string, unknown> } | null;
        if (tex && tex.isTexture) tex.userData = { ...(tex.userData ?? {}), mimeType: "image/webp" };
      }
    }
  });
  return await new Promise<ArrayBuffer>((resolve, reject) =>
    new GLTFExporter().parse(
      scene as unknown as Parameters<InstanceType<typeof GLTFExporter>["parse"]>[0],
      (out) => resolve(out as ArrayBuffer),
      reject,
      { binary: true, maxTextureSize: PROP_TEXTURE_PX, animations: (gltf.animations ?? []) as [] }
    )
  );
}

/** Ensure each PUZZLE-BOARD level owns a PERMANENTLY linked sector-opener sticker.
 *  Creating a puzzle mints its sticker once; from then on the pair is married by
 *  a stable `puzzleId` carried on BOTH — the level's position and the sticker's
 *  position in the book are irrelevant, so moving levels or reordering stickers
 *  never breaks (or duplicates) the link. Position-derived fields on the sticker
 *  (unlockLevel, level-trigger target, the auto requirement line, the image) are
 *  refreshed from wherever the level currently sits. Pre-puzzleId data heals by
 *  adopting the sticker that points at the level's current index; stale
 *  auto-created stickers (id "puzzle-…") whose puzzle no longer exists are
 *  pruned — designer-made stickers are never touched. Returns the same objects
 *  when nothing changed. */
function ensurePuzzleStickers(content: GameContent, levels: LevelDef[]): { content: GameContent; levels: LevelDef[] } {
  type S = GameContent["collection"]["stickers"][number] & { unlockLevel?: number; puzzleId?: string };
  let stickers = [...content.collection.stickers] as S[];
  let contentChanged = false;
  let levelsChanged = false;

  // 1) IDENTITY — every puzzle level carries a stable puzzleId, minted once.
  //    Healing pre-id data: stamp the same id onto the sticker that currently
  //    points at this level's index, marrying the existing pair permanently.
  const seen = new Set<string>();
  const lvls = levels.map((lv, idx) => {
    if (!lv.puzzleBoard || !lv.puzzleImage) return lv;
    let pid = lv.puzzleId;
    if (!pid || seen.has(pid)) {
      pid = `pz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const adopt = stickers.find((s) => !s.puzzleId && typeof s.unlockLevel === "number" && s.unlockLevel === idx);
      if (adopt) {
        stickers = stickers.map((s) => (s === adopt ? { ...s, puzzleId: pid } : s));
        contentChanged = true;
      }
      lv = { ...lv, puzzleId: pid };
      levelsChanged = true;
    }
    seen.add(pid);
    return lv;
  });

  // 2) SYNC — refresh the linked sticker from wherever its level sits now;
  //    mint the sticker if this puzzle never had one.
  lvls.forEach((lv, idx) => {
    if (!lv.puzzleBoard || !lv.puzzleImage || !lv.puzzleId) return;
    const s = stickers.find((x) => x.puzzleId === lv.puzzleId);
    if (s) {
      const upd: Partial<S> = {};
      if (s.unlockLevel !== idx) upd.unlockLevel = idx;
      if (s.image !== lv.puzzleImage) upd.image = lv.puzzleImage;
      if (!s.trigger) { upd.trigger = "level"; upd.target = idx + 1; }
      else if (s.trigger === "level" && s.target !== idx + 1) upd.target = idx + 1;
      const auto = `Clear Level ${idx} · ${lv.title}`;
      if (/^Clear Level \d+/.test(s.requirement ?? "") && s.requirement !== auto) upd.requirement = auto;
      if (Object.keys(upd).length) {
        stickers = stickers.map((x) => (x === s ? { ...x, ...upd } : x));
        contentChanged = true;
      }
    } else {
      stickers.push({
        id: `puzzle-${lv.puzzleId}`,
        sector: content.collection.sectors[0]?.id ?? "",
        name: lv.title,
        image: lv.puzzleImage,
        outline: "",
        requirement: `Clear Level ${idx} · ${lv.title}`,
        unlocked: false,
        trigger: "level",
        target: idx + 1,
        scope: "run",
        unlockLevel: idx,
        puzzleId: lv.puzzleId,
      } as S);
      contentChanged = true;
    }
  });

  // 3) PRUNE stale auto-created stickers whose puzzle no longer exists
  const alive = new Set(lvls.filter((l) => l.puzzleBoard && l.puzzleImage && l.puzzleId).map((l) => l.puzzleId as string));
  const before = stickers.length;
  stickers = stickers.filter((s) => {
    if (!/^puzzle-/.test(s.id)) return true; // never touch designer stickers
    return s.puzzleId ? alive.has(s.puzzleId) : false;
  });
  if (stickers.length !== before) contentChanged = true;

  return {
    content: contentChanged ? { ...content, collection: { ...content.collection, stickers } } : content,
    levels: levelsChanged ? lvls : levels,
  };
}

/** What the current draft is compared against: the last publish from this
 *  browser, else the content bundled into this build of the admin page. */
function baseline(): Snapshot {
  return readDraft<Snapshot>(PUBLISHED_KEY) ?? { content: DEFAULT_CONTENT, levels: BUNDLED_LEVELS };
}

/** Bring a stored draft up to date with the content shipped in THIS build:
 *  missing keys arrive via deepMerge, and the fixed-length arrays (how-to-play
 *  slides, tutorial steps) are padded from the bundle so newly shipped entries
 *  are never hidden by an older draft. */
function reconcileDraft(draft: Partial<GameContent>): GameContent {
  const merged = deepMerge(DEFAULT_CONTENT, draft);
  const def = DEFAULT_CONTENT;
  if (merged.howToPlay.slides.length < def.howToPlay.slides.length) {
    merged.howToPlay = { slides: def.howToPlay.slides.map((d, i) => merged.howToPlay.slides[i] ?? d) };
  }
  // tutorial steps are POSITIONAL against the scripted board actions — a draft
  // from a build with a different step count is misaligned, not just short, so
  // it resets to the bundle (padding would put texts on the wrong steps)
  if (merged.tutorialLevel.steps.length !== def.tutorialLevel.steps.length) {
    merged.tutorialLevel = { ...merged.tutorialLevel, steps: def.tutorialLevel.steps };
  }

  // KEYED CATALOGUES: deepMerge replaces whole arrays, so a draft saved before
  // a content wave shipped would silently HIDE the new bundled items (e.g. the
  // Shop themes/tracks). Merge by key instead: the draft's entries keep their
  // edits and order; bundled fields backfill anything the draft's entry lacks
  // (new schema fields); bundled entries the draft has never seen are appended.
  // (Trade-off: deleting a BUNDLED item re-appears on reload — delete bundled
  // items by publishing the deletion, which updates the baseline.)
  const mergeByKey = <T extends object>(draftArr: T[] | undefined, defArr: T[], keyOf: (x: T) => string): T[] => {
    const defByKey = new Map(defArr.map((d) => [keyOf(d), d]));
    const base = (Array.isArray(draftArr) ? draftArr : defArr).map((item) => {
      const bundled = defByKey.get(keyOf(item));
      return bundled ? { ...bundled, ...item } : item;
    });
    const have = new Set(base.map(keyOf));
    for (const d of defArr) if (!have.has(keyOf(d))) base.push(d);
    return base;
  };
  merged.collection = {
    ...merged.collection,
    themes: mergeByKey(merged.collection.themes, def.collection.themes, (t) => t.key),
    music: mergeByKey(merged.collection.music, def.collection.music, (m) => m.key),
    decor: mergeByKey(merged.collection.decor, def.collection.decor, (d) => d.key),
    ascent: mergeByKey(merged.collection.ascent, def.collection.ascent, (a) => a.key),
    stickers: mergeByKey(merged.collection.stickers, def.collection.stickers, (s) => s.id),
    sectors: mergeByKey(merged.collection.sectors, def.collection.sectors, (s) => s.id),
  };
  // heal a draft that predates a 3D scene — a null/empty scene would otherwise
  // overwrite the live one on publish
  const emptyScene = (s: unknown) => !s || !Array.isArray((s as { objects?: unknown[] }).objects) || !(s as { objects: unknown[] }).objects.length;
  if (emptyScene(merged.ascentScene)) merged.ascentScene = def.ascentScene;
  if (emptyScene(merged.stickerScene)) merged.stickerScene = def.stickerScene;
  merged.challenges = {
    ...merged.challenges,
    dailyBank: mergeByKey(merged.challenges.dailyBank, def.challenges.dailyBank, (b) => b.id),
    // milestones also normalise to the structured-tiers shape (a pre-tiers draft
    // entry takes the bundle's tiers for the same milestone)
    milestones: mergeByKey(merged.challenges.milestones, def.challenges.milestones, (m) => m.key).map((m) =>
      Array.isArray(m.tiers) ? m : { ...m, tiers: def.challenges.milestones.find((x) => x.key === m.key)?.tiers ?? [] }
    ),
  };
  return merged;
}

const RULE_LABEL: Record<UnlockRule["type"], string> = {
  always: "Complete the previous level (no extra requirement)",
  banks: "Bank N times",
  drossCleared: "Clear N Dross in one game",
  nebuliteAcquired: "Acquire N Nebulites (Mother Lode 6+ overflow)",
  coreBanked: "Bank or cover a Nebulite on the board",
  boardCleared: "Clear the board",
  score: "Earn N points",
};
const RULE_NEEDS_VALUE: Record<UnlockRule["type"], boolean> = {
  always: false,
  banks: true,
  drossCleared: true,
  nebuliteAcquired: true,
  coreBanked: false,
  boardCleared: false,
  score: true,
};

// STARTING BOARD SHAPES — wireframe outlines for the picker. The base hexagon,
// plus corner-wedge expansions that fill the hexagon's own screen box (side-6
// boards only; a non-standard shape always exceeds 91 tiles and later reduces
// to the hexagon via the SINGULARITY).
const SHAPE_OUTLINES: { id: BoardShape; label: string; pts: string }[] = [
  { id: "hexagon", label: "standard", pts: "22,3 41,14.5 41,33.5 22,45 3,33.5 3,14.5" },
  { id: "tl", label: "top left", pts: "22,3 41,14.5 41,33.5 22,45 3,33.5 3,3" },
  { id: "tr", label: "top right", pts: "22,3 41,3 41,33.5 22,45 3,33.5 3,14.5" },
  { id: "bl", label: "bottom left", pts: "22,3 41,14.5 41,33.5 22,45 3,45 3,14.5" },
  { id: "br", label: "bottom right", pts: "22,3 41,14.5 41,45 22,45 3,33.5 3,14.5" },
  { id: "tl-br", label: "TL + BR", pts: "22,3 41,14.5 41,45 22,45 3,33.5 3,3" },
  { id: "tr-bl", label: "TR + BL", pts: "22,3 41,3 41,33.5 22,45 3,45 3,14.5" },
  { id: "square", label: "full square", pts: "3,3 41,3 41,45 3,45" },
];

function ShapePicker({ value, disabled, onChange }: { value: BoardShape; disabled: boolean; onChange: (s: BoardShape) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: disabled ? 0.35 : 1 }}>
      {SHAPE_OUTLINES.map((s) => {
        const sel = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            title={s.label}
            onClick={() => onChange(s.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "7px 8px 5px",
              borderRadius: 10,
              cursor: disabled ? "not-allowed" : "pointer",
              background: sel ? "rgba(157,123,255,0.14)" : "#0a0c15",
              border: sel ? "1px solid rgba(157,123,255,0.65)" : "1px solid #2a2d4a",
            }}
          >
            <svg width="34" height="37" viewBox="0 0 44 48">
              <polygon points={s.pts} fill={sel ? "rgba(157,123,255,0.18)" : "none"} stroke={sel ? "#c9a2ff" : "#6b6690"} strokeWidth="2.4" strokeLinejoin="round" />
            </svg>
            <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: "0.08em", color: sel ? "#c9a2ff" : "#6b6690", whiteSpace: "nowrap" }}>
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// the 7 in-game regions (src/theme/regions.ts) — the level's map label + visual treatment
const REGION_OPTIONS = [
  "Fringe Market",
  "Machina Forge",
  "Corporate Spire",
  "Digital Nexus",
  "Shadow Sector",
  "Divinity Enclave",
  "Military Bastion",
];

// short editor hints for each log template (placeholders are shown automatically)
const LOG_HINTS: Partial<Record<keyof GameContent["logTexts"], string>> = {
  opening: "First line of every game",
  rushArmed: "GLINT RUSH announcement",
  collapse: "Board contraction announcement",
  banked: "A combo banks (multiplier/chain parts are filled in only when present)",
  activated: "A combo activates but doesn't bank yet",
  bankedEarly: "The free BANK NOW button was used",
  lastTileBanked: "The final hand tile formed a combo and banked",
  bust: "Normal bust ({lost} becomes the 'Lost N…' fragment or nothing)",
  bustDross: "Bust by placing Dross",
  bustLost: "Fragment appended to 'bust' when activated tiles were lost",
  bustLostDross: "Fragment appended to 'bustDross' when activated tiles were lost",
  handChoice: "Shown when the hand is revealed (3 tiles or fewer)",
  cashedOut: "CASH OUT confirmation",
  noLegalMove: "UNUSED (kept for reference — the old auto-bust)",
};

export function AdminApp() {
  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === PASS_HASH;
    } catch {
      return false;
    }
  });
  if (!authed) {
    return (
      <Gate
        onPass={() => {
          try {
            sessionStorage.setItem(AUTH_KEY, PASS_HASH);
          } catch {
            /* private mode: stay unlocked for this render only */
          }
          setAuthed(true);
        }}
      />
    );
  }
  return <AdminInner />;
}

function Gate({ onPass }: { onPass: () => void }) {
  const [pw, setPw] = useState("");
  const [bad, setBad] = useState(false);
  const submit = async () => {
    if ((await sha256Hex(pw)) === PASS_HASH) onPass();
    else {
      setBad(true);
      setPw("");
    }
  };
  return (
    <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ ...card, width: 320, textAlign: "center", padding: "28px 26px" }}
      >
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.35em", color: "#9d7bff" }}>CHROME ABYSS · GLINT</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 24, color: "#eef0f5", margin: "6px 0 20px" }}>CMS</div>
        <input
          style={{ ...input, textAlign: "center" }}
          type="password"
          autoFocus
          placeholder="password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setBad(false);
          }}
        />
        {bad && <div style={{ color: "#ff9aac", fontSize: 12, marginTop: 10 }}>Wrong password.</div>}
        <button type="submit" style={{ ...primary, width: "100%", marginTop: 16 }}>
          Enter
        </button>
      </form>
    </div>
  );
}

function AdminInner() {
  const [tab, setTab] = useState<Tab>("levels");
  const [content, setContent] = useState<GameContent>(() => {
    const draft = readDraft<Partial<GameContent>>(CONTENT_DRAFT_KEY);
    return draft ? reconcileDraft(draft) : DEFAULT_CONTENT;
  });
  const [levels, setLevels] = useState<LevelDef[]>(
    () => readDraft<{ levels: LevelDef[] }>(LEVELS_DRAFT_KEY)?.levels ?? BUNDLED_LEVELS
  );
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [publishState, setPublishState] = useState<
    { kind: "idle" } | { kind: "busy"; msg: string } | { kind: "done"; url: string } | { kind: "error"; msg: string }
  >({ kind: "idle" });

  // heal the VISIBLE draft on load too (not only at publish): marry puzzle
  // levels ↔ stickers by puzzleId, refresh position-derived fields, and prune
  // stale auto-created leftovers, so an old draft can't keep showing (or
  // re-publishing) broken links.
  useEffect(() => {
    const healed = ensurePuzzleStickers(content, levels);
    if (healed.content !== content) setContent(healed.content);
    if (healed.levels !== levels) setLevels(healed.levels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autosave the draft on every change — but a state identical to the bundled
  // content is NOT a draft: persisting it would pin today's copy and hide
  // content shipped in future builds. Store only real divergence.
  useEffect(() => {
    try {
      const json = JSON.stringify(content);
      if (json === JSON.stringify(DEFAULT_CONTENT)) localStorage.removeItem(CONTENT_DRAFT_KEY);
      else localStorage.setItem(CONTENT_DRAFT_KEY, json);
    } catch {
      /* full/blocked storage: edits still work this session */
    }
  }, [content]);
  useEffect(() => {
    try {
      if (JSON.stringify(levels) === JSON.stringify(BUNDLED_LEVELS)) localStorage.removeItem(LEVELS_DRAFT_KEY);
      else localStorage.setItem(LEVELS_DRAFT_KEY, JSON.stringify({ levels }));
    } catch {
      /* ignore */
    }
  }, [levels]);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const dirty = useMemo(() => {
    const base = baseline();
    return JSON.stringify({ content, levels }) !== JSON.stringify(base);
    // publishState in deps so the badge clears right after a publish
  }, [content, levels, publishState]);

  const discard = () => {
    if (!confirm("Discard ALL unpublished draft changes and return to the live content?")) return;
    localStorage.removeItem(CONTENT_DRAFT_KEY);
    localStorage.removeItem(LEVELS_DRAFT_KEY);
    localStorage.removeItem(PUBLISHED_KEY);
    setContent(DEFAULT_CONTENT);
    setLevels(BUNDLED_LEVELS);
    setPublishState({ kind: "idle" });
  };

  const preview = () => {
    window.open(`${location.origin}${location.pathname.replace(/admin\.html$/, "")}?cmspreview=1`, "_blank");
  };

  const publish = async () => {
    if (!settings.token) {
      setPublishState({ kind: "error", msg: "No GitHub token set — add one under SETTINGS first." });
      setTab("settings");
      return;
    }
    if (!confirm("Publish the current draft? This commits to GitHub and redeploys the live game.")) return;
    const cfg: RepoConfig = settings;
    // PUZZLE STICKERS: every puzzle-board level owns a permanently linked
    // sector-opener sticker (married by puzzleId). Reconciled into the draft
    // first so the commit matches what the designer sees.
    const reconciled = ensurePuzzleStickers(content, levels);
    if (reconciled.content !== content) setContent(reconciled.content);
    if (reconciled.levels !== levels) setLevels(reconciled.levels);
    const reconciledContent = reconciled.content;
    const levelsOut = reconciled.levels;
    try {
      // STALE-TAB GUARD: an admin tab loaded before the latest deploy doesn't know
      // about content keys added since — publishing its draft verbatim would strip
      // them and break the build (this happened: a publish dropped `minerals`).
      // So the draft is merged OVER the repo's current content: draft values win
      // everywhere the draft has an opinion; keys it has never heard of survive.
      setPublishState({ kind: "busy", msg: "Reconciling with live content…" });
      let contentOut: GameContent = reconciledContent;
      try {
        const live = JSON.parse(await fetchRepoFile(cfg, "src/content/content.json"));
        contentOut = deepMerge(live, reconciledContent);
      } catch {
        /* file missing or unreadable (e.g. first publish): publish the draft as-is */
      }
      setPublishState({ kind: "busy", msg: "Committing to GitHub…" });
      const url = await publishFiles(
        cfg,
        [
          { path: "src/content/content.json", content: JSON.stringify(contentOut, null, 2) + "\n" },
          { path: "src/levels/levels.json", content: JSON.stringify({ levels: levelsOut }, null, 2) + "\n" },
        ],
        "CMS: update content & levels"
      );
      localStorage.setItem(PUBLISHED_KEY, JSON.stringify({ content: contentOut, levels: levelsOut } satisfies Snapshot));
      setPublishState({ kind: "done", url });
    } catch (e) {
      setPublishState({ kind: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.35em", color: "#9d7bff" }}>CHROME ABYSS · GLINT</div>
          <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 26, color: "#eef0f5" }}>
            CMS <span style={{ color: "#4f4a6b", fontSize: 15, fontWeight: 600 }}>admin</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {dirty && <span style={draftBadge}>unpublished changes</span>}
          <button style={ghost} onClick={preview}>
            Preview game ↗
          </button>
          <button style={ghost} onClick={discard}>
            Discard draft
          </button>
          <button style={primary} onClick={publish} disabled={publishState.kind === "busy"}>
            {publishState.kind === "busy" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      {publishState.kind === "done" && (
        <div style={{ ...notice, borderColor: "rgba(52,217,139,0.5)", color: "#7af0b4" }}>
          Published ✓ —{" "}
          <a href={publishState.url} target="_blank" rel="noreferrer" style={{ color: "#7af0b4" }}>
            view commit
          </a>
          . Render is redeploying; the live game updates in ~1–2 minutes.
        </div>
      )}
      {publishState.kind === "error" && (
        <div style={{ ...notice, borderColor: "rgba(255,90,120,0.5)", color: "#ff9aac" }}>Publish failed: {publishState.msg}</div>
      )}

      <nav style={tabs}>
        {(
          [
            ["levels", "LEVELS"],
            ["start", "START SCREEN"],
            ["howto", "HOW TO PLAY"],
            ["combos", "COMBOS / VALUES"],
            ["tutorial", "TUTORIAL LEVEL"],
            ["challenges", "CHALLENGES"],
            ["achievements", "ACHIEVEMENTS"],
            ["collection", "COLLECTION"],
            ["ascent", "ASCENT 3D"],
            ["stickerscene", "STICKER BOOK 3D"],
            ["logs", "LOG TEXTS"],
            ["puzzletext", "PUZZLE TEXT"],
            ["gamesettings", "GAME SETTINGS"],
            ["settings", "SETTINGS"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...tabBtn, ...(tab === t ? tabActive : {}) }}>
            {label}
          </button>
        ))}
      </nav>

      <main style={{ padding: "18px 0 80px" }}>
        {tab === "levels" && <LevelsTab levels={levels} setLevels={setLevels} />}
        {tab === "start" && <StartTab content={content} setContent={setContent} />}
        {tab === "howto" && <HowToTab content={content} setContent={setContent} />}
        {tab === "combos" && <CombosTab content={content} setContent={setContent} />}
        {tab === "tutorial" && <TutorialTab content={content} setContent={setContent} />}
        {tab === "challenges" && <ChallengesTab content={content} setContent={setContent} />}
        {tab === "achievements" && <AchievementsTab content={content} setContent={setContent} />}
        {tab === "collection" && <CollectionTab content={content} setContent={setContent} />}
        {tab === "ascent" && (
          <Suspense fallback={<p style={{ fontFamily: MONO, fontSize: 12, color: "#857fab" }}>loading the 3D editor…</p>}>
            <AscentTab content={content} setContent={setContent} />
          </Suspense>
        )}
        {tab === "stickerscene" && (
          <Suspense fallback={<p style={{ fontFamily: MONO, fontSize: 12, color: "#857fab" }}>loading the 3D editor…</p>}>
            <AscentTab variant="sticker" content={content} setContent={setContent} />
          </Suspense>
        )}
        {tab === "logs" && <LogsTab content={content} setContent={setContent} />}
        {tab === "puzzletext" && <PuzzleTextTab content={content} setContent={setContent} />}
        {tab === "gamesettings" && <GameSettingsTab content={content} setContent={setContent} />}
        {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettings} />}
      </main>
    </div>
  );
}

/* ================================ LEVELS ================================ */

function LevelsTab({ levels, setLevels }: { levels: LevelDef[]; setLevels: (l: LevelDef[]) => void }) {
  // with a 100+ level list, cards collapse to summary rows. Any number can be
  // open at once (Expand all → side-by-side number comparison across levels).
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggleOpen = (i: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const update = (i: number, patch: Partial<LevelDef>) => {
    setLevels(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };
  const updateParams = (i: number, patch: Partial<LevelDef["params"]>) => {
    setLevels(levels.map((l, j) => (j === i ? { ...l, params: { ...l.params, ...patch } } : l)));
  };
  /** Param updates with the event-order rules enforced: on a shaped board the
   *  SINGULARITY must fire before Collapse 1 (singularity > collapse 1), and
   *  Collapse 2 must always sit below Collapse 1. Conflicting values are pulled
   *  down automatically. */
  const updateParamsOrdered = (i: number, patch: Partial<LevelDef["params"]>) => {
    const p = { ...levels[i].params, ...patch };
    if ((p.boardShape ?? "hexagon") !== "hexagon") {
      p.side = 6; // a shaped board is always the biggest base
      p.singularityAt = p.singularityAt ?? 45;
      if (p.collapseAt1 >= p.singularityAt) p.collapseAt1 = Math.max(2, p.singularityAt - 1);
    }
    if (p.collapseAt2 >= p.collapseAt1) p.collapseAt2 = Math.max(1, p.collapseAt1 - 1);
    setLevels(levels.map((l, j) => (j === i ? { ...l, params: p } : l)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= levels.length) return;
    const next = [...levels];
    [next[i], next[j]] = [next[j], next[i]];
    setLevels(next);
    setOpen(new Set());
  };
  const remove = (i: number) => {
    if (!confirm(`Delete level ${i} — "${levels[i].title}"? Levels after it shift down one number.`)) return;
    setLevels(levels.filter((_, j) => j !== i));
    setOpen(new Set());
  };
  /** New levels always land BEFORE the trailing boss finale, which stays last. */
  const insertBeforeBoss = (added: LevelDef[]) => {
    const bossAtEnd = levels.length > 0 && levels[levels.length - 1].boss === true;
    const next = bossAtEnd ? [...levels.slice(0, -1), ...added, levels[levels.length - 1]] : [...levels, ...added];
    setLevels(next);
  };
  const add = () => {
    insertBeforeBoss([
      {
        title: "New Level",
        region: null,
        theme: "regions",
        unlockText: "Earn 10,000 points to unlock",
        unlockRule: { type: "score", value: 10000 },
        params: { side: 6, nebulites: 1, dross: 2, collapseAt1: 30, collapseAt2: 15 },
      },
    ]);
  };
  const generate = () => {
    const bossAtEnd = levels.length > 0 && levels[levels.length - 1].boss === true;
    const existing = bossAtEnd ? levels.slice(0, -1) : levels;
    insertBeforeBoss(generateLevels(existing, 30));
  };
  // the long explainer collapses to two lines until asked for
  const [helpOpen, setHelpOpen] = useState(false);

  // the human-readable form of an unlock rule, with its value baked in
  const ruleText = (r: UnlockRule): string => {
    const v = (r.value ?? 1).toLocaleString();
    switch (r.type) {
      case "always": return "nothing — unlocks automatically";
      case "banks": return `bank ${v} times`;
      case "drossCleared": return `clear ${v} Dross in one game`;
      case "nebuliteAcquired": return `acquire ${v} Nebulite (Mother Lode)`;
      case "coreBanked": return "bank or cover a Nebulite";
      case "boardCleared": return "clear the board";
      case "score": return `earn ${v} points`;
    }
  };
  // jump to (and open) a level's card
  const goTo = (i: number) => {
    setOpen((s) => new Set(s).add(i));
    setTimeout(() => document.getElementById(`lvl-card-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // ---- PUZZLE BOARD image: cover-crop → WebP/PNG → commit to public/puzzles/ ----
  const [puzzleBusy, setPuzzleBusy] = useState(false);
  const [puzzleMsg, setPuzzleMsg] = useState<string | null>(null);
  const uploadPuzzleImage = async (i: number, file: File) => {
    const cfg = loadSettings();
    if (!cfg.token) { setPuzzleMsg("No GitHub token set — add one under SETTINGS first."); return; }
    const id = `lvl${i}`;
    setPuzzleBusy(true);
    try {
      setPuzzleMsg(`processing ${file.name}…`);
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      // store the FULL image at native aspect — the board cover-crops it at render,
      // the sticker + reveal pop-up show it whole
      const canvas = drawFit(img, 1024);
      const { base64, ext } = await encodeCanvas(canvas);
      const path = `public/puzzles/${id}.${ext}`;
      setPuzzleMsg(`committing ${path.split("/").pop()} to GitHub…`);
      await publishBinaryFiles(cfg, [{ path, base64 }], `CMS: puzzle image — ${id}`);
      update(i, { puzzleImage: `/puzzles/${id}.${ext}` });
      setPuzzleMsg(`✓ committed — it serves once the deploy lands (~1 min). Publish the content when done.`);
    } catch (e) {
      setPuzzleMsg(`upload failed: ${(e as Error).message}`);
    }
    setPuzzleBusy(false);
  };

  return (
    <div>
      <p
        style={
          helpOpen
            ? help
            : { ...help, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", marginBottom: 4 }
        }
      >
        A level is a set of parameters fed to the standard game generator. The <b>unlock requirement</b> is checked against the{" "}
        <b>previous level's</b> run result (e.g. banking 3 times in Level 1 unlocks Level 2). Level numbers follow the order below.
        Board size sets the collapse count: side 6 collapses twice (91→61→37 cells), side 5 once, side 4 never — GLINT RUSH still
        arms on side-4 boards at the final threshold. <b>Gaps</b> are cells that start empty; <b>obstacles</b> are holes carved out
        of the board (the board always stays connected; on a collapse only central holes survive, at most 60% of them). A{" "}
        <b>starting board shape</b> (side-6 only) expands the hexagon with corner wedges — the SINGULARITY event later drops those
        wedges into the abyss at its own threshold, which must sit ABOVE Collapse 1 (conflicting values are pulled down
        automatically).{" "}
        <b>Generate +30 levels</b> extends the ascent with auto-composed levels (batches of three distinct regions, fresh location
        names, a slow difficulty ramp continuing from the end of this list) — review and edit them like any level, then publish.
        The <b>boss finale</b> stays the last tile; generated and added levels always slot in before it. In the game, players see
        the list ten levels at a time (the next ten reveal as they near the window's end), with the finale always visible.
      </p>
      <button
        onClick={() => setHelpOpen((v) => !v)}
        style={{ background: "none", border: "none", padding: 0, marginBottom: 12, cursor: "pointer", fontFamily: SANS, fontSize: 12, color: "#9d7bff" }}
      >
        {helpOpen ? "show less" : "…read more"}
      </button>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={mini} onClick={() => setOpen(new Set(levels.map((_, i) => i)))}>
          ▾ Expand all
        </button>
        <button style={mini} onClick={() => setOpen(new Set())}>
          ▸ Collapse all
        </button>
      </div>
      {puzzleMsg && <div style={{ ...notice, marginBottom: 12 }}>{puzzleMsg}</div>}
      {levels.map((l, i) => {
        const isOpen = open.has(i);
        const next = levels[i + 1];
        return (
        <div key={i} id={`lvl-card-${i}`} style={{ ...card, padding: isOpen ? "16px 18px" : "10px 18px", marginBottom: 8, scrollMarginTop: 12 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer", marginBottom: isOpen ? 10 : 0 }}
            onClick={() => toggleOpen(i)}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: l.boss ? "#ff8fb0" : "#9d7bff", minWidth: 74 }}>
              {l.boss ? "FINAL" : `LEVEL ${String(i).padStart(2, "0")}`}
            </span>
            <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 13.5, color: "#eef0f5" }}>{l.title}</span>
            {i === 0 && <span style={{ ...draftBadge, borderColor: "rgba(127,233,242,0.4)", color: "#7fe9f5" }}>scripted tutorial</span>}
            {l.boss && <span style={{ ...draftBadge, borderColor: "rgba(255,90,143,0.45)", color: "#ff8fb0" }}>boss · always last</span>}
            {!isOpen && (
              <span style={{ fontSize: 11, color: "#857fab" }}>
                {l.region ?? "no region"} · {l.unlockText || "unlocked from the start"}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {!isOpen && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#6b6690" }}>
                side {l.params.side} · dross {l.params.dross} · neb {l.params.nebulites}
                {(l.params.boardShape ?? "hexagon") !== "hexagon" ? ` · ${l.params.boardShape}` : ""}
                {(l.params.gaps ?? 0) > 0 ? ` · gaps ${l.params.gaps}` : ""}
                {(l.params.obstacles ?? 0) > 0 ? ` · obst ${l.params.obstacles}` : ""}
                {(l.params.extraTiles ?? 0) > 0 ? ` · +${l.params.extraTiles} tiles` : ""}
              </span>
            )}
            {/* Levels 0 (Tutorial) and 1 (The Academy) are FIXED: they cannot be
                removed, and no move may displace them from their slots. */}
            <button style={mini} onClick={(e) => { e.stopPropagation(); move(i, -1); }} disabled={i <= 2} title="Move up">
              ↑
            </button>
            <button style={mini} onClick={(e) => { e.stopPropagation(); move(i, 1); }} disabled={i <= 1 || i === levels.length - 1} title="Move down">
              ↓
            </button>
            <button
              style={{ ...mini, color: "#ff9aac", borderColor: "rgba(255,90,120,0.35)" }}
              onClick={(e) => { e.stopPropagation(); remove(i); }}
              disabled={i <= 1}
            >
              delete
            </button>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#857fab" }}>{isOpen ? "▾" : "▸"}</span>
          </div>
          {/* THE TARGET: what a run of THIS level must achieve to unlock the next
              level (the unlock rule lives on the next level — this line surfaces
              it where it's earned, links to it, and quick-edits its value). */}
          {next && next.unlockRule.type !== "always" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: isOpen ? 0 : 8, marginBottom: isOpen ? 10 : 0, padding: "5px 10px", borderRadius: 8, background: "rgba(232,181,63,0.06)", border: "1px solid rgba(232,181,63,0.22)" }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: "#e8cf8f" }}>TARGET:</span>
              <button
                onClick={(e) => { e.stopPropagation(); goTo(i + 1); }}
                title={`Open LEVEL ${String(i + 1).padStart(2, "0")} — the rule lives on that level`}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS, fontSize: 12, color: "#e8cf8f", textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                {ruleText(next.unlockRule)} → unlocks {next.boss ? "FINAL" : `LEVEL ${String(i + 1).padStart(2, "0")}`} · {next.title}
              </button>
              <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: 1, minWidth: 220 }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: "#857fab", whiteSpace: "nowrap" }}>unlock text</span>
                <input
                  style={{ ...input, padding: "6px 9px", fontSize: 12 }}
                  value={next.unlockText}
                  placeholder="the requirement line shown on the next level's tile"
                  onChange={(e) => update(i + 1, { unlockText: e.target.value })}
                />
              </span>
              {RULE_NEEDS_VALUE[next.unlockRule.type] && (
                <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: "#857fab" }}>quick edit</span>
                  <span style={{ width: 96 }}>
                    <NumField
                      value={next.unlockRule.value ?? 1}
                      min={1}
                      max={999999}
                      onCommit={(n) => update(i + 1, { unlockRule: { ...next.unlockRule, value: n } })}
                    />
                  </span>
                </span>
              )}
            </div>
          )}
          {isOpen && i === 0 && (
            <p style={{ ...help, marginTop: 0 }}>
              Level 0 runs the scripted walkthrough first (edit its texts under TUTORIAL LEVEL); the parameters below configure the
              real playthrough it hands off into.
            </p>
          )}
          {isOpen && i === 1 && (
            <p style={{ ...help, marginTop: 0 }}>
              Level 1 (The Academy) is fixed: it opens with the Nebulite briefing pop-up (its copy lives in content · academyTips)
              and introduces the Nebulite economy. It cannot be removed or displaced.
            </p>
          )}
          {isOpen && (
          <div style={grid}>
            <Field label="Title">
              <input style={input} value={l.title} onChange={(e) => update(i, { title: e.target.value })} />
            </Field>
            <Field label="Region (map label + visuals)">
              <select style={input} value={l.region ?? ""} onChange={(e) => update(i, { region: e.target.value || null })}>
                <option value="">none (standard violet)</option>
                {REGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Theme">
              <select style={input} value={l.theme} onChange={(e) => update(i, { theme: e.target.value as LevelDef["theme"] })}>
                <option value="blank">blank</option>
                <option value="regions">regions</option>
              </select>
            </Field>
            <Field label={(l.params.boardShape ?? "hexagon") !== "hexagon" ? "Board size (set by the board shape)" : "Board size (side)"}>
              <select
                style={{ ...input, ...((l.params.boardShape ?? "hexagon") !== "hexagon" ? disabledInput : {}) }}
                disabled={(l.params.boardShape ?? "hexagon") !== "hexagon"}
                value={l.params.side}
                onChange={(e) => updateParams(i, { side: Number(e.target.value) as 4 | 5 | 6 })}
              >
                <option value={6}>6 — 91 cells, collapses twice</option>
                <option value={5}>5 — 61 cells, collapses once</option>
                <option value={4}>4 — 37 cells, no collapse</option>
              </select>
            </Field>
            <Field label="Nebulites seeded">
              <NumField value={l.params.nebulites} min={0} max={5} onCommit={(n) => updateParams(i, { nebulites: n })} />
            </Field>
            <Field label="Dross seeded">
              <NumField value={l.params.dross} min={0} max={12} onCommit={(n) => updateParams(i, { dross: n })} />
            </Field>
            <Field label="Opening GO! (slams over the board once it sets up)">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cfccdd", cursor: "pointer" }}>
                <input type="checkbox" checked={l.countdown !== false} onChange={(e) => update(i, { countdown: e.target.checked ? undefined : false })} />
                play the countdown
              </label>
            </Field>
            <Field label={l.params.side === 6 ? "Collapse 1 at (tiles left, 6→5)" : "Collapse 1 (side-6 boards only)"}>
              <NumField value={l.params.collapseAt1} min={1} max={90} disabled={l.params.side !== 6} onCommit={(n) => updateParamsOrdered(i, { collapseAt1: n })} />
            </Field>
            <Field
              label={
                l.params.side === 4
                  ? "GLINT RUSH arms at (tiles left)"
                  : l.params.side === 5
                  ? "Collapse at (5→4 · arms GLINT RUSH)"
                  : "Collapse 2 at (5→4 · arms GLINT RUSH)"
              }
            >
              <NumField value={l.params.collapseAt2} min={1} max={60} onCommit={(n) => updateParamsOrdered(i, { collapseAt2: n })} />
            </Field>
            <Field label="Gaps (cells starting empty)">
              <NumField value={l.params.gaps ?? 0} min={0} max={20} onCommit={(n) => updateParams(i, { gaps: n })} />
            </Field>
            <Field label="Obstacles (holes in the board)">
              <NumField value={l.params.obstacles ?? 0} min={0} max={15} onCommit={(n) => updateParams(i, { obstacles: n })} />
            </Field>
            <Field label={l.params.side === 6 ? "Starting board shape" : "Starting board shape (side-6 boards only)"} wide>
              <ShapePicker
                value={l.params.side === 6 ? l.params.boardShape ?? "hexagon" : "hexagon"}
                disabled={l.params.side !== 6}
                onChange={(s) => updateParamsOrdered(i, { boardShape: s })}
              />
            </Field>
            {(l.params.boardShape ?? "hexagon") !== "hexagon" && l.params.side === 6 && (
              <Field label="Singularity at (tiles left — must exceed Collapse 1)">
                <NumField value={l.params.singularityAt ?? 45} min={3} max={110} onCommit={(n) => updateParamsOrdered(i, { singularityAt: n })} />
              </Field>
            )}
            {(l.params.boardShape ?? "hexagon") !== "hexagon" && l.params.side === 6 && (
              <Field label="Extra tiles (added to the hand of 9 — pays for the bigger board)">
                <NumField value={l.params.extraTiles ?? 0} min={0} max={6} onCommit={(n) => updateParams(i, { extraTiles: n })} />
              </Field>
            )}
            <Field label="Unlock requirement">
              <select
                style={input}
                value={l.unlockRule.type}
                onChange={(e) => {
                  const type = e.target.value as UnlockRule["type"];
                  update(i, { unlockRule: RULE_NEEDS_VALUE[type] ? { type, value: l.unlockRule.value ?? 1 } : { type } });
                }}
              >
                {(Object.keys(RULE_LABEL) as UnlockRule["type"][]).map((t) => (
                  <option key={t} value={t}>
                    {RULE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            {RULE_NEEDS_VALUE[l.unlockRule.type] && (
              <Field label="Requirement value (N)">
                <NumField value={l.unlockRule.value ?? 1} min={1} max={999999} onCommit={(n) => update(i, { unlockRule: { ...l.unlockRule, value: n } })} />
              </Field>
            )}
            <Field label="Unlock text (shown on the tile)" wide>
              <input
                style={input}
                value={l.unlockText}
                placeholder="empty = unlocked from the start"
                onChange={(e) => update(i, { unlockText: e.target.value })}
              />
            </Field>
            {/* PUZZLE BOARD: an image revealed under the tiles as they clear */}
            <Field label="Puzzle board" wide>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cfccdd", cursor: "pointer" }}>
                <input type="checkbox" checked={!!l.puzzleBoard} onChange={(e) => update(i, { puzzleBoard: e.target.checked })} />
                reveal an image piece-by-piece as tiles clear (also becomes a sticker that opens a sector)
              </label>
            </Field>
            {l.puzzleBoard && (
              <Field label="Puzzle image (stored whole; the board crops to a focal point)" wide>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 200 }}>
                    <input style={{ ...input, flex: 1 }} value={l.puzzleImage ?? ""} placeholder="upload a file, or paste an image URL" onChange={(e) => update(i, { puzzleImage: e.target.value })} />
                    <label style={{ ...mini, cursor: "pointer", opacity: puzzleBusy ? 0.5 : 1 }}>
                      upload
                      <input type="file" accept="image/*" disabled={puzzleBusy} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPuzzleImage(i, f); e.target.value = ""; }} />
                    </label>
                  </div>
                  {l.puzzleImage && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* click anywhere on the image to set the on-board crop focal point */}
                      <div
                        title="Click to set the on-board focal point"
                        style={{ position: "relative", width: 108, borderRadius: 8, overflow: "hidden", border: "1px solid #2c2f4a", cursor: "crosshair", lineHeight: 0 }}
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          const x = Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
                          const y = Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 100)));
                          update(i, { puzzleFocalX: x, puzzleFocalY: y });
                        }}
                      >
                        <img src={l.puzzleImage} alt="" style={{ width: "100%", display: "block" }} />
                        <div style={{ position: "absolute", left: `${l.puzzleFocalX ?? 50}%`, top: `${l.puzzleFocalY ?? 50}%`, width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 0 1.5px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.6)", pointerEvents: "none" }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: "#857fab" }}>focal {l.puzzleFocalX ?? 50}, {l.puzzleFocalY ?? 50} — click to move</span>
                    </div>
                  )}
                </div>
              </Field>
            )}
          </div>
          )}
        </div>
        );
      })}
      <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
        <button style={primary} onClick={add}>
          + Add level
        </button>
        <button style={{ ...primary, background: "linear-gradient(180deg,#ffe6a8,#e8b53f)", borderBottom: "3px solid #a87b1e", color: "#1a0b2e" }} onClick={generate}>
          ⚡ Generate +30 levels
        </button>
      </div>
    </div>
  );
}

/* ============================== START SCREEN ============================== */

function StartTab({ content, setContent }: TabProps) {
  const s = content.startScreen;
  const set = (patch: Partial<GameContent["startScreen"]>) => setContent({ ...content, startScreen: { ...s, ...patch } });
  return (
    <div style={card}>
      <div style={grid}>
        <Field label="Kicker (small line above the title)">
          <input style={input} value={s.kicker} onChange={(e) => set({ kicker: e.target.value })} />
        </Field>
        <Field label="Title / wordmark">
          <input style={input} value={s.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Tagline" wide>
          <textarea style={area} rows={2} value={s.tagline} onChange={(e) => set({ tagline: e.target.value })} />
        </Field>
        <Field label="Start button">
          <input style={input} value={s.startButton} onChange={(e) => set({ startButton: e.target.value })} />
        </Field>
        <Field label="Quick start button">
          <input style={input} value={s.quickStartButton} onChange={(e) => set({ quickStartButton: e.target.value })} />
        </Field>
        <Field label="Settings button">
          <input style={input} value={s.settingsButton} onChange={(e) => set({ settingsButton: e.target.value })} />
        </Field>
        <Field label="How to play button">
          <input style={input} value={s.howToPlayButton} onChange={(e) => set({ howToPlayButton: e.target.value })} />
        </Field>
        <Field label="Footer line">
          <input style={input} value={s.footer} onChange={(e) => set({ footer: e.target.value })} />
        </Field>
      </div>
      <p style={help}>The kicker + title also appear as the in-game header.</p>
    </div>
  );
}

/* =============================== HOW TO PLAY =============================== */

function HowToTab({ content, setContent }: TabProps) {
  const slides = content.howToPlay.slides;
  const c = content.combos;
  const set = (i: number, patch: Partial<(typeof slides)[number]>) =>
    setContent({
      ...content,
      howToPlay: { slides: slides.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)) },
    });
  const setCombos = (patch: Partial<GameContent["combos"]>) => setContent({ ...content, combos: { ...c, ...patch } });
  return (
    <div>
      <p style={help}>
        The "How to play" carousel (start screen and in-game Help). Each slide's illustration is fixed and tied to its position,
        so slides can be reworded but not added, removed or reordered here.
      </p>
      {slides.map((sl, i) => (
        <div key={i} style={card}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 10 }}>
            SLIDE {i + 1} / {slides.length}
          </div>
          <div style={grid}>
            <Field label="Title" wide>
              <input style={input} value={sl.title} onChange={(e) => set(i, { title: e.target.value })} />
            </Field>
            <Field label="Copy" wide>
              <textarea style={area} rows={3} value={sl.copy} onChange={(e) => set(i, { copy: e.target.value })} />
            </Field>
          </div>
        </div>
      ))}
      <p style={help}>
        The inline combos list that opens from slide 3's "See all combos" button. Its rows are the same as COMBOS / VALUES — only
        its header and footer line live here.
      </p>
      <div style={card}>
        <div style={grid}>
          <Field label="Overlay title">
            <input style={input} value={c.overlayTitle} onChange={(e) => setCombos({ overlayTitle: e.target.value })} />
          </Field>
          <Field label="Overlay chains note" wide>
            <input style={input} value={c.overlayChainsNote} onChange={(e) => setCombos({ overlayChainsNote: e.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

/* ================================= COMBOS ================================= */

function CombosTab({ content, setContent }: TabProps) {
  const c = content.combos;
  const m = content.minerals;
  const set = (patch: Partial<GameContent["combos"]>) => setContent({ ...content, combos: { ...c, ...patch } });
  const setM = (patch: Partial<GameContent["minerals"]>) => setContent({ ...content, minerals: { ...m, ...patch } });

  const rowsEditor = (
    key: "combosRows" | "chainsRows",
    rows: { name: string; desc: string; pts: string }[]
  ) => (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input
            style={{ ...input, width: 130 }}
            value={r.name}
            placeholder="name"
            onChange={(e) => set({ [key]: rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) } as any)}
          />
          <input
            style={{ ...input, flex: 1 }}
            value={r.desc}
            placeholder="description"
            onChange={(e) => set({ [key]: rows.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) } as any)}
          />
          <input
            style={{ ...input, width: 76 }}
            value={r.pts}
            placeholder="pts"
            onChange={(e) => set({ [key]: rows.map((x, j) => (j === i ? { ...x, pts: e.target.value } : x)) } as any)}
          />
          <button style={mini} onClick={() => set({ [key]: rows.filter((_, j) => j !== i) } as any)}>
            ×
          </button>
        </div>
      ))}
      <button style={mini} onClick={() => set({ [key]: [...rows, { name: "", desc: "", pts: "" }] } as any)}>
        + row
      </button>
    </div>
  );

  return (
    <div>
      <p style={help}>
        The combos legend (ⓘ pop-up and the how-to-play overlay). <b>Display only</b> — scoring values live in the game rules, so
        changing a number here changes what's SHOWN, not what's scored.
      </p>
      <div style={card}>
        <Field label="Combos section title" wide>
          <input style={input} value={c.combosTitle} onChange={(e) => set({ combosTitle: e.target.value })} />
        </Field>
        <div style={{ height: 10 }} />
        {rowsEditor("combosRows", c.combosRows)}
      </div>
      <div style={card}>
        <Field label="Chains section title" wide>
          <input style={input} value={c.chainsTitle} onChange={(e) => set({ chainsTitle: e.target.value })} />
        </Field>
        <div style={{ height: 10 }} />
        {rowsEditor("chainsRows", c.chainsRows)}
      </div>
      <div style={card}>
        <Field label="Footnote (multiplier note)" wide>
          <textarea style={area} rows={2} value={c.footnote} onChange={(e) => set({ footnote: e.target.value })} />
        </Field>
      </div>

      <p style={help}>
        The MINERALS tab of the same pop-up: names + shape descriptions per value (the gem art and values are fixed), and the two
        special tiles.
      </p>
      <div style={card}>
        <Field label="Minerals section title" wide>
          <input style={input} value={m.title} onChange={(e) => setM({ title: e.target.value })} />
        </Field>
        <div style={{ height: 10 }} />
        {m.rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#ffd980", width: 26, textAlign: "center" }}>{i + 1}</span>
            <input
              style={{ ...input, width: 150 }}
              value={r.name}
              placeholder="mineral name"
              onChange={(e) => setM({ rows: m.rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
            />
            <input
              style={{ ...input, flex: 1 }}
              value={r.desc}
              placeholder="shape description"
              onChange={(e) => setM({ rows: m.rows.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })}
            />
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={grid}>
          <Field label="Special tiles title" wide>
            <input style={input} value={m.specialTitle} onChange={(e) => setM({ specialTitle: e.target.value })} />
          </Field>
          <Field label="Dross name">
            <input style={input} value={m.drossName} onChange={(e) => setM({ drossName: e.target.value })} />
          </Field>
          <Field label="Dross description">
            <input style={input} value={m.drossDesc} onChange={(e) => setM({ drossDesc: e.target.value })} />
          </Field>
          <Field label="Nebulite name">
            <input style={input} value={m.nebuliteName} onChange={(e) => setM({ nebuliteName: e.target.value })} />
          </Field>
          <Field label="Nebulite description">
            <input style={input} value={m.nebuliteDesc} onChange={(e) => setM({ nebuliteDesc: e.target.value })} />
          </Field>
          <Field label="Nebulite note (the ↳ line)" wide>
            <input style={input} value={m.nebuliteNote} onChange={(e) => setM({ nebuliteNote: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* ACHIEVEMENT BONUS GEMS — the Combos & Values entries, shown in-game only
          once each is unlocked. This copy is separate from the game-end pop-up. */}
      {(m as unknown as { bonusTiles?: { key: string; name: string; desc: string }[] }).bonusTiles && (
        <>
          <p style={{ ...help, marginBottom: 8 }}><b>BONUS GEMS</b> — the Resurrect / Quadriant / Zenith rows in Combos &amp; Values (above Dross), each shown only once the player has unlocked it. Gem shapes/colours are set in code.</p>
          <div style={card}>
            {(m as unknown as { bonusTiles: { key: string; name: string; desc: string }[] }).bonusTiles.map((b, bi) => (
              <div key={b.key} style={{ marginBottom: bi === 2 ? 0 : 10, paddingBottom: bi === 2 ? 0 : 10, borderBottom: bi === 2 ? "none" : "1px solid #23263b" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 6 }}>{b.key}</div>
                <div style={grid}>
                  <Field label="Name"><input style={input} value={b.name} onChange={(e) => setM({ bonusTiles: (m as unknown as { bonusTiles: { key: string; name: string; desc: string }[] }).bonusTiles.map((x, j) => (j === bi ? { ...x, name: e.target.value } : x)) } as Partial<GameContent["minerals"]>)} /></Field>
                  <Field label="Description" wide><textarea style={area} rows={2} value={b.desc} onChange={(e) => setM({ bonusTiles: (m as unknown as { bonusTiles: { key: string; name: string; desc: string }[] }).bonusTiles.map((x, j) => (j === bi ? { ...x, desc: e.target.value } : x)) } as Partial<GameContent["minerals"]>)} /></Field>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/* ============================== GAME SETTINGS ============================== */

// which settingsScreen keys belong to which player-facing section, with labels
const GS_GROUPS: { title: string; fields: [string, string, boolean][] }[] = [
  { title: "VISUAL", fields: [["appearanceTitle", "Appearance — title", false], ["appearanceDesc", "Appearance — description", true], ["darkLabel", "'Dark' option", false], ["lightLabel", "'Light' option", false], ["reduceTitle", "Reduce motion — title", false], ["reduceDesc", "Reduce motion — description", true]] },
  { title: "AUDIO", fields: [["sfxTitle", "Sound effects — title", false], ["sfxDesc", "Sound effects — description", true], ["musicTitle", "Music — title", false], ["musicDesc", "Music — description", true], ["tracksTitle", "Your tracks — title", false], ["tracksDesc", "Your tracks — description", true], ["gameMusicLabel", "'Game music' label", false], ["bookMusicLabel", "'Sticker Book music' label", false]] },
  { title: "GAME", fields: [["difficultyTitle", "Difficulty — title", false], ["difficultyDesc", "Difficulty — description", true], ["easyLabel", "'Easy'", false], ["mediumLabel", "'Medium'", false], ["hardLabel", "'Hard'", false], ["pickerTitle", "Combo picker timer — title", false], ["pickerDesc", "Picker — description", true], ["pickerLockedDesc", "Picker — locked-by-Hard note", true], ["bankTitle", "Bank Now countdown — title", false], ["bankDesc", "Bank Now — description", true], ["bankLockedDesc", "Bank Now — locked-by-Hard note", true], ["sec3Label", "'3 seconds'", false], ["sec5Label", "'5 seconds'", false], ["shakeTitle", "Screen shake — title", false], ["shakeDesc", "Screen shake — description", true]] },
  { title: "DECOR & DATA", fields: [["noDecor", "Decor — 'nothing owned yet' line", true], ["resetStandard", "'Reset to standard' button", false], ["resetTitle", "Reset progress — title", false], ["resetDesc", "Reset progress — description", true], ["resetConfirm", "Reset — confirm dialog", true], ["resetButton", "Reset — button", false], ["resetDoneLabel", "Reset — done label", false]] },
  { title: "ABOUT", fields: [["combosBtn", "'Combos & values' button", false], ["howToBtn", "'How to play' button", false], ["siteBtn", "Website link label", false]] },
];

/* ============================== PUZZLE TEXT ============================== */

function PuzzleTextTab({ content, setContent }: TabProps) {
  const pt = content.puzzleText;
  const setPt = (patch: Partial<GameContent["puzzleText"]>) => setContent({ ...content, puzzleText: { ...pt, ...patch } });
  const setIntro = (patch: Partial<GameContent["puzzleText"]["intro"]>) =>
    setContent({ ...content, puzzleText: { ...pt, intro: { ...pt.intro, ...patch } } });
  const setReveal = (patch: Partial<GameContent["puzzleText"]["reveal"]>) =>
    setContent({ ...content, puzzleText: { ...pt, reveal: { ...pt.reveal, ...patch } } });
  return (
    <div>
      <p style={help}>
        Copy for the <b>Puzzle boards</b>. The <b>intro</b> pops up over the board the first time the player launches the first
        puzzle level (auto-detected — whichever level first carries a puzzle image). The <b>reveal</b> texts show on the pop-up
        that lifts the finished picture off the board when the whole board is cleared.
      </p>

      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 8 }}>IN-GAME TIP PILL</div>
        <p style={help}>The little pill top-left of the board (every puzzle level) that reopens the briefing once the opening pop-up is dismissed.</p>
        <Field label="TIP pill label"><input style={{ ...input, width: 140 }} value={pt.tipLabel} onChange={(e) => setPt({ tipLabel: e.target.value })} /></Field>
      </div>

      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 8 }}>OPENING POP-UP</div>
        <div style={grid}>
          <Field label="Kicker"><input style={input} value={pt.intro.kicker} onChange={(e) => setIntro({ kicker: e.target.value })} /></Field>
          <Field label="Title"><input style={input} value={pt.intro.title} onChange={(e) => setIntro({ title: e.target.value })} /></Field>
        </div>
        {pt.intro.lines.map((line, i) => (
          <Field key={i} label={`Line ${i + 1}`} wide>
            <textarea style={area} rows={2} value={line} onChange={(e) => setIntro({ lines: pt.intro.lines.map((x, j) => (j === i ? e.target.value : x)) })} />
          </Field>
        ))}
        <Field label="Button"><input style={input} value={pt.intro.button} onChange={(e) => setIntro({ button: e.target.value })} /></Field>
      </div>

      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 8 }}>IMAGE-COMPLETE POP-UP</div>
        <div style={grid}>
          <Field label="Eyebrow"><input style={input} value={pt.reveal.eyebrow} onChange={(e) => setReveal({ eyebrow: e.target.value })} /></Field>
          <Field label="Button"><input style={input} value={pt.reveal.button} onChange={(e) => setReveal({ button: e.target.value })} /></Field>
        </div>
        <Field label="Caption (optional — a line under the picture)" wide>
          <textarea style={area} rows={2} value={pt.reveal.caption} onChange={(e) => setReveal({ caption: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

/* ============================== GAME SETTINGS ============================== */

function GameSettingsTab({ content, setContent }: TabProps) {
  const ss = content.settingsScreen as unknown as Record<string, string> & { sections: Record<string, string> };
  const set = (key: string, v: string) => setContent({ ...content, settingsScreen: { ...content.settingsScreen, [key]: v } as typeof content.settingsScreen });
  const setSection = (key: string, v: string) => setContent({ ...content, settingsScreen: { ...content.settingsScreen, sections: { ...content.settingsScreen.sections, [key]: v } } as typeof content.settingsScreen });
  return (
    <div>
      <p style={help}>
        Every text on the player's <b>Settings screen</b> (the cog in-game and on the home shell): the section rail labels, each
        setting's title + explanation, the option labels, and the reset-progress texts. The About section's title/tagline live
        under START SCREEN — they are shared.
      </p>
      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 8 }}>SECTION RAIL</div>
        <div style={grid}>
          {Object.entries(ss.sections).map(([k, v]) => (
            <Field key={k} label={k.toUpperCase()}>
              <input style={input} value={v} onChange={(e) => setSection(k, e.target.value)} />
            </Field>
          ))}
        </div>
      </div>
      {GS_GROUPS.map((g) => (
        <div key={g.title} style={card}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 8 }}>{g.title}</div>
          <div style={grid}>
            {g.fields.map(([key, label, long]) =>
              long ? (
                <Field key={key} label={label} wide>
                  <textarea style={area} rows={3} value={ss[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
                </Field>
              ) : (
                <Field key={key} label={label}>
                  <input style={input} value={ss[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
                </Field>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================== GAME SETTINGS END ============================== */

/* ============================== TUTORIAL LEVEL ============================== */

function TutorialTab({ content, setContent }: TabProps) {
  const t = content.tutorialLevel;
  const set = (patch: Partial<GameContent["tutorialLevel"]>) => setContent({ ...content, tutorialLevel: { ...t, ...patch } });
  const a = content.academyTips;
  const setA = (patch: Partial<GameContent["academyTips"]>) => setContent({ ...content, academyTips: { ...a, ...patch } });
  // reorder the tip pages — SLIDE ORDER only; the auto-open triggers find their
  // page by key, so moving a page never changes when it fires
  const movePage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= a.pages.length) return;
    const pages = [...a.pages];
    [pages[i], pages[j]] = [pages[j], pages[i]];
    setA({ pages });
  };
  return (
    <div>
      <p style={help}>
        The text panel of the scripted Tutorial (Level 0). The steps are fixed — each belongs to a scripted board action, so
        steps can be reworded but not added or removed here.
      </p>
      <div style={card}>
        <Field label="Opening log line" wide>
          <input style={input} value={t.intro} onChange={(e) => set({ intro: e.target.value })} />
        </Field>
      </div>
      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 8 }}>SEGMENT BANNERS</div>
        <p style={help}>
          The big sweeping banner that announces each chapter of the tutorial (played again as the board swaps underneath it).
        </p>
        <div style={grid}>
          {(["combos", "drifts", "banking", "clearing"] as const).map((k) => (
            <Field key={k} label={k.toUpperCase()}>
              <input
                style={{ ...input, width: 150 }}
                value={t.segments[k]}
                onChange={(e) => set({ segments: { ...t.segments, [k]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </div>
      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 8 }}>COMPLETION POP-UP</div>
        <p style={help}>
          The celebration shown the moment the Tutorial ends. It hands the player their first sticker (Blue Giant) and announces
          that Daily challenges, Collection, Achievements and the Shop are now unlocked.
        </p>
        <div style={grid}>
          <Field label="Kicker"><input style={input} value={t.completion.kicker} onChange={(e) => set({ completion: { ...t.completion, kicker: e.target.value } })} /></Field>
          <Field label="Title"><input style={input} value={t.completion.title} onChange={(e) => set({ completion: { ...t.completion, title: e.target.value } })} /></Field>
        </div>
        {t.completion.lines.map((line, i) => (
          <Field key={i} label={`Line ${i + 1}`} wide>
            <textarea style={area} rows={2} value={line} onChange={(e) => set({ completion: { ...t.completion, lines: t.completion.lines.map((x, j) => (j === i ? e.target.value : x)) } })} />
          </Field>
        ))}
        <div style={grid}>
          <Field label="Reward label"><input style={input} value={t.completion.rewardLabel} onChange={(e) => set({ completion: { ...t.completion, rewardLabel: e.target.value } })} /></Field>
          <Field label="Button"><input style={input} value={t.completion.button} onChange={(e) => set({ completion: { ...t.completion, button: e.target.value } })} /></Field>
        </div>
      </div>
      {t.steps.map((s, i) => (
        <div key={i} style={card}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 8 }}>
            STEP {i + 1} / {t.steps.length}
          </div>
          <textarea
            style={area}
            rows={3}
            value={s}
            onChange={(e) => set({ steps: t.steps.map((x, j) => (j === i ? e.target.value : x)) })}
          />
        </div>
      ))}

      <h3 style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.24em", color: "#9d7bff", margin: "26px 2px 8px" }}>
        THE ACADEMY TIPS (LEVEL 1)
      </h3>
      <p style={help}>
        The paged briefing in Level 1. Page <b>nebulite</b> auto-opens on the player's first Academy launch; page <b>rush</b>
        auto-opens the first time they reach GLINT RUSH there (and joins the cycle afterwards); <b>clearing</b> is always in the
        cycle. The in-game TIP pill re-opens the card any time. The ↑/↓ arrows set the SLIDE ORDER in the pop-up only — a page
        auto-opens at the same moments no matter where it sits.
      </p>
      <div style={card}>
        <div style={grid}>
          <Field label="TIP pill label"><input style={{ ...input, width: 120 }} value={a.tipLabel} onChange={(e) => setA({ tipLabel: e.target.value })} /></Field>
          <Field label="Button"><input style={input} value={a.button} onChange={(e) => setA({ button: e.target.value })} /></Field>
        </div>
      </div>
      {a.pages.map((pg, pi) => (
        <div key={pg.key} style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", flex: 1 }}>
              PAGE {pi + 1} · {pg.key.toUpperCase()}
            </div>
            <button style={mini} disabled={pi === 0} onClick={() => movePage(pi, -1)} title="Move this slide earlier">↑</button>
            <button style={mini} disabled={pi === a.pages.length - 1} onClick={() => movePage(pi, 1)} title="Move this slide later">↓</button>
          </div>
          <div style={grid}>
            <Field label="Kicker"><input style={input} value={pg.kicker} onChange={(e) => setA({ pages: a.pages.map((x, j) => (j === pi ? { ...x, kicker: e.target.value } : x)) })} /></Field>
            <Field label="Title"><input style={input} value={pg.title} onChange={(e) => setA({ pages: a.pages.map((x, j) => (j === pi ? { ...x, title: e.target.value } : x)) })} /></Field>
          </div>
          {pg.lines.map((line, i) => (
            <Field key={i} label={`Line ${i + 1}`} wide>
              <textarea style={area} rows={2} value={line} onChange={(e) => setA({ pages: a.pages.map((x, j) => (j === pi ? { ...x, lines: x.lines.map((y, k) => (k === i ? e.target.value : y)) } : x)) })} />
            </Field>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ================================ CHALLENGES ================================ */

const OBJ_TYPES = [
  "dross",
  "score",
  "bankscore", // biggest SINGLE bank (combo/chain incl. multiplier) — great daily material
  "nebulite",
  "fulldrift",
  "clear",
  "banks",
  "rush",
  "cashout",
  // chains banked (count): the two-Drift chain "turn" was formerly "sweep"
  "convergence",
  "harmony",
  "accord",
  "turn",
];

function ChallengesTab({ content, setContent }: TabProps) {
  const c = content.challenges;
  const set = (patch: Partial<GameContent["challenges"]>) => setContent({ ...content, challenges: { ...c, ...patch } });
  const bank = c.dailyBank;

  return (
    <div>
      <p style={help}>
        The <b>Challenges</b> tab. Three daily challenges are drawn from the <b>bank</b> below each day, the same three for every
        player (seeded by the date — no server). Each objective is evaluated by its <b>type</b>; the text and target are yours to write.
        Boolean types (bank a Full Drift, clear a board, reach GLINT RUSH…) use target 1. The <b>reward</b> is either <b>Nebulite</b> (the
        currency — a flat payout on completion) or a specific <b>Collection item</b> you pick (a sticker, music track or board theme), which
        is granted on completion. Milestones are lifetime count-ups — their thresholds and per-tier rewards live here too.
      </p>

      <div style={card}>
        <div style={grid}>
          <Field label="Daily section label"><input style={input} value={c.dailyLabel} onChange={(e) => set({ dailyLabel: e.target.value })} /></Field>
          <Field label="Reset prefix"><input style={input} value={c.resetPrefix} onChange={(e) => set({ resetPrefix: e.target.value })} /></Field>
          <Field label="Done label"><input style={input} value={c.doneLabel} onChange={(e) => set({ doneLabel: e.target.value })} /></Field>
          <Field label="Quick play button"><input style={input} value={c.quickPlay} onChange={(e) => set({ quickPlay: e.target.value })} /></Field>
          <Field label="Milestones label"><input style={input} value={c.milestonesLabel} onChange={(e) => set({ milestonesLabel: e.target.value })} /></Field>
          <Field label="Milestones sub-label"><input style={input} value={c.milestonesSub} onChange={(e) => set({ milestonesSub: e.target.value })} /></Field>
          <Field label="Next-on-Ascent label"><input style={input} value={c.ascentLabel} onChange={(e) => set({ ascentLabel: e.target.value })} /></Field>
          <Field label="'Next up' tag"><input style={input} value={c.nextUp} onChange={(e) => set({ nextUp: e.target.value })} /></Field>
          <Field label="Play button"><input style={input} value={c.play} onChange={(e) => set({ play: e.target.value })} /></Field>
          <Field label="Empty bank message" wide><input style={input} value={c.emptyBank} onChange={(e) => set({ emptyBank: e.target.value })} /></Field>
        </div>
      </div>

      <p style={{ ...help, marginBottom: 8 }}><b>DAILY CHALLENGE BANK</b> — {bank.length} entries. Three are drawn per day.</p>
      {bank.map((b, i) => (
        <div key={i} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Type">
              <select style={{ ...input, width: 120 }} value={b.type} onChange={(e) => set({ dailyBank: bank.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>
                {OBJ_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Target"><NumField value={b.target} min={1} max={999999} onCommit={(n) => set({ dailyBank: bank.map((x, j) => (j === i ? { ...x, target: n } : x)) })} /></Field>
            <Field label="Icon">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#9d7bff", display: "grid", placeItems: "center" }}><Glyph name={b.icon || b.type} size={18} /></span>
                <select style={{ ...input, width: 110 }} value={b.icon ?? ""} onChange={(e) => set({ dailyBank: bank.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })}>
                  <option value="">auto (type)</option>
                  {GLYPH_KEYS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </Field>
            <Field label="Reward">
              <select style={{ ...input, width: 130 }} value={b.rewardKind} onChange={(e) => set({ dailyBank: bank.map((x, j) => (j === i ? { ...x, rewardKind: e.target.value, rewardId: e.target.value === "nebulite" ? "" : x.rewardId } : x)) })}>
                <option value="nebulite">✦ Nebulite ({content.challenges.nebulitePerDaily ?? 5})</option>
                <option value="sticker">Sticker</option>
                <option value="music">Music track</option>
                <option value="theme">Board theme</option>
              </select>
            </Field>
            {b.rewardKind !== "nebulite" && (
              <Field label="Collection item">
                <select style={{ ...input, width: 150 }} value={b.rewardId} onChange={(e) => set({ dailyBank: bank.map((x, j) => (j === i ? { ...x, rewardId: e.target.value } : x)) })}>
                  <option value="">— pick an item —</option>
                  {b.rewardKind === "sticker" && content.collection.stickers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  {b.rewardKind === "music" && content.collection.music.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                  {b.rewardKind === "theme" && content.collection.themes.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
              </Field>
            )}
            <span style={{ flex: 1 }} />
            <button style={{ ...mini, color: "#ff9aac", borderColor: "rgba(255,90,120,0.35)" }} onClick={() => set({ dailyBank: bank.filter((_, j) => j !== i) })}>delete</button>
          </div>
          <Field label="Challenge text" wide>
            <input style={input} value={b.text} onChange={(e) => set({ dailyBank: bank.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          </Field>
        </div>
      ))}
      <button style={{ ...primary, marginBottom: 20 }} onClick={() => set({ dailyBank: [...bank, { id: "c" + Date.now().toString(36), type: "score", target: 8000, text: "Reach 8,000 in one game", rewardKind: "nebulite", rewardId: "", icon: "" }] })}>
        + Add challenge
      </button>

      <p style={{ ...help, marginBottom: 8 }}>
        <b>MILESTONES</b> — lifetime count-ups. Each tier is a row: the <b>threshold</b> the tally must reach, and the <b>reward</b>
        crossing it grants — ✦ Nebulite (with the amount) or a specific Collection item. These are REAL grants at run end.
      </p>
      {c.milestones.map((m, i) => {
        const setM = (patch: Partial<(typeof c.milestones)[number]>) => set({ milestones: c.milestones.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
        const tiers = m.tiers ?? [];
        const setTier = (ti: number, patch: Partial<(typeof tiers)[number]>) => setM({ tiers: tiers.map((t, tj) => (tj === ti ? { ...t, ...patch } : t)) });
        return (
          <div key={m.key} style={card}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 10 }}>{m.key}</div>
            <div style={{ marginBottom: 10 }}>
              <Field label="Display name"><input style={{ ...input, width: 220 }} value={m.name} onChange={(e) => setM({ name: e.target.value })} /></Field>
            </div>
            {tiers.map((t, ti) => (
              <div key={ti} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 6 }}>
                <Field label={ti === 0 ? "Threshold" : ""}><NumField value={t.threshold} min={1} max={999999} onCommit={(n) => setTier(ti, { threshold: n })} /></Field>
                <Field label={ti === 0 ? "Reward" : ""}>
                  <select style={{ ...input, width: 130 }} value={t.rewardKind} onChange={(e) => setTier(ti, { rewardKind: e.target.value, rewardId: "" })}>
                    <option value="nebulite">✦ Nebulite</option>
                    <option value="sticker">Sticker</option>
                    <option value="music">Music track</option>
                    <option value="theme">Board theme</option>
                  </select>
                </Field>
                {t.rewardKind === "nebulite" ? (
                  <Field label={ti === 0 ? "Amount" : ""}><NumField value={t.amount} min={1} max={9999} onCommit={(n) => setTier(ti, { amount: n })} /></Field>
                ) : (
                  <Field label={ti === 0 ? "Item" : ""}>
                    <select style={{ ...input, width: 170 }} value={t.rewardId} onChange={(e) => setTier(ti, { rewardId: e.target.value })}>
                      <option value="">— pick an item —</option>
                      {t.rewardKind === "sticker" && content.collection.stickers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      {t.rewardKind === "music" && content.collection.music.map((mu) => <option key={mu.key} value={mu.key}>{mu.name}</option>)}
                      {t.rewardKind === "theme" && content.collection.themes.map((th) => <option key={th.key} value={th.key}>{th.name}</option>)}
                    </select>
                  </Field>
                )}
                <button style={{ ...mini, color: "#ff9aac", borderColor: "rgba(255,90,120,0.35)", marginBottom: 8 }} onClick={() => setM({ tiers: tiers.filter((_, tj) => tj !== ti) })}>delete</button>
              </div>
            ))}
            <button
              style={mini}
              onClick={() => setM({ tiers: [...tiers, { threshold: (tiers[tiers.length - 1]?.threshold ?? 0) * 2 || 5, rewardKind: "nebulite", rewardId: "", amount: 10 * (tiers.length + 1) }] })}
            >
              + add tier
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ============================== ACHIEVEMENTS ============================== */

function AchievementsTab({ content, setContent }: TabProps) {
  const a = content.achievements;
  const set = (patch: Partial<GameContent["achievements"]>) => setContent({ ...content, achievements: { ...a, ...patch } });
  return (
    <div>
      <p style={help}>
        The <b>Achievements</b> tab. Lifetime stat tiles, the HIGH SCORES section, and the REWARDS gem case. Stat and reward <b>keys</b>
        map to the game's tracking and are fixed — you edit the labels, names and descriptions. Reward gem shapes/colours are set in code.
      </p>
      <div style={card}>
        <div style={grid}>
          <Field label="Lifetime label"><input style={input} value={a.lifetimeLabel} onChange={(e) => set({ lifetimeLabel: e.target.value })} /></Field>
          <Field label="High scores label"><input style={input} value={a.highScoresLabel} onChange={(e) => set({ highScoresLabel: e.target.value })} /></Field>
          <Field label="'Show all'"><input style={input} value={a.showAll} onChange={(e) => set({ showAll: e.target.value })} /></Field>
          <Field label="'Show less'"><input style={input} value={a.showLess} onChange={(e) => set({ showLess: e.target.value })} /></Field>
          <Field label="Rewards label"><input style={input} value={a.rewardsLabel} onChange={(e) => set({ rewardsLabel: e.target.value })} /></Field>
          <Field label="No-scores message" wide><input style={input} value={a.noScores} onChange={(e) => set({ noScores: e.target.value })} /></Field>
        </div>
      </div>

      <p style={{ ...help, marginBottom: 8 }}><b>STAT TILES</b> — the six lifetime stats.</p>
      <div style={card}>
        {a.stats.map((s, i) => (
          <div key={s.key} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#857fab", width: 130 }}>{s.key}</span>
            <input style={{ ...input, flex: 1 }} value={s.label} onChange={(e) => set({ stats: a.stats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
          </div>
        ))}
      </div>

      {/* ABILITY UNLOCK pop-up — the game-end reward card for the three bonus gems */}
      {a.abilityUnlock && (
        <>
          <p style={{ ...help, marginBottom: 8 }}><b>ABILITY UNLOCK POP-UP</b> — shown at game end when a run first earns a bonus gem (Resurrect / Quadriant / Zenith). Two at once show side by side.</p>
          <div style={card}>
            <div style={grid}>
              <Field label="Title (one)"><input style={input} value={a.abilityUnlock.titleOne} onChange={(e) => set({ abilityUnlock: { ...a.abilityUnlock, titleOne: e.target.value } })} /></Field>
              <Field label="Title (two or more)"><input style={input} value={a.abilityUnlock.titleMany} onChange={(e) => set({ abilityUnlock: { ...a.abilityUnlock, titleMany: e.target.value } })} /></Field>
              <Field label="Sub-line"><input style={input} value={a.abilityUnlock.sub} onChange={(e) => set({ abilityUnlock: { ...a.abilityUnlock, sub: e.target.value } })} /></Field>
              <Field label="Continue button"><input style={input} value={a.abilityUnlock.continueBtn} onChange={(e) => set({ abilityUnlock: { ...a.abilityUnlock, continueBtn: e.target.value } })} /></Field>
            </div>
            {a.abilityUnlock.gems.map((g, gi) => (
              <div key={g.key} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #23263b" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "#9d7bff", marginBottom: 6 }}>{g.key}</div>
                <div style={grid}>
                  <Field label="Gem name"><input style={input} value={g.gemName} onChange={(e) => set({ abilityUnlock: { ...a.abilityUnlock, gems: a.abilityUnlock.gems.map((x, j) => (j === gi ? { ...x, gemName: e.target.value } : x)) } })} /></Field>
                  <Field label="What it does (one line)" wide><textarea style={area} rows={2} value={g.blurb} onChange={(e) => set({ abilityUnlock: { ...a.abilityUnlock, gems: a.abilityUnlock.gems.map((x, j) => (j === gi ? { ...x, blurb: e.target.value } : x)) } })} /></Field>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ ...help, marginBottom: 8 }}><b>REWARDS</b> — the achievement gems (name + description). The ↑/↓ arrows set the order they appear in the gem case. Gem shapes/colours are set in code.</p>
      {a.rewards.map((r, i) => (
        <div key={r.key} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "#9d7bff", flex: 1 }}>{i + 1} · {r.key}</div>
            <button style={mini} disabled={i === 0} onClick={() => set({ rewards: moveItem(a.rewards, i, -1) })} title="Move earlier">↑</button>
            <button style={mini} disabled={i === a.rewards.length - 1} onClick={() => set({ rewards: moveItem(a.rewards, i, 1) })} title="Move later">↓</button>
          </div>
          <div style={grid}>
            <Field label="Name"><input style={input} value={r.name} onChange={(e) => set({ rewards: a.rewards.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></Field>
            <Field label="Description" wide><input style={input} value={r.desc} onChange={(e) => set({ rewards: a.rewards.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })} /></Field>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Swap element i with its neighbour in direction dir (−1 up / +1 down). */
function moveItem<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/* ================================ COLLECTION ================================ */

// select options (kept in sync with theme/regions.ts + audio/music.ts by hand)
const REGION_OPTS = ["", "Machina Forge", "Fringe Market", "Corporate Spire", "Military Bastion", "Shadow Sector", "Divinity Enclave", "Digital Nexus"];
const THEME_OPTS = ["generic", "Interstellar", "Machina Forge", "Shadow Sector", "Corporate Spire", "Digital Nexus", "Fringe Market", "Divinity Enclave", "Military Bastion"];
const DECOR_EFFECTS = ["horizonPlanet", "asteroids", "probe", "stardust", "embers", "comets", "aurora", "nebulaPulse", "grid", "orbitalRing", "customProp", "customPattern"];
const DECOR_KINDS = ["prop", "particle", "light", "pattern"];

function fileToDataUri(file: File, cb: (uri: string) => void) {
  const r = new FileReader();
  r.onload = () => cb(String(r.result));
  r.readAsDataURL(file);
}

// a quick PROCEDURAL placeholder (not AI) — a small SVG data-URI keyed by kind,
// so the "auto-generate" button always produces usable art to iterate on
/** Placeholder decor art. Uses the item's COLOUR and its kind-specific dial
 *  (density / intensity / tile size / prop size), and re-rolls until the result
 *  differs from every other decor item's art — no two auto-generates alike. */
function autoDecorArt(kind: string, color: string, option: string, existing: string[]): string {
  const col = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#9d7bff";
  const gen = (salt: number): string => {
    const r = (a: number, b: number) => (a + Math.random() * (b - a)).toFixed(1);
    let body = "";
    if (kind === "pattern") {
      // tile size dial: big = few large motifs, small = many fine ones
      const n = option === "big" ? 18 + salt : option === "small" ? 64 + salt : 40 + salt;
      const rad = option === "big" ? [1.6, 3.4] : option === "small" ? [0.4, 1.1] : [0.6, 1.6];
      body = `<rect width='120' height='120' fill='#0a0812'/>` + Array.from({ length: n }, () => `<circle cx='${r(0, 120)}' cy='${r(0, 120)}' r='${r(rad[0], rad[1])}' fill='${col}' opacity='${r(0.3, 0.9)}'/>`).join("");
    } else if (kind === "light") {
      const op = option === "high" ? 0.95 : option === "low" ? 0.45 : 0.75;
      const rr = option === "high" ? 58 : option === "low" ? 40 : 50;
      body = `<defs><radialGradient id='g'><stop offset='0' stop-color='${col}' stop-opacity='${op}'/><stop offset='1' stop-color='${col}' stop-opacity='0'/></radialGradient></defs><rect width='120' height='120' fill='#0a0812'/><circle cx='${r(52, 68)}' cy='${r(52, 68)}' r='${rr + salt}' fill='url(#g)'/>`;
    } else if (kind === "particle") {
      const n = (option === "high" ? 36 : option === "low" ? 12 : 22) + salt;
      body = `<rect width='120' height='120' fill='#0a0812'/>` + Array.from({ length: n }, () => `<circle cx='${r(0, 120)}' cy='${r(0, 120)}' r='1.4' fill='${col}' opacity='${r(0.4, 1)}'/>`).join("");
    } else {
      const rad = (option === "big" ? 44 : option === "small" ? 24 : 34) + salt;
      body = `<rect width='120' height='120' fill='#0a0812'/><circle cx='60' cy='64' r='${rad}' fill='${col}'/><ellipse cx='60' cy='${64 - rad * 0.18}' rx='${rad * 0.42}' ry='${rad * 0.24}' fill='#fff' opacity='.35'/>`;
    }
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>${body}</svg>`);
  };
  // distinctness: re-roll (with a growing structural salt) until it matches no
  // other decor item's art
  for (let attempt = 0; attempt < 8; attempt++) {
    const uri = gen(attempt);
    if (!existing.includes(uri)) return uri;
  }
  return gen(Math.floor(Math.random() * 99));
}

// EVERY way a Collection item can be wired to something (so it's earnable in-game),
// resolved to one clear flag. Green = wired; amber = NOT wired (manual only —
// unreachable). Covers: challenge/milestone rewards, level-unlock, and feat triggers.
function wiringStatus(challengeRef: string | null | undefined, t: { trigger?: string; target?: number; scope?: string }): { wired: boolean; label: string; detail: string } {
  if (challengeRef) return { wired: true, label: "CHALLENGE REWARD", detail: `granted by ${challengeRef} — the feat trigger is ignored while that link exists` };
  const tr = t.trigger || "";
  if (tr === "level") return { wired: true, label: "LEVEL UNLOCK", detail: `earned when level ${t.target ?? "?"} unlocks (this board cleared)` };
  if (tr) return { wired: true, label: "AUTO-GRANT", detail: `when ${tr} ≥ ${t.target ?? "?"} · ${t.scope === "total" ? "lifetime total" : "one run"}` };
  return { wired: false, label: "manual only", detail: "not linked to anything — the player can never earn this in-game" };
}

function WiringBadge({ st }: { st: { wired: boolean; label: string; detail: string } }) {
  const c = st.wired
    ? { bg: "rgba(52,217,139,0.08)", bd: "rgba(52,217,139,0.32)", fg: "#5fd39b" }
    : { bg: "rgba(232,150,63,0.10)", bd: "rgba(232,150,63,0.42)", fg: "#eaa24d" };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, marginBottom: 4, padding: "6px 11px", borderRadius: 8, background: c.bg, border: `1px solid ${c.bd}` }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: c.fg }}>{st.wired ? "● WIRED" : "○ NOT WIRED"} · {st.label}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: "#857fab" }}>{st.detail}</span>
    </div>
  );
}

// the auto-grant feat picker, shared by board themes, music tracks and stickers.
// The wiring badge above shows the resolved link; when the item is a CHALLENGE'S
// reward the feat trigger is ignored, so the editable picker is hidden.
function TriggerRow({ t, onChange, challengeRef }: { t: { trigger: string; target: number; scope: string }; onChange: (patch: Partial<{ trigger: string; target: number; scope: string }>) => void; challengeRef?: string | null }) {
  if (challengeRef) return <WiringBadge st={wiringStatus(challengeRef, t)} />;
  return (
    <>
    <WiringBadge st={wiringStatus(null, t)} />
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 4 }}>
      <Field label="Auto-grant when">
        <select style={{ ...input, width: 120 }} value={t.trigger} onChange={(e) => onChange({ trigger: e.target.value })}>
          <option value="">— manual only —</option>
          <option value="level">level (unlock)</option>
          {OBJ_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </Field>
      {/* Target + Scope only when they apply: "level" needs just the level number,
          a feat needs target + run/lifetime scope, "manual only" needs neither. */}
      {t.trigger === "level" && <Field label="Level #"><NumField value={t.target} min={1} max={999} onCommit={(n) => onChange({ target: n })} /></Field>}
      {t.trigger && t.trigger !== "level" && (
        <>
          <Field label="Target"><NumField value={t.target} min={1} max={999999} onCommit={(n) => onChange({ target: n })} /></Field>
          <Field label="Scope">
            <select style={{ ...input, width: 130 }} value={t.scope} onChange={(e) => onChange({ scope: e.target.value })}>
              <option value="run">in one run</option>
              <option value="total">lifetime total</option>
            </select>
          </Field>
        </>
      )}
      <span style={{ flex: 1, fontFamily: MONO, fontSize: 10, color: "#6b6690", paddingBottom: 8 }}>
        {t.trigger === "level" ? "earns when that level unlocks" : t.trigger ? "earns automatically when the player hits this feat" : "not earnable in-game — pick a trigger to wire it"}
      </span>
    </div>
    </>
  );
}

/** Keyword field + suggestion chips + auto-generate for a theme/music thumbnail.
 *  Each press re-rolls a salt so "auto-generate" always overwrites with a fresh
 *  take (no old copies kept). The preview is the row's existing <img>. */
function ThumbGen({ defaultKeywords, onGenerate }: { defaultKeywords: string; onGenerate: (keywords: string, salt: number) => Promise<string> }) {
  const [kw, setKw] = useState(defaultKeywords);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const saltRef = useRef(0);
  const run = async () => {
    if (busy) return;
    saltRef.current += 1;
    setBusy(true);
    setMsg("⏳ generating via getimg.ai…");
    try {
      setMsg(await onGenerate(kw, saltRef.current)); // resolves to the ✓/✕ outcome line
    } catch (e) {
      setMsg(`✕ FAILED — ${(e as Error).message || String(e)} (details in the browser console)`);
      console.error("[getimg] auto-generate threw:", e);
    } finally {
      setBusy(false);
    }
  };
  const tone = msg?.startsWith("✕") ? "#ff9aac" : msg?.startsWith("✓") ? "#7fe9a5" : "#9d7bff";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
      <Field label="Auto-generate keywords — board theme = colour · music = vibe (pre-filled; edit freely)" wide>
        <input style={input} value={kw} placeholder="e.g. neon, retro, candy" onChange={(e) => setKw(e.target.value)} />
      </Field>
      <button
        style={{ ...mini, color: busy ? "#7c8" : "#a8e6ff", borderColor: "rgba(127,233,242,0.4)", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}
        disabled={busy}
        onClick={run}
      >
        {busy ? "generating…" : "auto-generate"}
      </button>
      {msg && <div style={{ width: "100%", fontSize: 10.5, lineHeight: 1.4, marginTop: 1, color: tone, wordBreak: "break-word" }}>{msg}</div>}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", width: "100%" }}>
        {THUMB_KEYWORD_SUGGESTIONS.map((s) => (
          <button key={s} style={{ ...mini, fontSize: 9, padding: "2px 7px", opacity: 0.8 }} onClick={() => setKw((k) => (k.trim() ? k.trim() + ", " + s : s))}>+ {s}</button>
        ))}
      </div>
    </div>
  );
}

function CollectionTab({ content, setContent }: TabProps) {
  const c = content.collection;
  const set = (patch: Partial<GameContent["collection"]>) => setContent({ ...content, collection: { ...c, ...patch } });
  const themes = c.themes;
  const music = c.music;
  const ascent = c.ascent ?? [];
  const sectors = c.sectors;
  const stickers = c.stickers;
  const upd = <T,>(arr: T[], i: number, patch: Partial<T>): T[] => arr.map((x, j) => (j === i ? { ...x, ...patch } : x));

  // items already promised as CHALLENGE rewards — their feat triggers lock
  const challengeRefs = (() => {
    const map = new Map<string, string>();
    content.challenges.dailyBank.forEach((b) => {
      if (b.rewardKind !== "nebulite" && b.rewardId) map.set(`${b.rewardKind}:${b.rewardId}`, `the daily "${b.id}"`);
    });
    content.challenges.milestones.forEach((m) => {
      (m.tiers ?? []).forEach((t, ti) => {
        if (t.rewardKind !== "nebulite" && t.rewardId) map.set(`${t.rewardKind}:${t.rewardId}`, `the "${m.name}" milestone (tier ${ti + 1})`);
      });
    });
    return map;
  })();

  // ---- sticker art uploads: resize → WebP/PNG → commit to public/stickers/ ----
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetMsg, setAssetMsg] = useState<string | null>(null);
  // instant preview for a freshly-generated thumbnail (the committed file only
  // serves after the deploy, so show the data-URI now). Keyed by scope+index
  // ("d12"/"t3"/"m5") so themes/music/decor rows don't collide.
  const [thumbPrev, setThumbPrev] = useState<Record<string, string>>({});
  // (the decor model/thumbnail auto-generate is retired — Ascent thumbnails are
  // rendered in-situ from the 3D scene by scripts/ascent-thumbs.mjs)

  // THEME / MUSIC illustration: generate via getimg.ai (through the Worker proxy)
  // and commit the result as a file; if the proxy isn't configured or the call
  // fails (e.g. the key expired), fall back to the built-in procedural art.
  // returns the outcome message so the calling button shows it RIGHT THERE (the section-
  // level assetMsg is also set, but it renders far down the page).
  const genIllustration = async (kind: "themes" | "music", i: number, keywords: string, salt: number): Promise<string> => {
    const list = (kind === "themes" ? themes : music) as Array<{ key: string; name: string; region?: string; sub?: string; image: string }>;
    const item = list[i];
    const kindS = kind === "themes" ? "theme" : "music";
    const s = loadSettings();
    // getimg.ai (via the Worker proxy) is the ONLY way these illustrations are made — there
    // is NO procedural fallback. If anything is wrong, we SURFACE it (message + console) and
    // leave the current image untouched, rather than silently writing placeholder art.
    const gi = getimgCfg(s);
    if (!getimgConfigured(gi)) {
      const m = "✕ No getimg proxy URL set — add it under Settings › getimg proxy URL, then try again.";
      setAssetMsg(m); console.warn("[getimg] skipped: proxy URL not configured in Settings."); return m;
    }
    if (!s.token) { const m = "✕ No GitHub token set — add one under SETTINGS first."; setAssetMsg(m); return m; }
    setAssetBusy(true);
    setAssetMsg(`generating ${item.key} illustration via getimg.ai…`);
    try {
      const uri = await generateThumb(gi, { kind: kindS, name: item.name, keywords, region: item.region, aspect: kind === "themes" ? "3:2" : "1:1", seed: salt });
      setThumbPrev((p) => ({ ...p, [(kind === "themes" ? "t" : "m") + i]: uri })); // instant preview
      const ext = (uri.slice(5, uri.indexOf(";")).split("/")[1] || "webp").replace(/[^a-z0-9]/gi, "");
      const id = (item.key || kindS).replace(/[^a-z0-9_-]/gi, "").toLowerCase() || kindS;
      // singular prefix so a re-roll OVERWRITES the shipped file (theme-*/music-*)
      // rather than orphaning it under a new name.
      const path = `public/collection-thumbs/${kindS}-${id}.${ext}`;
      setAssetMsg(`committing ${kindS}-${id}.${ext} to GitHub…`);
      await publishBinaryFiles(s, [{ path, base64: uri.split(",")[1] }], `CMS: ${kindS} illustration — ${id}`);
      set({ [kind]: upd(list, i, { image: `/collection-thumbs/${kindS}-${id}.${ext}` }) } as never);
      const done = `✓ ${id} illustration committed — serves once the deploy lands (~1 min).`;
      setAssetMsg(done); return done;
    } catch (e) {
      // NO fallback — report exactly why and leave the existing image in place.
      const msg = (e as Error).message || String(e);
      const m = `✕ getimg FAILED — ${msg}. The image was NOT changed (details in the browser console).`;
      setAssetMsg(m); console.error("[getimg] auto-generate failed:", e); return m;
    } finally {
      setAssetBusy(false);
    }
  };
  // freshly uploaded earned art, kept per sticker id so auto-outline works
  // immediately (the /stickers/ URL only resolves after the next deploy)
  const freshArtRef = useRef<Record<string, HTMLImageElement>>({});

  const stickerAssetId = (i: number) => ((stickers[i].id || "sticker").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "sticker");

  const commitStickerArt = async (i: number, field: "image" | "outline", canvas: HTMLCanvasElement) => {
    const cfg = loadSettings();
    if (!cfg.token) {
      setAssetMsg("No GitHub token set — add one under SETTINGS first.");
      return;
    }
    const id = stickerAssetId(i);
    setAssetBusy(true);
    try {
      const { base64, ext } = await encodeCanvas(canvas);
      setAssetMsg(`committing ${id}-${field}.${ext} to GitHub…`);
      await publishBinaryFiles(cfg, [{ path: `public/stickers/${id}-${field}.${ext}`, base64 }], `CMS: sticker art — ${id} ${field}`);
      set({ stickers: upd(stickers, i, { [field]: `/stickers/${id}-${field}.${ext}` } as Partial<(typeof stickers)[number]>) });
      setAssetMsg(`✓ ${id}-${field}.${ext} committed — it serves once the deploy lands (~1 min). Publish the content when you're done editing.`);
    } catch (e) {
      setAssetMsg(`upload failed: ${(e as Error).message}`);
    }
    setAssetBusy(false);
  };

  const uploadStickerFile = async (i: number, field: "image" | "outline", file: File) => {
    setAssetMsg(`processing ${file.name}…`);
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      if (field === "image") freshArtRef.current[stickerAssetId(i)] = img;
      await commitStickerArt(i, field, drawContained(img));
    } catch (e) {
      setAssetMsg(`upload failed: ${(e as Error).message}`);
      setAssetBusy(false);
    }
  };

  const autoOutline = async (i: number) => {
    const s = stickers[i];
    setAssetMsg("deriving the outline…");
    try {
      // prefer the art uploaded this session (its URL may not be deployed yet)
      const img = freshArtRef.current[stickerAssetId(i)] ?? (s.image ? await loadImage(s.image) : null);
      if (!img) {
        setAssetMsg("Add or upload the earned image first — the outline is derived from it.");
        return;
      }
      await commitStickerArt(i, "outline", outlineFromImage(img));
    } catch {
      setAssetMsg("couldn't read that image (cross-origin host?) — upload the file here first, then auto-outline.");
      setAssetBusy(false);
    }
  };
  const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const out = [...arr];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };

  // ---- theme / music THUMBNAILS: cover-crop → WebP/PNG → commit to public/thumbs/ ----
  // Themes get the card's banner ratio; music gets a square chip.
  const uploadThumb = async (kind: "themes" | "music", i: number, file: File) => {
    const cfg = loadSettings();
    if (!cfg.token) {
      setAssetMsg("No GitHub token set — add one under SETTINGS first.");
      return;
    }
    const item = (kind === "themes" ? themes[i] : music[i]) as { key: string };
    const id = (item.key || kind).replace(/[^a-z0-9_-]/gi, "").toLowerCase() || kind;
    setAssetBusy(true);
    try {
      setAssetMsg(`processing ${file.name}…`);
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      const canvas = kind === "themes" ? drawCover(img, 512, 232) : drawCover(img, 256, 256);
      const { base64, ext } = await encodeCanvas(canvas);
      const path = `public/thumbs/${kind}-${id}.${ext}`;
      setAssetMsg(`committing ${path.split("/").pop()} to GitHub…`);
      await publishBinaryFiles(cfg, [{ path, base64 }], `CMS: ${kind} thumbnail — ${id}`);
      const uri = `/thumbs/${kind}-${id}.${ext}`;
      if (kind === "themes") set({ themes: upd(themes, i, { image: uri }) });
      else set({ music: upd(music, i, { image: uri }) });
      setAssetMsg(`✓ ${path.split("/").pop()} committed — it serves once the deploy lands (~1 min). Publish the content when you're done editing.`);
    } catch (e) {
      setAssetMsg(`upload failed: ${(e as Error).message}`);
    }
    setAssetBusy(false);
  };

  // (the decor .glb upload / procedural prop generator is retired with the old decor set-up)

  return (
    <div>
      <p style={help}>
        The <b>Collection</b> tab. <b>CUSTOMISE</b> is a gallery of board themes + music tracks; players slot music from Settings and
        equip a board theme here. The <b>STICKER BOOK</b> is one long scrolling voyage — <b>sectors</b> are its chapters and each
        <b> sticker</b> is a stop along the path. Give a sticker an <b>image</b> (earned art) + <b>outline</b> (its empty slot) as image
        URLs, and a <b>requirement</b> line (the hint shown until it's earned). Leave images blank to use the built-in placeholders.
        Set an <b>auto-grant</b> feat (e.g. sweep 8 Dross in one run, or clear 5 boards lifetime) and the sticker unlocks itself the
        moment a player hits it. The <b>unlocked</b> flag seeds what every player already owns from the start.
      </p>

      <div style={card}>
        <div style={grid}>
          <Field label="Customise sub-tab"><input style={input} value={c.customiseLabel} onChange={(e) => set({ customiseLabel: e.target.value })} /></Field>
          <Field label="Sticker Book sub-tab"><input style={input} value={c.stickerLabel} onChange={(e) => set({ stickerLabel: e.target.value })} /></Field>
          <Field label="Board themes label"><input style={input} value={c.themesLabel} onChange={(e) => set({ themesLabel: e.target.value })} /></Field>
          <Field label="Music label"><input style={input} value={c.musicLabel} onChange={(e) => set({ musicLabel: e.target.value })} /></Field>
          <Field label="'Equipped' tag"><input style={input} value={c.equippedTag} onChange={(e) => set({ equippedTag: e.target.value })} /></Field>
          <Field label="'Equip' button"><input style={input} value={c.equipTag} onChange={(e) => set({ equipTag: e.target.value })} /></Field>
          <Field label="'Locked' tag"><input style={input} value={c.lockedTag} onChange={(e) => set({ lockedTag: e.target.value })} /></Field>
          <Field label="'Collected' word"><input style={input} value={c.collectedWord} onChange={(e) => set({ collectedWord: e.target.value })} /></Field>
        </div>
      </div>

      {/* BOARD THEMES */}
      <p style={{ ...help, marginBottom: 8 }}><b>BOARD THEMES</b> — {themes.length} entries. Region tints the board in-game; blank = the standard violet.</p>
      {themes.map((t, i) => (
        <div key={i} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Key"><input style={{ ...input, width: 90 }} value={t.key} onChange={(e) => set({ themes: upd(themes, i, { key: e.target.value }) })} /></Field>
            <Field label="Name"><input style={{ ...input, width: 150 }} value={t.name} onChange={(e) => set({ themes: upd(themes, i, { name: e.target.value }) })} /></Field>
            <Field label="Region">
              <select style={{ ...input, width: 150 }} value={t.region} onChange={(e) => set({ themes: upd(themes, i, { region: e.target.value }) })}>
                {REGION_OPTS.map((r) => <option key={r} value={r}>{r || "— standard —"}</option>)}
              </select>
            </Field>
            <Field label="Where">
              <select style={{ ...input, width: 110 }} value={t.source} onChange={(e) => set({ themes: upd(themes, i, { source: e.target.value }) })}>
                <option value="collection">Collection</option>
                <option value="shop">Shop</option>
              </select>
            </Field>
            {t.source === "shop" && <Field label="Price ✦"><NumField value={t.price} min={0} max={999999} onCommit={(n) => set({ themes: upd(themes, i, { price: n }) })} /></Field>}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: "#857fab", paddingBottom: 8 }}>
              <input type="checkbox" checked={t.unlocked} onChange={(e) => set({ themes: upd(themes, i, { unlocked: e.target.checked }) })} /> unlocked
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: "#c9a94a", paddingBottom: 8 }}>
              <input type="checkbox" checked={!!t.standard} onChange={(e) => set({ themes: upd(themes, i, { standard: e.target.checked }) })} /> standard
            </label>
            <span style={{ flex: 1 }} />
            <button style={{ ...mini, color: "#ff9aac", borderColor: "rgba(255,90,120,0.35)" }} onClick={() => set({ themes: themes.filter((_, j) => j !== i) })}>delete</button>
          </div>
          <TriggerRow t={t} onChange={(patch) => set({ themes: upd(themes, i, patch as Partial<(typeof themes)[number]>) })} challengeRef={challengeRefs.get(`theme:${t.key}`)} />
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
            <Field label="Thumbnail (optional — the standard preview shows when empty)" wide>
              <input style={input} value={t.image ?? ""} placeholder="upload a file, or paste an image URL" onChange={(e) => set({ themes: upd(themes, i, { image: e.target.value }) })} />
            </Field>
            <label style={{ ...mini, cursor: "pointer", opacity: assetBusy ? 0.5 : 1 }}>
              upload
              <input type="file" accept="image/*" disabled={assetBusy} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadThumb("themes", i, f); e.target.value = ""; }} />
            </label>
            {(thumbPrev["t" + i] || t.image) && <img src={thumbPrev["t" + i] || t.image} alt="" style={{ width: 75, height: 34, borderRadius: 8, objectFit: "cover", border: "1px solid #2c2f4a" }} />}
            {t.image && <button style={mini} title="Remove — back to the standard preview" onClick={() => set({ themes: upd(themes, i, { image: "" }) })}>×</button>}
          </div>
          <ThumbGen defaultKeywords={colourPhrase(t.region, t.name)} onGenerate={(kw, salt) => genIllustration("themes", i, kw, salt)} />
        </div>
      ))}
      <button style={{ ...primary, marginBottom: 20 }} onClick={() => set({ themes: [...themes, { key: "t" + Date.now().toString(36), name: "New theme", region: "", unlocked: false, trigger: "", target: 1, scope: "total", source: "collection", price: 0, standard: false, image: "", desc: "" }] })}>+ Add board theme</button>

      {/* MUSIC */}
      <p style={{ ...help, marginBottom: 8 }}><b>MUSIC TRACKS</b> — {music.length} entries. Theme picks which generative track plays.</p>
      {music.map((m, i) => (
        <div key={i} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Key"><input style={{ ...input, width: 90 }} value={m.key} onChange={(e) => set({ music: upd(music, i, { key: e.target.value }) })} /></Field>
            <Field label="Name"><input style={{ ...input, width: 140 }} value={m.name} onChange={(e) => set({ music: upd(music, i, { name: e.target.value }) })} /></Field>
            <Field label="Sub-label"><input style={{ ...input, width: 130 }} value={m.sub} onChange={(e) => set({ music: upd(music, i, { sub: e.target.value }) })} /></Field>
            <Field label="Theme">
              <select style={{ ...input, width: 150 }} value={m.theme} onChange={(e) => set({ music: upd(music, i, { theme: e.target.value }) })}>
                {THEME_OPTS.map((th) => <option key={th} value={th}>{th}</option>)}
              </select>
            </Field>
            <Field label="Where">
              <select style={{ ...input, width: 110 }} value={m.source} onChange={(e) => set({ music: upd(music, i, { source: e.target.value }) })}>
                <option value="collection">Collection</option>
                <option value="shop">Shop</option>
              </select>
            </Field>
            {m.source === "shop" && <Field label="Price ✦"><NumField value={m.price} min={0} max={999999} onCommit={(n) => set({ music: upd(music, i, { price: n }) })} /></Field>}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: "#857fab", paddingBottom: 8 }}>
              <input type="checkbox" checked={m.unlocked} onChange={(e) => set({ music: upd(music, i, { unlocked: e.target.checked }) })} /> unlocked
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: "#c9a94a", paddingBottom: 8 }}>
              <input type="checkbox" checked={!!m.standard} onChange={(e) => set({ music: upd(music, i, { standard: e.target.checked }) })} /> standard
            </label>
            <span style={{ flex: 1 }} />
            <button style={{ ...mini, color: "#ff9aac", borderColor: "rgba(255,90,120,0.35)" }} onClick={() => set({ music: music.filter((_, j) => j !== i) })}>delete</button>
          </div>
          <TriggerRow t={m} onChange={(patch) => set({ music: upd(music, i, patch as Partial<(typeof music)[number]>) })} challengeRef={challengeRefs.get(`music:${m.key}`)} />
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
            <Field label="Thumbnail (optional — the note icon shows when empty)" wide>
              <input style={input} value={m.image ?? ""} placeholder="upload a file, or paste an image URL" onChange={(e) => set({ music: upd(music, i, { image: e.target.value }) })} />
            </Field>
            <label style={{ ...mini, cursor: "pointer", opacity: assetBusy ? 0.5 : 1 }}>
              upload
              <input type="file" accept="image/*" disabled={assetBusy} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadThumb("music", i, f); e.target.value = ""; }} />
            </label>
            {(thumbPrev["m" + i] || m.image) && <img src={thumbPrev["m" + i] || m.image} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", border: "1px solid #2c2f4a" }} />}
            {m.image && <button style={mini} title="Remove — back to the note icon" onClick={() => set({ music: upd(music, i, { image: "" }) })}>×</button>}
          </div>
          <ThumbGen defaultKeywords={m.sub || m.name} onGenerate={(kw, salt) => genIllustration("music", i, kw, salt)} />
        </div>
      ))}
      <button style={{ ...primary, marginBottom: 20 }} onClick={() => set({ music: [...music, { key: "m" + Date.now().toString(36), name: "New track", sub: "", theme: "generic", unlocked: false, trigger: "", target: 1, scope: "total", source: "collection", price: 0, standard: false, image: "", desc: "" }] })}>+ Add music track</button>

      {/* THE ASCENT — the 3D scene's elements (replaces the retired decor set-up) */}
      <p style={{ ...help, marginBottom: 8 }}>
        <b>THE ASCENT · SCENE</b> — {ascent.length} elements of the 3D background behind the level map, Shop-only. Each row is one scene
        element; here you edit only its <b>name</b>, <b>description</b> and <b>price</b> (plus <b>unlocked</b> for freebies). Everything visual —
        placement, motion, materials, effects — lives in the <b>3D editor</b> at <code style={code}>/demo.html</code>, and the thumbnails are rendered
        in-situ from the scene by <code style={code}>scripts/ascent-thumbs.mjs</code>. Players buy elements with Nebulite and switch them on in
        Settings › Decor. (The old decor items are retired; their data is archived under <code style={code}>collection.decor</code>.)
      </p>
      {ascent.map((a, i) => (
        <div key={a.key} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <img src={a.image} alt="" style={{ width: 46, height: 46, borderRadius: 9, objectFit: "cover", border: "1px solid #2c2f4a", flexShrink: 0 }} />
            <Field label="Element (scene)"><input style={{ ...input, width: 130, opacity: 0.6 }} value={a.element} readOnly title="Fixed — matches the scene object's name in the 3D editor" /></Field>
            <Field label="Name"><input style={{ ...input, width: 150 }} value={a.name} onChange={(e) => set({ ascent: upd(ascent, i, { name: e.target.value }) })} /></Field>
            <Field label="Price ✦"><NumField value={a.price} min={0} max={999999} onCommit={(n) => set({ ascent: upd(ascent, i, { price: n }) })} /></Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: "#857fab", paddingBottom: 8 }}>
              <input type="checkbox" checked={a.unlocked} onChange={(e) => set({ ascent: upd(ascent, i, { unlocked: e.target.checked }) })} /> unlocked
            </label>
            <Field label="Description" wide><input style={input} value={a.desc} onChange={(e) => set({ ascent: upd(ascent, i, { desc: e.target.value }) })} /></Field>
          </div>
        </div>
      ))}

      {/* SECTORS */}
      <p style={{ ...help, marginBottom: 8 }}><b>SECTORS</b> — {sectors.length} chapters of the voyage, top to bottom. Stickers point at a sector by its id.</p>
      {sectors.map((s, i) => (
        <div key={i} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Id"><input style={{ ...input, width: 90 }} value={s.id} onChange={(e) => set({ sectors: upd(sectors, i, { id: e.target.value }) })} /></Field>
            <Field label="Name"><input style={{ ...input, width: 200 }} value={s.name} onChange={(e) => set({ sectors: upd(sectors, i, { name: e.target.value }) })} /></Field>
            <Field label="Colour">
              <input type="color" value={(s as { color?: string }).color || "#9d7bff"} onChange={(e) => set({ sectors: upd(sectors, i, { color: e.target.value } as Partial<(typeof sectors)[number]>) })} style={{ width: 44, height: 34, padding: 2, borderRadius: 8, border: "1px solid #2c2f4a", background: "#12101f", cursor: "pointer" }} />
            </Field>
            <button style={mini} disabled={i === 0} onClick={() => set({ sectors: move(sectors, i, -1) })}>↑</button>
            <button style={mini} disabled={i === sectors.length - 1} onClick={() => set({ sectors: move(sectors, i, 1) })}>↓</button>
            <button style={{ ...mini, color: "#ff9aac", borderColor: "rgba(255,90,120,0.35)" }} onClick={() => set({ sectors: sectors.filter((_, j) => j !== i) })}>delete</button>
          </div>
        </div>
      ))}
      <button style={{ ...primary, marginBottom: 20 }} onClick={() => set({ sectors: [...sectors, { id: "s" + Date.now().toString(36), name: "NEW SECTOR", color: "" }] })}>+ Add sector</button>

      {/* STICKERS */}
      <p style={{ ...help, marginBottom: 8 }}>
        <b>STICKERS</b> — {stickers.length} stops. Order within a sector is the order here. <b>Upload</b> commits the art straight
        into the repo (public/stickers/, served at /stickers/…) and fills the URL — any input size works, it's resized to a
        {" "}{STICKER_PX}px transparent square and compressed automatically. <b>auto-outline</b> derives the empty-slot line art
        from the earned image. Pasting an external URL still works too.
      </p>
      {assetMsg && (
        <p style={{ ...help, marginBottom: 8, color: assetMsg.startsWith("✓") ? "#7fe9a5" : assetMsg.includes("failed") || assetMsg.includes("token") ? "#ff9aac" : "#9d7bff" }}>
          {assetMsg}
        </p>
      )}
      {stickers.map((s, i) => (
        <div key={i} style={{ ...card, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
            <Field label="Id"><input style={{ ...input, width: 100 }} value={s.id} onChange={(e) => set({ stickers: upd(stickers, i, { id: e.target.value }) })} /></Field>
            <Field label="Name"><input style={{ ...input, width: 140 }} value={s.name} onChange={(e) => set({ stickers: upd(stickers, i, { name: e.target.value }) })} /></Field>
            <Field label="Sector">
              <select style={{ ...input, width: 130 }} value={s.sector} onChange={(e) => set({ stickers: upd(stickers, i, { sector: e.target.value }) })}>
                {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.id}</option>)}
                {!sectors.some((sec) => sec.id === s.sector) && <option value={s.sector}>{s.sector || "—"}</option>}
              </select>
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: "#857fab", paddingBottom: 8 }}>
              <input type="checkbox" checked={s.unlocked} onChange={(e) => set({ stickers: upd(stickers, i, { unlocked: e.target.checked }) })} /> unlocked
            </label>
            <button style={mini} disabled={i === 0} onClick={() => set({ stickers: move(stickers, i, -1) })}>↑</button>
            <button style={mini} disabled={i === stickers.length - 1} onClick={() => set({ stickers: move(stickers, i, 1) })}>↓</button>
            <button style={{ ...mini, color: "#ff9aac", borderColor: "rgba(255,90,120,0.35)" }} onClick={() => set({ stickers: stickers.filter((_, j) => j !== i) })}>delete</button>
          </div>
          <WiringBadge st={wiringStatus(challengeRefs.get(`sticker:${s.id}`), s)} />
          {!challengeRefs.has(`sticker:${s.id}`) && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
            <Field label="Auto-grant when">
              <select style={{ ...input, width: 120 }} value={s.trigger} onChange={(e) => set({ stickers: upd(stickers, i, { trigger: e.target.value }) })}>
                <option value="">— manual only —</option>
                <option value="level">level (unlock)</option>
                {OBJ_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            {/* Target + Scope only when they apply (see TriggerRow) */}
            {s.trigger === "level" && <Field label="Level #"><NumField value={s.target} min={1} max={999} onCommit={(n) => set({ stickers: upd(stickers, i, { target: n }) })} /></Field>}
            {s.trigger && s.trigger !== "level" && (
              <>
                <Field label="Target"><NumField value={s.target} min={1} max={999999} onCommit={(n) => set({ stickers: upd(stickers, i, { target: n }) })} /></Field>
                <Field label="Scope">
                  <select style={{ ...input, width: 130 }} value={s.scope} onChange={(e) => set({ stickers: upd(stickers, i, { scope: e.target.value }) })}>
                    <option value="run">in one run</option>
                    <option value="total">lifetime total</option>
                  </select>
                </Field>
              </>
            )}
            <span style={{ flex: 1, fontFamily: MONO, fontSize: 10, color: "#6b6690", paddingBottom: 8 }}>
              {s.trigger === "level" ? "earns when that level unlocks" : s.trigger ? "earns the sticker automatically when the player hits this feat" : "not earnable in-game — pick a trigger to wire it"}
            </span>
          </div>
          )}
          <div style={grid}>
            <Field label="Requirement (earn hint)" wide><input style={input} value={s.requirement} onChange={(e) => set({ stickers: upd(stickers, i, { requirement: e.target.value }) })} /></Field>
            <Field label="Image URL (earned art)"><input style={input} value={s.image} placeholder="/stickers/…  or https://…" onChange={(e) => set({ stickers: upd(stickers, i, { image: e.target.value }) })} /></Field>
            <label style={{ ...mini, display: "inline-flex", alignItems: "center", cursor: assetBusy ? "wait" : "pointer", opacity: assetBusy ? 0.5 : 1, alignSelf: "flex-end", marginBottom: 8 }}>
              upload
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={assetBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadStickerFile(i, "image", f); }} />
            </label>
            <Field label="Outline URL (empty slot)"><input style={input} value={s.outline} placeholder="/stickers/…  or https://…" onChange={(e) => set({ stickers: upd(stickers, i, { outline: e.target.value }) })} /></Field>
            <label style={{ ...mini, display: "inline-flex", alignItems: "center", cursor: assetBusy ? "wait" : "pointer", opacity: assetBusy ? 0.5 : 1, alignSelf: "flex-end", marginBottom: 8 }}>
              upload
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={assetBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadStickerFile(i, "outline", f); }} />
            </label>
            <button style={{ ...mini, alignSelf: "flex-end", marginBottom: 8 }} disabled={assetBusy} onClick={() => void autoOutline(i)}>auto-outline</button>
          </div>
        </div>
      ))}
      <button style={primary} onClick={() => set({ stickers: [...stickers, { id: "st" + Date.now().toString(36), sector: sectors[0]?.id ?? "", name: "New sticker", image: "", outline: "", requirement: "Complete a challenge", unlocked: false, trigger: "", target: 1, scope: "run", unlockLevel: -1 }] })}>+ Add sticker</button>
    </div>
  );
}

/* ================================ LOG TEXTS ================================ */

function LogsTab({ content, setContent }: TabProps) {
  const logs = content.logTexts;
  const keys = Object.keys(DEFAULT_CONTENT.logTexts) as (keyof GameContent["logTexts"])[];
  const stickyKeys = ((content as unknown as { logStickyKeys?: string[] }).logStickyKeys ?? []) as string[];
  const setSticky = (k: string, on: boolean) =>
    setContent({ ...content, logStickyKeys: on ? [...new Set([...stickyKeys, k])] : stickyKeys.filter((x) => x !== k) } as typeof content);
  return (
    <div>
      <p style={help}>
        The standard lines written to the in-game LOG. Words in <code style={code}>{"{curly}"}</code> braces are filled in by the
        game (points, counts, combo names) — keep them exactly as spelled, but move them around freely.
      </p>
      {keys.map((k) => {
        const placeholders = [...new Set((DEFAULT_CONTENT.logTexts[k].match(/\{\w+\}/g) ?? []) as string[])];
        return (
          <div key={k} style={{ ...card, padding: "12px 16px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: "#7fe9f5" }}>{k}</span>
              {placeholders.map((p) => (
                <span key={p} style={code}>
                  {p}
                </span>
              ))}
              {LOG_HINTS[k] && <span style={{ fontSize: 11.5, color: "#857fab" }}>{LOG_HINTS[k]}</span>}
            </div>
            <input
              style={input}
              value={logs[k]}
              onChange={(e) => setContent({ ...content, logTexts: { ...logs, [k]: e.target.value } })}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: 12, color: "#cfccdd", cursor: "pointer" }}>
              <input type="checkbox" checked={stickyKeys.includes(k)} onChange={(e) => setSticky(k, e.target.checked)} />
              sticky — the floating message stays on screen until the next log line replaces it
            </label>
          </div>
        );
      })}
    </div>
  );
}

/* ================================ SETTINGS ================================ */

function SettingsTab({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  return (
    <div style={card}>
      <p style={help}>
        Publishing commits the content files to GitHub; Render then redeploys the game automatically. Create a{" "}
        <a
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#9d7bff" }}
        >
          fine-grained personal access token
        </a>{" "}
        scoped to ONLY this repository with <b>Contents: Read and write</b> permission. The token is stored only in this browser
        (localStorage) — never in the repo or the deployed site.
      </p>
      <div style={grid}>
        <Field label="Repo owner">
          <input style={input} value={settings.owner} onChange={(e) => setSettings({ ...settings, owner: e.target.value.trim() })} />
        </Field>
        <Field label="Repo name">
          <input style={input} value={settings.repo} onChange={(e) => setSettings({ ...settings, repo: e.target.value.trim() })} />
        </Field>
        <Field label="Branch">
          <input style={input} value={settings.branch} onChange={(e) => setSettings({ ...settings, branch: e.target.value.trim() })} />
        </Field>
        <Field label="GitHub token" wide>
          <input
            style={input}
            type="password"
            value={settings.token}
            placeholder="github_pat_…"
            onChange={(e) => setSettings({ ...settings, token: e.target.value.trim() })}
          />
        </Field>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: "#9d7bff", margin: "20px 0 8px" }}>THUMBNAIL ILLUSTRATIONS (getimg.ai)</div>
      <p style={help}>
        Board-theme and music <b>auto-generate</b> uses getimg.ai through your Cloudflare Worker proxy (see <code style={code}>worker/README.md</code>).
        Leave <b>proxy URL</b> blank to use the built-in procedural thumbnails instead. The API key lives in the Worker, never here.
        Default model is <b>Nano Banana 2</b> (<code style={code}>gemini-3-1-flash-image</code>); its style is driven by the <b>reference image</b>
        (point it at a sticker URL). <b>Elements</b> only apply to getimg-native models, so leave them blank for the frontier models.
      </p>
      <div style={grid}>
        <Field label="getimg proxy URL" wide>
          <input style={input} value={settings.getimgProxyUrl ?? ""} placeholder="https://glint-getimg.you.workers.dev" onChange={(e) => setSettings({ ...settings, getimgProxyUrl: e.target.value.trim() })} />
        </Field>
        <Field label="Proxy passphrase (optional)">
          <input style={input} type="password" value={settings.getimgToken ?? ""} placeholder="matches Worker CMS_TOKEN" onChange={(e) => setSettings({ ...settings, getimgToken: e.target.value.trim() })} />
        </Field>
        <Field label="Model">
          <input style={{ ...input, width: 180 }} value={settings.getimgModel ?? ""} placeholder="gemini-3-1-flash-image" onChange={(e) => setSettings({ ...settings, getimgModel: e.target.value.trim() })} />
        </Field>
        <Field label="Element ids (getimg-native models only)">
          <input style={{ ...input, width: 200 }} value={settings.getimgElements ?? ""} placeholder="(blank for Nano Banana)" onChange={(e) => setSettings({ ...settings, getimgElements: e.target.value })} />
        </Field>
        <Field label="Element weight">
          <input style={{ ...input, width: 70 }} value={settings.getimgWeight ?? 0.85} onChange={(e) => { const n = parseFloat(e.target.value); setSettings({ ...settings, getimgWeight: isNaN(n) ? 0.85 : Math.max(0, Math.min(1, n)) }); }} />
        </Field>
        <Field label="Reference image URL (optional)" wide>
          <input style={input} value={settings.getimgReference ?? ""} placeholder="https://…/stickers/bluegiant-image.webp (for models that use references)" onChange={(e) => setSettings({ ...settings, getimgReference: e.target.value.trim() })} />
        </Field>
      </div>
    </div>
  );
}

/* ================================ shared bits ================================ */

interface TabProps {
  content: GameContent;
  setContent: (c: GameContent) => void;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: "#857fab", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function clampInt(v: string, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/** A number input that edits LOCALLY and only commits (clamped) on blur/Enter.
 *  Committing per keystroke corrupted values: typing "40" first committed "4",
 *  and the collapse/singularity ordering rules then destructively rewrote the
 *  OTHER fields off that transient value. */
function NumField({
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
}) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]); // outside changes (e.g. ordering cascades) sync in
  return (
    <input
      style={{ ...input, ...(disabled ? disabledInput : {}) }}
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const n = clampInt(txt, min, max);
        setTxt(String(n));
        if (n !== value) onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/* ---------------------------------- styles ---------------------------------- */

const DISP = "'Chakra Petch', sans-serif";
const SANS = "'Saira', sans-serif";
const MONO = "'Share Tech Mono', monospace";

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#07080f",
  color: "#cdd3e0",
  fontFamily: SANS,
  padding: "22px clamp(14px, 4vw, 44px)",
  maxWidth: 1040,
  margin: "0 auto",
};
const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  paddingBottom: 16,
};
const tabs: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  borderBottom: "1px solid #1c1f33",
  paddingBottom: 10,
};
const tabBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid transparent",
  color: "#857fab",
  fontFamily: MONO,
  fontSize: 11.5,
  letterSpacing: "0.14em",
  padding: "8px 12px",
  borderRadius: 9,
  cursor: "pointer",
};
const tabActive: React.CSSProperties = {
  color: "#e9d6ff",
  background: "rgba(157,123,255,0.12)",
  border: "1px solid rgba(157,123,255,0.4)",
};
const card: React.CSSProperties = {
  background: "linear-gradient(180deg,#101320,#0b0d16)",
  border: "1px solid #232645",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 12,
};
const input: React.CSSProperties = {
  background: "#0a0c15",
  border: "1px solid #2a2d4a",
  borderRadius: 9,
  color: "#eef0f5",
  fontFamily: SANS,
  fontSize: 13.5,
  padding: "9px 11px",
  width: "100%",
  boxSizing: "border-box",
};
const area: React.CSSProperties = { ...input, resize: "vertical", lineHeight: 1.5 };
const disabledInput: React.CSSProperties = { opacity: 0.35, cursor: "not-allowed", background: "#0d0e16" };
const ghost: React.CSSProperties = {
  background: "none",
  border: "1px solid #2a2d4a",
  color: "#cdd3e0",
  fontFamily: SANS,
  fontWeight: 600,
  fontSize: 12.5,
  padding: "9px 14px",
  borderRadius: 10,
  cursor: "pointer",
};
const primary: React.CSSProperties = {
  background: "linear-gradient(180deg,#a06bf0,#7d3fc4)",
  border: "none",
  borderBottom: "3px solid #5c2a95",
  color: "#fff",
  fontFamily: DISP,
  fontWeight: 700,
  fontSize: 13.5,
  letterSpacing: "0.04em",
  padding: "10px 20px",
  borderRadius: 11,
  cursor: "pointer",
};
const mini: React.CSSProperties = {
  background: "none",
  border: "1px solid #2a2d4a",
  color: "#857fab",
  fontFamily: SANS,
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 8,
  cursor: "pointer",
};
const draftBadge: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: "0.12em",
  color: "#ffd980",
  border: "1px solid rgba(232,181,63,0.45)",
  background: "rgba(232,181,63,0.1)",
  padding: "5px 10px",
  borderRadius: 999,
};
const notice: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 11,
  padding: "10px 14px",
  fontSize: 13,
  marginBottom: 12,
};
const help: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.55,
  color: "#857fab",
  margin: "2px 0 14px",
};
const code: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  color: "#7fe9f5",
  background: "rgba(127,233,242,0.08)",
  border: "1px solid rgba(127,233,242,0.25)",
  borderRadius: 6,
  padding: "1px 6px",
};
