/**
 * QUICK PLAY new-starter tips — which of the three one-time briefings have
 * fired. They only ever show on Quick Play runs while the campaign frontier is
 * below 2 (Tutorial + Academy not both done); each forces itself exactly once
 * per device: `ropes` at the first quick board, `clearing` after the first
 * bank, `rush` when GLINT RUSH arms. The TIPS pill re-opens the cycle any time.
 */
import { readStored, writeStored, removeStored } from "./storage";

const KEY = "glint.quickplaytips.v1";

interface Flags {
  seenIntro: boolean; // the "Learn the ropes" page auto-opened once
  seenBank: boolean; // the post-first-bank page auto-opened once
  seenRush: boolean; // the GLINT RUSH page auto-opened once
  bankReached: boolean; // unlocks the clearing page in the cycle
  rushReached: boolean; // unlocks the rush page in the cycle
}

const load = (): Flags => readStored<Flags>(KEY, { seenIntro: false, seenBank: false, seenRush: false, bankReached: false, rushReached: false });

export const quickTipFlags = load;
export function markQuickIntroSeen(): void {
  writeStored(KEY, { ...load(), seenIntro: true });
}
export function markQuickBankSeen(): void {
  writeStored(KEY, { ...load(), seenBank: true, bankReached: true });
}
export function markQuickRushSeen(): void {
  writeStored(KEY, { ...load(), seenRush: true, rushReached: true });
}
/** Reset progress → a fresh start replays the quick-play onboarding too. */
export function resetQuickPlayTips(): void {
  removeStored(KEY);
}
