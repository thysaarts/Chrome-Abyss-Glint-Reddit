/**
 * THE ACADEMY's tips — which briefings the player has already been shown.
 * The Nebulite intro auto-opens on the FIRST Academy launch only; the GLINT
 * RUSH page auto-opens the first time the rush is reached in the Academy (and
 * joins the cycle afterwards). The TIP pill re-opens the briefing any time.
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
/** Reset progress → replay The Academy's onboarding tips from scratch. */
export function resetAcademyTips(): void {
  removeStored(KEY);
}
