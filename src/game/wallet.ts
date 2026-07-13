/**
 * WALLET — the player's Nebulite currency, device-local.
 *
 * Earned by completing daily challenges (+5 each) and by acquiring Nebulites in a
 * run; spent in the Shop. Kept deliberately tiny — a single integer balance.
 */
import { readVersioned, writeVersioned } from "./storage";

const KEY = "glint.wallet.v1";
const SAVE_V = 1; // bump + pass migrate() when the wallet payload shape changes

export function loadWallet(): number {
  const n = readVersioned<{ nebulite: number }>(KEY, { nebulite: 0 }, SAVE_V).nebulite;
  return typeof n === "number" && n >= 0 ? Math.floor(n) : 0;
}

export function saveWallet(n: number): void {
  writeVersioned(KEY, { nebulite: Math.max(0, Math.floor(n)) }, SAVE_V);
}

export function resetWallet(): void {
  saveWallet(0);
}
