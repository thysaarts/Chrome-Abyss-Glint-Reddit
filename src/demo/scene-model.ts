import { CONTENT } from "../content/content";

/**
 * THE SCENE MODEL — the pure data the 3D renderer plays and the editor edits.
 *
 * A scene is a vertical JOURNEY: objects live at a position `t` along a tall column
 * (t=0 bottom / start, t=1 top / summit), offset left/right (`lateral`) and near/far
 * (`depth`), echoing The Ascent's staggered floating islands. The camera travels up
 * the column as you scroll. Save/load is just this object as JSON.
 *
 * Phase 1 renders every object as PLACEHOLDER geometry keyed by `kind`; Phase 2 swaps
 * each kind's placeholder for a curated Meshy .glb without touching this model.
 */

export type ObjKind =
  | "planet" // a world / gas giant (with optional ring)
  | "asteroid" // a rough rock, optionally gem-studded
  | "crystal" // an emissive mineral cluster
  | "station" // a modular derelict structure
  | "gate" // a ring-gate / wormhole portal
  | "core"; // the radiant Master Core (the summit)

export interface ObjEffects {
  light: boolean; // a colored point light emitted from the object
  lightIntensity: number;
  halo: boolean; // a soft additive glow sprite behind it
  ring: boolean; // an orbiting ring band
  dust: boolean; // a local particle swarm
}

export interface SceneObject {
  id: string;
  kind: ObjKind;
  name: string;
  model?: string; // optional Meshy model id → loads public/models3d/<model>/model.opt.glb instead of placeholder
  orbitMoon?: boolean; // (planets) a small procedural moon orbiting the world
  motion?: "driftUp" | "flyby" | "hover" | "cruise"; // idle travel behaviour (see Landmark)
  motionSpeed?: number; // multiplier for driftUp speed
  t: number; // 0..1 up the column
  lateral: number; // -1..1 left/right
  depth: number; // -1..1 near/far
  scale: number; // relative size
  rotation: [number, number, number]; // radians
  spin: number; // idle Y-spin (rev/min-ish)
  bob: number; // idle vertical bob amount
  color: string;
  emissive: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  effects: ObjEffects;
}

export interface SceneSettings {
  pathLength: number; // world units from start to summit
  nebulaHueA: number; // 0..1 — the column's tri-tone nebula (deep base…)
  nebulaHueB: number; // …mid…
  nebulaHueC: number; // …hot accent
  nebulaIntensity: number; // 0..1
  nebulaFilaments: number; // 0..1 — ridged filament / wisp structure (ref 001/004)
  fogColor: string;
  fogDensity: number; // 0..1
  stars: number; // faint star count (thousands)
  heroStars: number; // count of bright diffraction-spike hero stars (ref 004)
  dust: number; // 0..1 drifting particle-dust density (ref 002)
  dustWarm: number; // 0..1 fraction of warm-gold motes among the cool ones
  comets: number; // 0..1 comet-streak frequency, 0 = off (ref 003)
  galaxy: number; // 0..1 distant bloomed galaxy-core glow (ref 006)
  flicker: number; // 0..1 drifting/flickering light through the gas
  // shop-gated extra FX (each is an Ascent element; ownership/toggles zero them)
  embers: number; // 0..1 warm rising ember motes
  rain: number; // 0..1 falling stardust streaks
  aurora: number; // 0..1 waving aurora curtain light
  shafts: number; // 0..1 drifting god-ray light shafts
  bloom: number; // glow strength
  exposure: number; // ACES exposure
  dof: boolean; // depth of field
  grain: number; // film grain 0..1
  vignette: number; // 0..1
  keyLightColor: string;
  keyLightIntensity: number;
  ambient: number;
}

export interface SceneDef {
  version: 1;
  build?: number; // bumped when the curated default changes → invalidates stale saved scenes
  name: string;
  settings: SceneSettings;
  objects: SceneObject[];
}

/** Bump this whenever defaultScene() changes so old localStorage copies are discarded on load. */
export const SCENE_BUILD = 8;

