/**
 * WALLET — the player's Nebulite currency, device-local.
 *
 * Earned by completing daily challenges (+5 each) and by acquiring Nebulites in a
 * run; spent in the Shop. Kept deliberately tiny — a balance plus `at`, the
 * epoch-ms of the last change: the wallet is the one synced value that goes DOWN
 * (spending), so cross-device merges take the NEWEST amount, not the biggest
 * (the old max() rule un-spent purchases on every sync).
 */
import { readVersioned, writeVersioned } from "./storage";

const KEY = "glint.wallet.v1";
const SAVE_V = 2; // v2: adds `at` (last-change epoch ms) for newest-wins syncing

interface WalletPayload { nebulite: number; at: number }

/** v1 → v2: legacy payloads carry no timestamp; `at: 0` marks them as "oldest",
 *  so any stamped value (and legacy-vs-legacy max) wins over them in a merge. */
const migrate = (d: unknown): WalletPayload => {
  const n = (d as { nebulite?: unknown } | null)?.nebulite;
  return { nebulite: typeof n === "number" && n >= 0 ? Math.floor(n) : 0, at: 0 };
};

export function loadWallet(): number {
  const n = readVersioned<WalletPayload>(KEY, { nebulite: 0, at: 0 }, SAVE_V, migrate).nebulite;
  return typeof n === "number" && n >= 0 ? Math.floor(n) : 0;
}

export function saveWallet(n: number): void {
  writeVersioned(KEY, { nebulite: Math.max(0, Math.floor(n)), at: Date.now() }, SAVE_V);
}

export function resetWallet(): void {
  saveWallet(0);
}
