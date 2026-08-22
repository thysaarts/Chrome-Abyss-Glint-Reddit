/**
 * CHAMPIONS — the six pickable Chrome Abyss characters for versus/co-op
 * (idea #12, shipped 2026-08-20). Six, not seven: six is the game's magic
 * number and the Broker is the house — she runs the table (and fronts the
 * tutorial as YOUR TUTOR instead). Purely cosmetic: the choice travels as a
 * broadcast on the match's chat channel and never touches the engine.
 */
import type { DailyCharacter } from "./dailyCharacters";

export type Champion = Exclude<DailyCharacter, "broker">;
export const CHAMPIONS: Champion[] = ["sentinel", "outlaw", "enforcer", "ghost", "hacker", "siren"];

export const championAvatar = (c: Champion | "broker", size: "sm" | "lg" = "sm"): string =>
  `/avatars/${c}${size === "lg" ? "-lg" : ""}.webp`;

const KEY = "glint.champion.v1";

/** The locally chosen champion (persists across matches; null = never picked). */
export function loadChampion(): Champion | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && (CHAMPIONS as string[]).includes(v) ? (v as Champion) : null;
  } catch {
    return null;
  }
}

export function saveChampion(c: Champion): void {
  try { localStorage.setItem(KEY, c); } catch { /* storage unavailable */ }
}

/** The catchphrase events (one CMS line per event per champion). */
export type ChampionEvent = "idle" | "chain" | "bust2" | "coopBank" | "rivalBust";