/**
 * The LIVE scene — the CMS-published copy (content.ascentScene, edited in the
 * admin's ASCENT 3D tab and shipped with Publish). Falls back to the code-side
 * defaultScene() until one is published. This is what the game renders.
 */
export function liveScene(): SceneDef {
  const raw = (CONTENT as unknown as { ascentScene?: SceneDef | null }).ascentScene;
  return raw && Array.isArray(raw.objects) && raw.objects.length ? migrateScene(raw) : defaultScene();
}

/**
 * THE STICKER BOOK's scene — its own journey with an ORIGINAL palette (indigo →
 * cyan → gold, warmer and calmer than the Ascent's violet/magenta) and ONLY
 * procedural planets: no stations, no rocks, no shop gating. The book's sector
 * light effect tints this live as the player browses (see BookScene).
 */
export function defaultStickerScene(): SceneDef {
  const place = (t: number, lateral: number, depth: number, over: Partial<SceneObject> = {}): SceneObject => ({
    ...makeObject("planet", t),
    lateral,
    depth,
    ...over,
  });
  return {
    version: 1,
    build: SCENE_BUILD,
    name: "The Interstellar",
    settings: {
      ...defaultSettings(),
      pathLength: 110,
      nebulaHueA: 0.63, // deep indigo
      nebulaHueB: 0.5, // cyan
      nebulaHueC: 0.11, // gold accent
      nebulaIntensity: 0.55,
      nebulaFilaments: 0.5,
      fogColor: "#060a16",
      stars: 8,
      heroStars: 10,
      dust: 0.45,
      dustWarm: 0.35,
      comets: 0.4,
      galaxy: 0, // the Ascent's signature — the book keeps its own sky
      flicker: 0.3,
      embers: 0,
      rain: 0,
      aurora: 0,
      shafts: 0,
    },
    objects: [
      place(0.05, -0.4, 0.15, { name: "Aurelia", scale: 3.2, color: "#c8892f", emissive: "#ffb352", emissiveIntensity: 0.4, effects: { ...defaultEffects(), ring: true } }),
      place(0.22, 0.5, -0.2, { name: "Thalassa", scale: 2.2, color: "#1f7f8f", emissive: "#37d8c8", emissiveIntensity: 0.35 }),
      place(0.4, -0.5, 0.3, { name: "Cinder", scale: 1.5, color: "#8f4a3c", emissive: "#ff8a5c", emissiveIntensity: 0.3 }),
      place(0.58, 0.45, 0.1, { name: "Verdant", scale: 2.6, color: "#3f8f5a", emissive: "#6fe89f", emissiveIntensity: 0.35, orbitMoon: true }),
      place(0.76, -0.42, -0.25, { name: "Halcyon", scale: 1.8, color: "#7f8fd0", emissive: "#9fb8ff", emissiveIntensity: 0.3 }),
      place(0.94, 0.3, 0.2, { name: "Sol Aurea", scale: 3.4, color: "#d0a83f", emissive: "#ffd98a", emissiveIntensity: 0.5, effects: { ...defaultEffects(), ring: true } }),
    ],
  };
}

/** The live Sticker Book scene — CMS copy (content.stickerScene) or the default. */
export function liveStickerScene(): SceneDef {
  const raw = (CONTENT as unknown as { stickerScene?: SceneDef | null }).stickerScene;
  return raw && Array.isArray(raw.objects) && raw.objects.length ? migrateScene(raw) : defaultStickerScene();
}

