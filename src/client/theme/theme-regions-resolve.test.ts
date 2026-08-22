import { describe, it, expect } from "vitest";
import { REGIONS } from "./regions";
import { CONTENT } from "../content/content";

/**
 * EVERY board theme's `region` must resolve to a real palette in REGIONS.
 *
 * Settings › Themes lists only themes whose region resolves
 * (`themes().filter(t => t.region && REGIONS[t.region] && themeOwned(t))`), and
 * the Shop's ThemePreview renders `REGIONS[t.region] ?? null`. So a theme whose
 * region is missing is INVISIBLE in Settings and previews blank in the Shop —
 * a player can buy it and never equip it.
 *
 * That is exactly what happened to the seven `Faction: *` packs in this port:
 * content.json carried the themes (sold at 550–650 Nebulite) but regions.ts had
 * never received the matching palettes. This pins the two files together.
 */
describe("every themed region resolves to a palette", () => {
  const themes = ((CONTENT.collection as { themes?: { key: string; name: string; region?: string }[] }).themes ?? []);

  it("has themes to check", () => {
    expect(themes.length).toBeGreaterThan(0);
  });

  it("resolves every theme's region in REGIONS", () => {
    const unresolved = themes
      .filter((t) => t.region && !REGIONS[t.region])
      .map((t) => `${t.key} → "${t.region}"`);
    expect(unresolved).toEqual([]);
  });

  it("carries all seven FACTION PACK palettes", () => {
    for (const f of ["Outlaw", "Enforcer", "Hacker", "Sentinel", "Siren", "Ghost", "Broker"]) {
      expect(REGIONS[`Faction: ${f}`], `Faction: ${f}`).toBeTruthy();
    }
  });
});
