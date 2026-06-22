import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Gated, live-Supabase test config. Run via `npm run test:supabase` — NOT part
// of the default keyless run or required CI. Loads `.env` (gitignored) so the
// live-DB credentials are present before the suite imports the adapter.
loadEnv();

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.supabase.test.ts"],
  },
});
