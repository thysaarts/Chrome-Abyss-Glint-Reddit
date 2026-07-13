import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      input: {
        // the game
        main: resolve(__dirname, "index.html"),
        // the CMS/admin page — deployed alongside the game at /admin.html but
        // never linked from it
        admin: resolve(__dirname, "admin.html"),
        // the 3D Studio demo — standalone scene builder at /demo.html
        demo: resolve(__dirname, "demo.html"),
        // the model gallery — orbit-viewer for generated Meshy .glb at /models.html
        models: resolve(__dirname, "models.html"),
      },
    },
  },
});
