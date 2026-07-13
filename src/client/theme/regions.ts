/**
 * REGION THEMES — design_handoff_glint_regions.
 *
 * Seven in-game background treatments. The board, gems and layout never change —
 * the atmosphere layer (RegionBackdrop) and the UI chrome tint carry the region.
 * Each region is a token bundle; the game screen applies it as CSS-variable
 * overrides (--panel/--border/--faint/--dim/--accent + the --rg-* gradients that
 * cardFace / bevel / bevelIcon / footer read), so structure, radii, bevels and
 * the gold score / gold banks / red hearts stay constant.
 *
 * The standard violet-nebula treatment stays for unthemed ("blank") levels and
 * Quick-start games.
 */

export interface RegionTheme {
  name: string;
  /** opaque screen background behind everything */
  screenBg: string;
  /** perspective-card face gradient (SCORE / BANKS / BUSTS, legends) */
  panelGrad: string;
  /** footer control-bar gradient (slightly deeper than the cards) */
  footerGrad: string;
  /** beveled icon-tile gradient (footer tiles, bar buttons) */
  tileGrad: string;
  /** hairline border for panels + bevels */
  border: string;
  /** the near-black bevel bottom edge */
  edge: string;
  /** label ink (SCORE / BANKS / footer labels) — maps to --faint */
  labelInk: string;
  /** secondary ink (icons, log text) — maps to --dim */
  dimInk: string;
  /** region accent (kicker, NOW PLACING, up-next) — maps to --accent */
  accent: string;
  /** solid panel colour for modals / drawers — maps to --panel */
  panelSolid: string;
  /** solid raised-tile colour — maps to --panel-hi */
  tileSolid: string;
  /** board cast-shadow strength (standard .6; Shadow Sector .7) */
  castShadow: number;
  /** the region's atmosphere distilled to a wash for its LEVEL TILE's face —
   *  echoes the in-game background so the menu already links to the theme */
  tileWash: string;
}

