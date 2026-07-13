import { defineConfig } from "vitest/config";

// the engine sweeps play 250 seeded games per case — well past the 5s default
export default defineConfig({ test: { testTimeout: 120000 } });
