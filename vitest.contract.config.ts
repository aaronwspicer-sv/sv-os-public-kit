// Separate Vitest config for the contract tests — they hit live Notion
// and Supabase, so we ONLY run them when explicitly requested via
// `npm run test:contract`. The default config excludes them.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.contract.test.ts"],
    // 30s per test — live Notion calls can be slow under load
    testTimeout: 30_000,
  },
});