export const REGIONS: Record<string, RegionTheme> = {
  "Machina Forge": {
    name: "Machina Forge",
    screenBg: "#0a0806",
    panelGrad: "linear-gradient(180deg, rgba(38,26,16,0.85), rgba(20,13,8,0.9))",
    footerGrad: "linear-gradient(180deg, rgba(32,22,14,0.92), rgba(16,11,7,0.95))",
    tileGrad: "linear-gradient(180deg, #2c1f14, #170f09)",
    border: "#3c2c1c",
    edge: "#060403",
    labelInk: "#9a8168",
    dimInk: "#c9b8a8",
    accent: "#ff8c4a",
    panelSolid: "#150e08",
    tileSolid: "#241a12",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(255,110,40,0.38), transparent 72%), radial-gradient(70% 40% at 20% 0%, rgba(150,90,50,0.12), transparent 70%)",
  },
  "Fringe Market": {
    name: "Fringe Market",
    screenBg: "#0b070f",
    panelGrad: "linear-gradient(180deg, rgba(40,18,42,0.85), rgba(20,10,22,0.9))",
    footerGrad: "linear-gradient(180deg, rgba(36,16,38,0.92), rgba(17,8,18,0.95))",
    tileGrad: "linear-gradient(180deg, #2c1630, #160a18)",
    border: "#45204a",
    edge: "#060308",
    labelInk: "#a878a8",
    dimInk: "#d8b8d8",
    accent: "#ff4fd8",
    panelSolid: "#140a16",
    tileSolid: "#241226",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(255,60,170,0.32), transparent 72%), radial-gradient(60% 40% at 12% 0%, rgba(90,220,255,0.10), transparent 70%)",
  },
  "Corporate Spire": {
    name: "Corporate Spire",
    screenBg: "#0e1220",
    panelGrad: "linear-gradient(180deg, rgba(42,50,72,0.85), rgba(22,28,46,0.9))",
    footerGrad: "linear-gradient(180deg, rgba(38,46,66,0.92), rgba(20,25,40,0.95))",
    tileGrad: "linear-gradient(180deg, #2a3450, #181f34)",
    border: "#3c465e",
    edge: "#080a12",
    labelInk: "#9aa8c8",
    dimInk: "#dce4f2",
    accent: "#dce9ff",
    panelSolid: "#161c2e",
    tileSolid: "#252d42",
    castShadow: 0.5,
    tileWash: "radial-gradient(90% 60% at 50% -8%, rgba(215,232,255,0.22), transparent 70%), radial-gradient(60% 45% at 88% 90%, rgba(232,181,63,0.10), transparent 70%)",
  },
  "Military Bastion": {
    name: "Military Bastion",
    screenBg: "#0a0c0a",
    panelGrad: "linear-gradient(180deg, rgba(30,36,26,0.88), rgba(15,18,12,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(26,32,22,0.92), rgba(13,16,11,0.95))",
    tileGrad: "linear-gradient(180deg, #242c1e, #131810)",
    border: "#37402e",
    edge: "#050604",
    labelInk: "#8a9a78",
    dimInk: "#c2ccb8",
    accent: "#ff5a5a",
    panelSolid: "#11150e",
    tileSolid: "#1e241a",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(255,60,60,0.20), transparent 72%), radial-gradient(80% 45% at 50% -6%, rgba(140,160,110,0.14), transparent 70%)",
  },
  "Shadow Sector": {
    name: "Shadow Sector",
    screenBg: "#04060a",
    panelGrad: "linear-gradient(180deg, rgba(16,26,38,0.88), rgba(8,13,20,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(13,21,32,0.92), rgba(6,10,16,0.95))",
    tileGrad: "linear-gradient(180deg, #14202e, #0a1018)",
    border: "#223144",
    edge: "#030507",
    labelInk: "#6a86a0",
    dimInk: "#a8c2d8",
    accent: "#7ec8ff",
    panelSolid: "#0a0f16",
    tileSolid: "#101822",
    castShadow: 0.7,
    tileWash: "radial-gradient(80% 60% at 50% 40%, rgba(80,130,200,0.16), transparent 70%)",
  },
  "Divinity Enclave": {
    name: "Divinity Enclave",
    screenBg: "#051220",
    panelGrad: "linear-gradient(180deg, rgba(14,38,56,0.88), rgba(7,20,32,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(12,32,48,0.92), rgba(6,16,26,0.95))",
    tileGrad: "linear-gradient(180deg, #123048, #091826)",
    border: "#1e425c",
    edge: "#030a12",
    labelInk: "#6a9ec0",
    dimInk: "#a8cce0",
    accent: "#4ab8ff",
    panelSolid: "#071420",
    tileSolid: "#0e2638",
    castShadow: 0.6,
    tileWash: "radial-gradient(90% 55% at 45% -6%, rgba(40,140,220,0.30), transparent 70%), radial-gradient(60% 40% at 80% 100%, rgba(80,220,220,0.12), transparent 70%)",
  },
  "Digital Nexus": {
    name: "Digital Nexus",
    screenBg: "#040c08",
    panelGrad: "linear-gradient(180deg, rgba(13,36,24,0.88), rgba(7,18,12,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(11,30,20,0.92), rgba(5,14,9,0.95))",
    tileGrad: "linear-gradient(180deg, #10301e, #08160e)",
    border: "#1e4230",
    edge: "#030805",
    labelInk: "#5a9a78",
    dimInk: "#a0d8b8",
    accent: "#3cff9e",
    panelSolid: "#07120c",
    tileSolid: "#0d2418",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(60,220,130,0.26), transparent 72%), radial-gradient(60% 40% at 15% 0%, rgba(40,255,170,0.10), transparent 70%)",
  },

  /* ---- the SHOP wave: nine sci-fi-with-a-twist treatments ---- */

  "Candy Nova": {
    // bubblegum warp-pop — a nebula made of sherbet
    name: "Candy Nova",
    screenBg: "#0f070d",
    panelGrad: "linear-gradient(180deg, rgba(52,22,44,0.85), rgba(26,11,22,0.9))",
    footerGrad: "linear-gradient(180deg, rgba(46,19,39,0.92), rgba(22,9,19,0.95))",
    tileGrad: "linear-gradient(180deg, #3a1830, #1c0b17)",
    border: "#57254a",
    edge: "#080308",
    labelInk: "#b87ba6",
    dimInk: "#eebede",
    accent: "#ff6ec7",
    panelSolid: "#1a0a16",
    tileSolid: "#2e1426",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(255,110,200,0.34), transparent 72%), radial-gradient(60% 40% at 82% 0%, rgba(110,230,255,0.14), transparent 70%)",
  },
  "Verdant Overgrowth": {
    // alien jungle — bioluminescent moss over ancient machines
    name: "Verdant Overgrowth",
    screenBg: "#060b06",
    panelGrad: "linear-gradient(180deg, rgba(20,38,20,0.86), rgba(10,19,10,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(17,32,17,0.92), rgba(8,15,8,0.95))",
    tileGrad: "linear-gradient(180deg, #16301a, #0a160c)",
    border: "#28472c",
    edge: "#040804",
    labelInk: "#79a077",
    dimInk: "#bcdcb8",
    accent: "#8bea6e",
    panelSolid: "#0a140b",
    tileSolid: "#142616",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(110,230,110,0.28), transparent 72%), radial-gradient(60% 40% at 18% 0%, rgba(60,200,180,0.12), transparent 70%)",
  },
  "Crimson Requiem": {
    // gothic cathedral adrift — candle-red vaults and bone inlay
    name: "Crimson Requiem",
    screenBg: "#0b0507",
    panelGrad: "linear-gradient(180deg, rgba(44,16,22,0.87), rgba(22,8,11,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(38,14,19,0.92), rgba(18,7,9,0.95))",
    tileGrad: "linear-gradient(180deg, #35141b, #180a0d)",
    border: "#4e202a",
    edge: "#080304",
    labelInk: "#a87680",
    dimInk: "#dcb4bc",
    accent: "#e04858",
    panelSolid: "#170a0d",
    tileSolid: "#281116",
    castShadow: 0.7,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(220,60,80,0.30), transparent 72%), radial-gradient(60% 40% at 50% 0%, rgba(240,220,200,0.06), transparent 70%)",
  },
  "Velvet Lounge": {
    // the smoky zero-g cocktail deck — amber lamps on plum velvet
    name: "Velvet Lounge",
    screenBg: "#0a0708",
    panelGrad: "linear-gradient(180deg, rgba(40,26,24,0.86), rgba(20,13,12,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(34,22,20,0.92), rgba(16,10,10,0.95))",
    tileGrad: "linear-gradient(180deg, #30201c, #170f0d)",
    border: "#46302a",
    edge: "#070404",
    labelInk: "#a88d76",
    dimInk: "#d8c2ae",
    accent: "#e0a05f",
    panelSolid: "#160e0d",
    tileSolid: "#261915",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(220,150,80,0.26), transparent 72%), radial-gradient(60% 40% at 12% 0%, rgba(160,60,110,0.12), transparent 70%)",
  },
  "Isla Neon": {
    // the orbital beach club — sunset coral over holographic surf
    name: "Isla Neon",
    screenBg: "#071013",
    panelGrad: "linear-gradient(180deg, rgba(18,42,48,0.85), rgba(9,21,24,0.9))",
    footerGrad: "linear-gradient(180deg, rgba(15,36,42,0.92), rgba(7,17,20,0.95))",
    tileGrad: "linear-gradient(180deg, #123540, #081a20)",
    border: "#1f4a55",
    edge: "#030708",
    labelInk: "#6da3a8",
    dimInk: "#b0dade",
    accent: "#ff9d5c",
    panelSolid: "#081518",
    tileSolid: "#0f272c",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(255,150,80,0.30), transparent 72%), radial-gradient(60% 40% at 85% 0%, rgba(60,220,230,0.14), transparent 70%)",
  },
  "Frost Palace": {
    // the glacial court — daylight through kilometre-thick ice: the brightest
    // theme in the set, with crisp ice-white outlines
    name: "Frost Palace",
    screenBg: "#0d1826",
    panelGrad: "linear-gradient(180deg, rgba(38,60,88,0.85), rgba(20,34,52,0.9))",
    footerGrad: "linear-gradient(180deg, rgba(32,52,78,0.92), rgba(16,28,44,0.95))",
    tileGrad: "linear-gradient(180deg, #234260, #122438)",
    border: "#9fd4f5",
    edge: "#0a1420",
    labelInk: "#9fc2e0",
    dimInk: "#d8ebfa",
    accent: "#a8e2ff",
    panelSolid: "#152535",
    tileSolid: "#1d3448",
    castShadow: 0.45,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(160,220,255,0.34), transparent 72%), radial-gradient(60% 40% at 50% 0%, rgba(230,245,255,0.12), transparent 70%)",
  },
  "Retro Arcade": {
    // the cabinet row — CRT green phosphor and magenta marquee glow
    name: "Retro Arcade",
    screenBg: "#050805",
    panelGrad: "linear-gradient(180deg, rgba(16,36,20,0.87), rgba(8,18,10,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(13,30,16,0.92), rgba(6,14,8,0.95))",
    tileGrad: "linear-gradient(180deg, #0f2c16, #07150a)",
    border: "#1d4426",
    edge: "#030503",
    labelInk: "#5f9a6c",
    dimInk: "#a8d8b2",
    accent: "#ff4fe1",
    panelSolid: "#07110a",
    tileSolid: "#0d2212",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(80,240,140,0.24), transparent 72%), radial-gradient(60% 40% at 80% 0%, rgba(255,80,225,0.12), transparent 70%)",
  },
  "Solar Flare": {
    // riding the corona — white-hot gold against a burning sky
    name: "Solar Flare",
    screenBg: "#0d0903",
    panelGrad: "linear-gradient(180deg, rgba(52,34,12,0.86), rgba(26,17,6,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(45,29,10,0.92), rgba(21,14,5,0.95))",
    tileGrad: "linear-gradient(180deg, #3a2a10, #1c1408)",
    border: "#57401c",
    edge: "#080502",
    labelInk: "#b89a68",
    dimInk: "#eed9ae",
    accent: "#ff9e2e",
    panelSolid: "#1a1206",
    tileSolid: "#2e2210",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(255,170,50,0.36), transparent 72%), radial-gradient(60% 40% at 50% 0%, rgba(255,240,200,0.10), transparent 70%)",
  },
  "Void Rose": {
    // a dark romance — dusty rose petals drifting in black vacuum
    name: "Void Rose",
    screenBg: "#0a060a",
    panelGrad: "linear-gradient(180deg, rgba(38,22,34,0.86), rgba(19,11,17,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(33,19,29,0.92), rgba(16,9,14,0.95))",
    tileGrad: "linear-gradient(180deg, #2c1826, #160b13)",
    border: "#43263a",
    edge: "#070308",
    labelInk: "#a3809a",
    dimInk: "#d8bccd",
    accent: "#e87fa8",
    panelSolid: "#150b12",
    tileSolid: "#241420",
    castShadow: 0.65,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(230,120,165,0.26), transparent 72%), radial-gradient(60% 40% at 20% 0%, rgba(120,80,160,0.10), transparent 70%)",
  },

  /* ---- the PREMIUM wave: six flagship treatments, richest atmospheres ---- */

  "Prism Vault": {
    // a crystal chamber splitting light into spectra — the whole colour wheel
    name: "Prism Vault",
    screenBg: "#0a0816",
    panelGrad: "linear-gradient(180deg, rgba(34,26,60,0.86), rgba(17,13,32,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(29,22,52,0.92), rgba(14,10,26,0.95))",
    tileGrad: "linear-gradient(180deg, #241a44, #120c26)",
    border: "#3a2c66",
    edge: "#060310",
    labelInk: "#9a8ad0",
    dimInk: "#cfc2f2",
    accent: "#c9b6ff",
    panelSolid: "#120c26",
    tileSolid: "#221844",
    castShadow: 0.6,
    tileWash: "radial-gradient(80% 55% at 30% 108%, rgba(120,140,255,0.26), transparent 70%), radial-gradient(60% 45% at 82% 0%, rgba(255,120,200,0.16), transparent 70%), radial-gradient(50% 40% at 60% 60%, rgba(120,255,220,0.12), transparent 70%)",
  },
  "Storm Front": {
    // riding a charged thundercloud sea — lightning splits the dark
    name: "Storm Front",
    screenBg: "#070a11",
    panelGrad: "linear-gradient(180deg, rgba(24,34,50,0.87), rgba(12,18,28,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(20,30,44,0.92), rgba(10,15,24,0.95))",
    tileGrad: "linear-gradient(180deg, #1a2740, #0d1524)",
    border: "#2a3c58",
    edge: "#04070d",
    labelInk: "#7d95b4",
    dimInk: "#bcd0e8",
    accent: "#7fd4ff",
    panelSolid: "#0c1420",
    tileSolid: "#162238",
    castShadow: 0.65,
    tileWash: "radial-gradient(85% 55% at 50% -6%, rgba(130,200,255,0.22), transparent 70%), radial-gradient(70% 45% at 50% 108%, rgba(90,140,200,0.14), transparent 72%)",
  },
  "Dune Mirage": {
    // a desert world at dusk — amber dunes under twin moons and a violet sky
    name: "Dune Mirage",
    screenBg: "#100a12",
    panelGrad: "linear-gradient(180deg, rgba(48,30,40,0.86), rgba(24,15,20,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(42,26,36,0.92), rgba(20,12,17,0.95))",
    tileGrad: "linear-gradient(180deg, #3a2632, #1c1219)",
    border: "#4e3244",
    edge: "#080407",
    labelInk: "#b3927e",
    dimInk: "#e8c8ae",
    accent: "#ffb35c",
    panelSolid: "#180f16",
    tileSolid: "#2a1c26",
    castShadow: 0.6,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(255,160,80,0.3), transparent 72%), radial-gradient(70% 50% at 50% 0%, rgba(150,90,180,0.14), transparent 70%)",
  },
  "Regalia": {
    // a floating throne room — amethyst vaults, a gold chandelier, falling gilt
    name: "Regalia",
    screenBg: "#0c0714",
    panelGrad: "linear-gradient(180deg, rgba(40,24,58,0.87), rgba(20,12,30,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(34,20,50,0.92), rgba(17,10,26,0.95))",
    tileGrad: "linear-gradient(180deg, #2c1a44, #160c24)",
    border: "#43285e",
    edge: "#070311",
    labelInk: "#a488c0",
    dimInk: "#e0cbe8",
    accent: "#f0c674",
    panelSolid: "#150b24",
    tileSolid: "#261640",
    castShadow: 0.6,
    tileWash: "radial-gradient(80% 55% at 50% -6%, rgba(240,198,116,0.2), transparent 70%), radial-gradient(70% 50% at 50% 108%, rgba(150,80,200,0.2), transparent 72%)",
  },
  "Skyward": {
    // above the clouds at golden hour — the brightest, airiest theme in the set
    name: "Skyward",
    screenBg: "#0f1c2e",
    panelGrad: "linear-gradient(180deg, rgba(38,58,84,0.85), rgba(20,32,50,0.9))",
    footerGrad: "linear-gradient(180deg, rgba(32,50,74,0.92), rgba(16,26,42,0.95))",
    tileGrad: "linear-gradient(180deg, #22405e, #122236)",
    border: "#365274",
    edge: "#0a141f",
    labelInk: "#8fb0d0",
    dimInk: "#d4e6f8",
    accent: "#86c9ff",
    panelSolid: "#142438",
    tileSolid: "#1e364e",
    castShadow: 0.5,
    tileWash: "radial-gradient(90% 60% at 50% -8%, rgba(180,220,255,0.24), transparent 70%), radial-gradient(60% 45% at 84% 6%, rgba(255,210,140,0.14), transparent 70%)",
  },
  "Obsidian Mirror": {
    // liquid chrome over the abyss — silver sheen, mercury ripples (the namesake)
    name: "Obsidian Mirror",
    screenBg: "#08080b",
    panelGrad: "linear-gradient(180deg, rgba(34,36,42,0.87), rgba(16,17,20,0.92))",
    footerGrad: "linear-gradient(180deg, rgba(28,30,36,0.92), rgba(13,14,17,0.95))",
    tileGrad: "linear-gradient(180deg, #26282e, #131418)",
    border: "#3c3f48",
    edge: "#040405",
    labelInk: "#9096a2",
    dimInk: "#d2d7e0",
    accent: "#cfd6e0",
    panelSolid: "#111216",
    tileSolid: "#212329",
    castShadow: 0.7,
    tileWash: "radial-gradient(85% 55% at 50% 108%, rgba(190,200,220,0.18), transparent 72%), radial-gradient(60% 45% at 30% 0%, rgba(150,200,255,0.08), transparent 70%)",
  },
};

/** CSS-variable overrides the game shell applies when a region theme is active. */
export function regionVars(rt: RegionTheme): React.CSSProperties {
  return {
    "--panel": rt.panelSolid,
    "--panel-hi": rt.tileSolid,
    "--border": rt.border,
    "--rg-border": rt.border,
    "--faint": rt.labelInk,
    "--dim": rt.dimInk,
    "--accent": rt.accent,
    "--rg-panel": rt.panelGrad,
    "--rg-tile": rt.tileGrad,
    "--rg-footer": rt.footerGrad,
    "--rg-edge": rt.edge,
    "--rg-cast": `${rt.castShadow}`,
  } as React.CSSProperties;
}
