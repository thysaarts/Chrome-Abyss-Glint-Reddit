// The @devvit/start vite plugin hardcodes sourcemap generation; the upload
// bundle must stay lean, so the maps are stripped after every build. The
// dangling sourceMappingURL comments are harmless (maps are only fetched
// with devtools open).
import { readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
let n = 0, bytes = 0;
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".map")) { bytes += statSync(p).size; rmSync(p); n++; }
  }
};
walk("dist/client");
console.log(`stripped ${n} source maps (${(bytes / 1048576).toFixed(1)} MB)`);
