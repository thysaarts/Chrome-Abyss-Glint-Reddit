/**
 * Haptic feedback — a single seam for tactile beats so a native build is a
 * one-file swap. On the web only Android exposes `navigator.vibrate` (iOS Safari
 * ignores it); a Capacitor build replaces the body with the Haptics plugin. The
 * vocabulary is intentional (not raw durations) so call sites read as feedback.
 */
export type HapticKind = "tap" | "bank" | "bust" | "unlock";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8, // a light confirm
  bank: 16, // a satisfying thunk on a bank
  bust: [0, 45, 35, 45], // a sharp double buzz — you lost a life
  unlock: [0, 22, 45, 22], // a celebratory pulse
};

export function haptic(kind: HapticKind): void {
  try {
    const nav = navigator as unknown as { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === "function") nav.vibrate(PATTERNS[kind]);
  } catch {
    /* unsupported / blocked — silently no-op */
  }
}
