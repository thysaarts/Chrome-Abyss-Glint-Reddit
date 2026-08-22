// The @devvit/start vite plugin hardcodes sourcemap generation; the upload
// bundle must stay lean, so the maps are stripped after every build. The
// dangling sourceMappingURL comments are harmless (maps are only fetched
// with devtools open).
//
// BOTH halves get walked: dist/server's single index.cjs.map is the biggest
// map of the lot (~6 MB against a 1.7 MB bundle). This runs from devvit.json's
// `scripts.build`, which is what `devvit upload` actually invokes — package.json's
// build is only the local/preview path.
//
// .DS_Store rides along: devvit copies public/ into dist/client wholesale, so
// Finder's droppings ship unless they're swept here.
import { readdirSync, rmSync, statSync, existsSync } from "fs";
import { join } from "path";
let n = 0, bytes = 0;
const walk = (d) => {
  if (!existsSync(d)) return;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".map") || e.name === ".DS_Store") { bytes += statSync(p).size; rmSync(p); n++; }
  }
};
walk("dist/client");
walk("dist/server");
console.log(`stripped ${n} files (${(bytes / 1048576).toFixed(1)} MB)`);
