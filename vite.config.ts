import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devvit } from "@devvit/start/vite";

// The devvit() plugin drives the whole build from devvit.json: the client
// entrypoints (src/client/*.html -> dist/client), the server bundle
// (src/server/index.ts -> dist/server/index.cjs) and copying public/.
export default defineConfig({
  plugins: [react(), devvit()],
});
