/**
 * LEVEL GENERATION — a pure AUTHORING tool, used by the CMS admin page.
 *
 * "Generate +30 levels" in the admin runs this and appends the result to the
 * CMS level list (before the trailing boss level), where each generated level
 * becomes ordinary, editable, publishable content. Every player then climbs
 * the SAME ascent — nothing is generated on the player's device.
 *
 * Levels come in batches of three DISTINCT random regions (never generic),
 * each with an auto-composed location name ("Nanite Cave", "Apex Helix", …)
 * drawn from two 10-word banks per region; names are never reused within the
 * level list. Two of each batch unlock on a score requirement rising in small
 * steps from the campaign's 30,000 (capped at 60,000 so it stays achievable),
 * one on clearing the board. Difficulty climbs gradually but SLOWLY: +1 Dross
 * every four generated levels (capped), a second Nebulite on every fourth,
 * collapse thresholds creeping down gently.
 */
import { LevelDef, UnlockRule } from "./levels";

// the original hand-made campaign's length: the difficulty ramp counts levels
// BEYOND this point, so re-running the generator continues where it left off
const BASE_CAMPAIGN = 10;

// ---- the name banks: 10 flavour words × 10 place words per region ----
export const REGION_WORDS: Record<string, { a: string[]; b: string[] }> = {
  "Digital Nexus": {
    a: ["Nebula", "Neon", "Cyber", "Phase", "Echo", "Nanite", "Quantum", "Holo", "Buzz", "Lumo"],
    b: ["Cave", "City", "Grid", "Vault", "Sprawl", "Loop", "Core", "Haven", "Circuit", "Node"],
  },
  "Fringe Market": {
    a: ["Smuggler", "Copper", "Lantern", "Tarnish", "Barter", "Trinket", "Velvet", "Ashcoin", "Drifter", "Gilded"],
    b: ["Bazaar", "Alley", "Docks", "Quarter", "Stalls", "Arcade", "Row", "Wharf", "Court", "Exchange"],
  },
  "Machina Forge": {
    a: ["Piston", "Rivet", "Cinder", "Molten", "Iron", "Cog", "Slag", "Ember", "Steel", "Anvil"],
    b: ["Foundry", "Works", "Yard", "Assembly", "Line", "Depot", "Mill", "Pit", "Furnace", "Crucible"],
  },
  "Corporate Spire": {
    a: ["Apex", "Chrome", "Ledger", "Monolith", "Crown", "Sable", "Prime", "Vantage", "Meridian", "Onyx"],
    b: ["Tower", "Atrium", "Plaza", "Suites", "Exchange", "Terrace", "Helix", "Summit", "Annex", "Lobby"],
  },
  "Shadow Sector": {
    a: ["Phantom", "Umbral", "Whisper", "Veiled", "Static", "Cipher", "Dusk", "Hollow", "Shroud", "Wraith"],
    b: ["Den", "Underpass", "Warren", "Backstreets", "Refuge", "Cellar", "Passage", "Hideout", "Tunnels", "Yard"],
  },
  "Divinity Enclave": {
    a: ["Halo", "Seraph", "Oracle", "Radiant", "Celest", "Aurel", "Grace", "Zenith", "Lumen", "Votive"],
    b: ["Sanctum", "Chapel", "Spire", "Gardens", "Cloister", "Basilica", "Shrine", "Choir", "Reliquary", "Steps"],
  },
  "Military Bastion": {
    a: ["Vanguard", "Bulwark", "Titan", "Sentinel", "Warden", "Redline", "Breaker", "Aegis", "Javelin", "Ironside"],
    b: ["Garrison", "Outpost", "Barracks", "Rampart", "Bunker", "Stronghold", "Watchtower", "Armory", "Trench", "Citadel"],
  },
};

const rand = (n: number) => Math.floor(Math.random() * n);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A never-used "Flavour Place" name for the region. Falls back to an
 *  exhaustive scan, and only when all 100 combinations are burnt does it allow
 *  a suffixed reuse. */
function pickName(region: string, used: Set<string>): string {
  const { a, b } = REGION_WORDS[region];
  for (let tries = 0; tries < 60; tries++) {
    const name = `${a[rand(a.length)]} ${b[rand(b.length)]}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  for (const wa of a) {
    for (const wb of b) {
      const name = `${wa} ${wb}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  }
  const name = `${a[rand(a.length)]} ${b[rand(b.length)]} II`;
  used.add(name);
  return name;
}

/**
 * Generate `count` new levels (a multiple of 3) that continue the ascent after
 * `existing` (the CMS level list WITHOUT any trailing boss level). Pure aside
 * from randomness — the caller decides where to put the result.
 */
export function generateLevels(existing: LevelDef[], count: number): LevelDef[] {
  const used = new Set(existing.map((l) => l.title));
  let scoreGated = existing.slice(BASE_CAMPAIGN).filter((l) => l.unlockRule.type === "score").length;
  const out: LevelDef[] = [];

  for (let batch = 0; batch < Math.ceil(count / 3); batch++) {
    const regions = shuffle(Object.keys(REGION_WORDS)).slice(0, 3);
    const clearIdx = rand(3); // one level per batch unlocks by clearing the board
    regions.forEach((region, i) => {
      if (out.length >= count) return;
      // 0-based index across all post-campaign levels — the difficulty clock
      const seq = Math.max(0, existing.length - BASE_CAMPAIGN) + out.length;
      let unlockRule: UnlockRule;
      let unlockText: string;
      if (i === clearIdx) {
        unlockRule = { type: "boardCleared" };
        unlockText = "Clear the board to unlock";
      } else {
        const req = Math.min(30000 + (scoreGated + 1) * 2000, 60000);
        scoreGated += 1;
        unlockRule = { type: "score", value: req };
        unlockText = `Earn ${req.toLocaleString("en-US")} points to unlock`;
      }
      out.push({
        title: pickName(region, used),
        region,
        theme: "regions" as const,
        unlockText,
        unlockRule,
        params: {
          side: 6 as const,
          dross: Math.min(6 + Math.floor(seq / 4), 10), // +1 every 4 levels, capped
          nebulites: seq % 4 === 3 ? 2 : 1, // a second Nebulite on every 4th
          collapseAt1: Math.max(14, 20 - Math.floor(seq / 3)), // collapses creep earlier…
          collapseAt2: Math.max(7, 10 - Math.floor(seq / 6)), // …slowly
        },
      });
    });
  }
  return out;
}
