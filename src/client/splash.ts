// INLINE (feed) view — one job: expand into the game entrypoint on tap.
import { requestExpandedMode } from "@devvit/web/client";

document.getElementById("play")!.addEventListener("click", (e) => {
  requestExpandedMode(e, "game");
});
