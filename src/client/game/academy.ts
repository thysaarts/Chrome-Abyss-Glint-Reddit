/**
 * SECTOR 01 OUTPOST's tips — which briefings the player has already been shown.
 * The Nebulite intro auto-opens on the FIRST launch of that level only; the GLINT
 * RUSH page auto-opens the first time the rush is reached there (and joins the
 * cycle afterwards). The TIP pill re-opens the briefing any time.
 */
import { readStored, writeStored, removeStored } from "./storage";

const KEY = "glint.academytips.v1";

interface Flags {
  seenIntro: boolean; // the Nebulite briefing auto-opened once
  seenRush: boolean; // the GLINT RUSH page auto-opened once
  rushReached: boolean; // unlocks the rush page in the cycle
  seenBankTip: boolean; // the post-first-bank briefing auto-opened once
}

const load = (): Flags => readStored<Flags>(KEY, { seenIntro: false, seenRush: false, rushReached: false, seenBankTip: false });

export const academyFlags = load;
export function markIntroSeen(): void {
  writeStored(KEY, { ...load(), seenIntro: true });
}
export function markRushSeen(): void {
  writeStored(KEY, { ...load(), seenRush: true, rushReached: true });
}
export function markBankTipSeen(): void {
  writeStored(KEY, { ...load(), seenBankTip: true });
}
// the one-time ASCENT CHEER after the Academy's unlock celebration finishes —
// its own key (not a Flags field): it belongs to the campaign moment, not the
// briefing cycle, and a stray tips write must never resurrect it
const CHEER_KEY = "glint.academycheer.v1";

/** Has the post-Academy celebration pop-up already been shown on the Ascent? */
export const academyCheerSeen = (): boolean => readStored<boolean>(CHEER_KEY, false);
export function markAcademyCheerSeen(): void {
  writeStored(CHEER_KEY, true);
}

/** Reset progress → replay The Academy's onboarding tips (and the cheer) from scratch. */
export function resetAcademyTips(): void {
  removeStored(KEY);
  removeStored(CHEER_KEY);
}
