// Vitest config — small, fast unit test runner. Used for the lib helpers
// (DST math, crypto, finance splits). The schema-contract test hits live
// Notion via the SDK; it only runs when NOTION_API_KEY is in env (so CI
// won't fail in PR builds that don't have access to the integration token).
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
    include: ["src/**/*.test.ts"],
    // Don't run schema-contract tests by default — they hit real Notion.
    // Run them explicitly via `npm run test:contract`.
    exclude: ["node_modules", ".next", "src/**/*.contract.test.ts"],
  },
});
