/**
 * GLYPHS — the shared stroke-icon set for challenge rows (and anywhere else a
 * small pictogram is needed). The first eight match the objective types, so an
 * entry with no explicit icon falls back to its type's glyph naturally. The
 * rest are flavour picks selectable per daily challenge in the CMS.
 */

export const GLYPH_KEYS = [
  "dross", "score", "nebulite", "fulldrift", "clear", "banks", "rush", "cashout",
  "gem", "star", "heart", "flame", "snow", "skull", "rocket", "planet",
  "moon", "sun", "clock", "dice", "trophy", "shield", "wave", "music",
  "eye", "hex", "spark", "crown",
] as const;

const PATHS: Record<string, React.ReactNode> = {
  dross: <path d="M12 3l7 4v10l-7 4-7-4V7z" />,
  score: <><path d="M4 19V5M4 19h16" /><path d="M8 15l3.5-4 3 2.5L20 8" /></>,
  nebulite: <><circle cx="12" cy="12" r="3.4" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></>,
  fulldrift: <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" />,
  clear: <path d="M20 6 9 17l-5-5" />,
  banks: <path d="M4 10 12 5l8 5M6 10v8h12v-8M9 18v-4h6v4" />,
  rush: <path d="M13 3 4 14h6l-1 7 9-11h-6z" />,
  cashout: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  gem: <><path d="M12 3 20 9l-8 12L4 9z" /><path d="M4 9h16M12 3 8.5 9 12 21l3.5-12z" /></>,
  star: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 5.9L12 16.4 6.7 19.3l1.2-5.9L3.4 9.3l6-.7z" />,
  heart: <path d="M12 20C6 15.6 3.5 12.6 3.5 9.5 3.5 7 5.5 5 8 5c1.6 0 3.1.8 4 2.1C12.9 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.5 0 3.1-2.5 6.1-8.5 10.5z" />,
  flame: <path d="M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1-.5-2-1-2.6 2 .6 4 2.6 4 5.6a6 6 0 0 1-12 0c0-5 5-7 6-11z" />,
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />,
  skull: <><circle cx="12" cy="10" r="6" /><path d="M9 15.5V20M15 15.5V20M12 16.5V20" /><circle cx="9.8" cy="9.5" r="1" fill="currentColor" stroke="none" /><circle cx="14.2" cy="9.5" r="1" fill="currentColor" stroke="none" /></>,
  rocket: <><path d="M12 3c2.6 1.8 4 5.2 4 9l-2 2.5h-4L8 12c0-3.8 1.4-7.2 4-9z" /><circle cx="12" cy="9" r="1.6" /><path d="M9 14l-3 5 3.4-1M15 14l3 5-3.4-1" /></>,
  planet: <><circle cx="12" cy="11" r="5.5" /><ellipse cx="12" cy="12.5" rx="9.5" ry="3" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3.5 2" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" /><circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" /></>,
  trophy: <><path d="M8 4h8v4.5a4 4 0 0 1-8 0z" /><path d="M8 5H5a2.6 2.6 0 0 0 3 3.6M16 5h3a2.6 2.6 0 0 1-3 3.6" /><path d="M12 12.5V16M9 20h6M10 16h4v4h-4z" /></>,
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  wave: <path d="M3 12c2-3.4 4-3.4 6 0s4 3.4 6 0 4-3.4 6 0" />,
  music: <><path d="M9 18V6l10-2v12" /><circle cx="6.8" cy="18" r="2.3" /><circle cx="16.8" cy="16" r="2.3" /></>,
  eye: <><path d="M2 12s4-6.2 10-6.2S22 12 22 12s-4 6.2-10 6.2S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></>,
  hex: <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />,
  spark: <path d="M12 3l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8z" />,
  crown: <path d="M4 18h16M4 18 3 8l5 4 4-7 4 7 5-4-1 10z" />,
};

export function Glyph({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name] ?? PATHS.score}
    </svg>
  );
}
