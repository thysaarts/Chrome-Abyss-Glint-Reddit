/**
 * PLAYER AVATARS — a gem shape + a colour, the only cosmetic on a profile. Shown
 * beside a player's name in the Friends tab and on their Settings › Profile card.
 * Stored as {avatar_shape, avatar_color} on `profiles` (see migration 0009).
 *
 * Shapes are drawn as SVG paths in a 0..24 box (see AvatarGem in the UI). Keeping
 * the catalogue here — not in the CMS — because it's a fixed set the picker walks.
 */
export interface Avatar {
  shape: AvatarShape;
  color: string; // hex
}

// 18 gem CUTS (inspired by assets/gemshapes.jpg), ordered so they tile cleanly:
// 2 rows of 9 on the Settings card, 3 rows of 6 in the profile-setup picker.
// Grouped round → quads → polygons → triangular → organic → pointed.
export const AVATAR_SHAPES = [
  "circle", "oval", "diamond", "square", "cushion", "baguette", "hexagon", "octagon", "pentagon",
  "triangle", "trillion", "kite", "marquise", "teardrop", "shield", "heart", "star", "spark",
] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

// 18 colours (matches the 18 shapes → 2 rows of 9 / 3 rows of 6). Ordered around the
// hue wheel — red → orange → yellow → green → teal → blue → violet → magenta → rose —
// then the three neutrals as a light→dark ramp at the end.
export const AVATAR_COLORS = [
  "#ff5a5a", "#ff8a5c", "#ffb347", "#f5d76e", "#5cf0b6", "#22e39a",
  "#3ee0c8", "#4db8ff", "#3457d5", "#a78bfa", "#8b5cf6", "#6d28d9",
  "#e14dff", "#e0417a", "#ff6b8a", "#ffffff", "#c9ccdd", "#3b3e54",
] as const;

export const DEFAULT_AVATAR: Avatar = { shape: "diamond", color: "#a78bfa" };

/** SVG path `d` for each shape, in a 24×24 box (centre 12,12). Consumed by the
 *  AvatarGem component; kept as data so the picker and every render agree. */
export const SHAPE_PATH: Record<AvatarShape, string> = {
  diamond: "M12 2 L22 12 L12 22 L2 12 Z",
  square: "M4 4 H20 V20 H4 Z",
  circle: "M12 2 a10 10 0 1 0 0.001 0 Z",
  hexagon: "M12 2 L21 7 V17 L12 22 L3 17 V7 Z",
  octagon: "M8 3 H16 L21 8 V16 L16 21 H8 L3 16 V8 Z",
  pentagon: "M12 2 L22 9.5 L18 21 H6 L2 9.5 Z",
  triangle: "M12 3 L22 21 H2 Z",
  star: "M12 2 L14.6 9 L22 9.2 L16.2 13.8 L18.4 21 L12 16.6 L5.6 21 L7.8 13.8 L2 9.2 L9.4 9 Z",
  teardrop: "M12 2 C18 9 20 13 20 16 a8 8 0 1 1 -16 0 C4 13 6 9 12 2 Z",
  shield: "M12 2 L21 5 V12 C21 18 12 22 12 22 C12 22 3 18 3 12 V5 Z",
  heart: "M12 21 C4 15 2 10 5 6.5 C7.2 4 10.5 4.5 12 7 C13.5 4.5 16.8 4 19 6.5 C22 10 20 15 12 21 Z",
  spark: "M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z",
  // — gem cuts (assets/gemshapes.jpg) —
  oval: "M1 12 a11 7 0 1 0 22 0 a11 7 0 1 0 -22 0 Z",
  marquise: "M2 12 Q12 3 22 12 Q12 21 2 12 Z",
  kite: "M12 2 L19 9 L12 22 L5 9 Z",
  cushion: "M7 3 H17 Q21 3 21 7 V17 Q21 21 17 21 H7 Q3 21 3 17 V7 Q3 3 7 3 Z",
  baguette: "M8 2 H16 Q18 2 18 4 V20 Q18 22 16 22 H8 Q6 22 6 20 V4 Q6 2 8 2 Z",
  trillion: "M12 3.5 Q13 3.5 13.5 4.5 L20.5 18 Q21.2 20 19 20.3 L5 20.3 Q2.8 20 3.5 18 L10.5 4.5 Q11 3.5 12 3.5 Z",
};