let idc = 0;
export const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${(idc++).toString(36)}`;

export const defaultEffects = (): ObjEffects => ({ light: false, lightIntensity: 2, halo: false, ring: false, dust: false });

/** A sensible new object of a kind, dropped near the current path position `t`. */
export function makeObject(kind: ObjKind, t = 0.5): SceneObject {
  const presets: Record<ObjKind, Partial<SceneObject>> = {
    planet: { name: "Planet", scale: 2.4, color: "#5a74c8", emissive: "#101a3a", emissiveIntensity: 0.2, metalness: 0.1, roughness: 0.85, spin: 0.6, bob: 0.4 },
    asteroid: { name: "Asteroid", scale: 1.3, color: "#6b6f7e", emissive: "#7a55ff", emissiveIntensity: 0.0, metalness: 0.2, roughness: 0.95, spin: 1.2, bob: 0.3 },
    crystal: { name: "Crystal", scale: 1.1, color: "#8fe6ff", emissive: "#37c8ff", emissiveIntensity: 1.6, metalness: 0.1, roughness: 0.2, spin: 2.0, bob: 0.5, effects: { ...defaultEffects(), halo: true } },
    station: { name: "Station", scale: 1.4, color: "#b8bccb", emissive: "#ffb23f", emissiveIntensity: 0.4, metalness: 0.85, roughness: 0.4, spin: 0.3, bob: 0.2, effects: { ...defaultEffects(), light: true, lightIntensity: 1.2 } },
    gate: { name: "Gate", scale: 2.0, color: "#2a2f52", emissive: "#b06bf5", emissiveIntensity: 2.2, metalness: 0.7, roughness: 0.3, spin: 0.5, bob: 0.3, effects: { ...defaultEffects(), halo: true, ring: true } },
    core: { name: "Master Core", scale: 2.6, color: "#ffffff", emissive: "#c99cff", emissiveIntensity: 3.2, metalness: 0.2, roughness: 0.1, spin: 1.4, bob: 0.6, effects: { ...defaultEffects(), light: true, lightIntensity: 3, halo: true, dust: true } },
  };
  const p = presets[kind];
  return {
    id: newId(kind),
    kind,
    name: p.name ?? kind,
    t,
    lateral: 0,
    depth: 0,
    scale: p.scale ?? 1.5,
    rotation: [0, 0, 0],
    spin: p.spin ?? 0.5,
    bob: p.bob ?? 0.3,
    color: p.color ?? "#8892b0",
    emissive: p.emissive ?? "#000000",
    emissiveIntensity: p.emissiveIntensity ?? 0,
    metalness: p.metalness ?? 0.3,
    roughness: p.roughness ?? 0.6,
    effects: p.effects ?? defaultEffects(),
  };
}

/** Baseline atmosphere — also the source of truth for migrating older saved scenes. */
export function defaultSettings(): SceneSettings {
  return {
    pathLength: 120,
    nebulaHueA: 0.72, // violet base
    nebulaHueB: 0.54, // teal-blue mid
    nebulaHueC: 0.86, // magenta-pink accent
    nebulaIntensity: 0.65,
    nebulaFilaments: 0.6,
    fogColor: "#07081a",
    // strong enough that distant objects sink into the dark (distance = mystery)
    fogDensity: 0.8,
    stars: 7,
    heroStars: 14,
    dust: 0.5,
    dustWarm: 0.22,
    comets: 0.35,
    galaxy: 0.6,
    flicker: 0.5,
    embers: 0.55,
    rain: 0.55,
    aurora: 0.6,
    shafts: 0.55,
    bloom: 1.0,
    exposure: 1.05,
    dof: true,
    grain: 0.22,
    vignette: 0.62,
    keyLightColor: "#dfe6ff",
    // ambient/key kept LOW so objects read as lit by the nebula (environment),
    // not a studio — the IBL + rim carry the modelling
    keyLightIntensity: 1.3,
    ambient: 0.16,
  };
}

/** Fill in any settings a saved/loaded scene is missing (forward-compatible load). */
export function migrateScene(raw: SceneDef): SceneDef {
  return {
    ...raw,
    version: 1,
    build: SCENE_BUILD,
    settings: { ...defaultSettings(), ...(raw.settings || {}) },
    objects: (raw.objects || []).map((o) => ({ ...o, effects: { ...defaultEffects(), ...(o.effects || {}) } })),
  };
}

/** The starter journey — a full ascent arc from a home world to the Master Core. */
export function defaultScene(): SceneDef {
  const place = (kind: ObjKind, t: number, lateral: number, depth: number, over: Partial<SceneObject> = {}): SceneObject => ({
    ...makeObject(kind, t),
    lateral,
    depth,
    ...over,
  });
  return {
    version: 1,
    build: SCENE_BUILD,
    name: "The Ascent",
    settings: { ...defaultSettings(), pathLength: 132 },
    objects: [
      // procedural worlds (three.js) + real Meshy models threaded up the column
      // Master Core — the end-game payoff — sits all the way down, deep in the background.
      place("core", 0.04, 0.12, -0.85, { name: "Master Core", model: "core", scale: 3.8, spin: 0.9 }),
      place("planet", 0.09, -0.42, 0.2, { name: "Homeworld", scale: 3.3, color: "#3f6fd0", emissive: "#4a7bff", emissiveIntensity: 0.4 }),
      place("asteroid", 0.12, 0.55, -0.1, { name: "Drift", scale: 1.35, model: "rock-a", spin: 0.5, motion: "driftUp" }),
      place("crystal", 0.2, -0.34, 0.3, { name: "Wanderer", scale: 1.0, model: "comet", spin: 0, motion: "flyby", effects: { ...defaultEffects(), halo: true, dust: true } }),
      place("station", 0.29, 0.44, 0.0, { name: "Waystation", scale: 1.55, model: "satellite-img", spin: 0.35, effects: { ...defaultEffects(), light: true, lightIntensity: 1.3, halo: true } }),
      place("station", 0.24, -0.5, 0.2, { name: "Voyager", scale: 1.35, model: "voyager", spin: 0, bob: 0.2, motion: "cruise" }),
      place("asteroid", 0.37, -0.52, 0.35, { name: "Drift II", scale: 1.05, model: "rock-b", spin: 0.7, motion: "driftUp", motionSpeed: 0.8 }),
      place("station", 0.45, 0.3, -0.22, { name: "Prospector", scale: 1.35, model: "miner", spin: 0.12, motion: "hover", effects: { ...defaultEffects(), light: true, lightIntensity: 1.1 } }),
      place("asteroid", 0.42, 0.46, -0.3, { name: "Emberrock", scale: 1.05, model: "rock-lava", spin: 0.6, motion: "driftUp", motionSpeed: 1.2 }),
      // The Gate — a distant portal in the middle of the journey, deep in the background.
      place("gate", 0.52, 0.6, -1.1, { name: "The Gate", model: "gate", scale: 2.6, spin: 0.3 }),
      // a red sister-world of the Homeworld, mid-journey, further back
      place("planet", 0.48, -0.55, -0.55, { name: "Ember World", scale: 2.6, color: "#c0392b", emissive: "#ff5030", emissiveIntensity: 0.45 }),
      place("asteroid", 0.64, -0.5, 0.22, { name: "Rubylode", scale: 1.4, model: "asteroid-ruby", spin: 0.4, motion: "hover", effects: { ...defaultEffects(), halo: true } }),
      place("planet", 0.53, -0.5, 0.25, { name: "Moon", scale: 1.7, color: "#8b8fa4", emissive: "#5a6b9c", emissiveIntensity: 0.25 }),
      place("asteroid", 0.6, 0.52, 0.0, { name: "Lodestone", scale: 1.65, model: "asteroid-gem", spin: 0.45, motion: "hover", effects: { ...defaultEffects(), halo: true } }),
      place("station", 0.68, -0.34, 0.2, { name: "Ascender", scale: 1.5, model: "rocket", spin: 0.3, motion: "driftUp", motionSpeed: 2.4, effects: { ...defaultEffects(), light: true, lightIntensity: 1.0 } }),
      place("asteroid", 0.74, 0.4, -0.15, { name: "Pebble", scale: 0.8, model: "rock-c", spin: 0.9, motion: "driftUp", motionSpeed: 1.5 }),
      place("station", 0.87, -0.3, 0.0, { name: "The Beacon", scale: 1.5, model: "beacon", spin: 0.4, effects: { ...defaultEffects(), light: true, lightIntensity: 1.4, halo: true } }),
      // Ringworld + its orbiting moon crowns the summit
      place("planet", 0.95, 0.08, 0.1, { name: "Ringworld", scale: 3.0, color: "#c98a4a", emissive: "#ffb060", emissiveIntensity: 0.4, orbitMoon: true, effects: { ...defaultEffects(), ring: true } }),
    ],
  };
}
