/**
 * DAILY CHALLENGE ISSUERS — each objective type is "set" by one of the seven
 * Chrome Abyss characters (assignment decided by Thys, 2026-08-20, lore-led):
 * the Siren issues the chain challenges, the Ghost the stealthy ones, the
 * Broker (the house) the banking ones, and so on. The Siren carries three types
 * because chains are hers thematically; her types appear less often each, so
 * exposure balances out across characters.
 *
 * Shipped design (variant A of the 2026-08-20 mockups): the avatar leads the
 * daily row with the type glyph as a small corner badge; the badge becomes the
 * green check once the challenge is done.
 */
export type DailyCharacter = "sentinel" | "outlaw" | "enforcer" | "broker" | "ghost" | "hacker" | "siren";

export const CHARACTER_FOR: Record<string, DailyCharacter> = {
  // remapped 2026-08-21 (Thys): clear → Sentinel, banks → Outlaw, so the
  // Broker issues cashout + versus — beating the bank IS her challenge
  dross: "sentinel",
  clear: "sentinel",
  score: "outlaw",
  banks: "outlaw",
  nebulite: "enforcer",
  bankscore: "enforcer",
  cashout: "broker",
  versus: "broker",
  rush: "ghost",
  nobust: "ghost",
  fulldrift: "hacker",
  turn: "hacker",
  convergence: "siren",
  harmony: "siren",
  accord: "siren",
};

export const characterAvatarUrl = (c: DailyCharacter): string => `/avatars/${c}.webp`;
