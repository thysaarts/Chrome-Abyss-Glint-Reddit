/**
 * The BANK NOW ceremony's cell walk — WHICH tiles light up, line up and fly
 * when a bank plays. Extracted pure so a test can hold it to the engine's
 * claim rule: the ceremony must walk exactly the cells the engine banks.
 *
 * VERSUS: the opponent's claim is a WALL here exactly as it is in the engine's
 * bankCluster — without it the ceremony lit and hid the claimed gems, visually
 * "banking" the opponent's combo only for it to reappear at the commit (the
 * duel surfaced this; the engine itself was never wrong). The banker's OWN
 * claim is bankable and stays in the walk, mirroring the engine.
 */
import { GameState, opponentClaimSet } from "../game/engine";

export function ceremonyCluster(st: GameState, cellKey: string): string[] {
  const activated = new Set(st.activatedCells);
  for (const k of opponentClaimSet(st)) activated.delete(k);
  const clusterOrder: string[] = [];
  const seen = new Set<string>([cellKey]);
  const queue = [cellKey];
  while (queue.length) {
    const k = queue.shift()!;
    if (!activated.has(k)) continue;
    clusterOrder.push(k);
    for (const nb of st.adj.get(k) ?? []) {
      if (activated.has(nb) && !seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return clusterOrder;
}
