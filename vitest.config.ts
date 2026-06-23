import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Pure TS domain/adapter/use-case tests run in the Node environment with no
// network. The `@/*` alias mirrors tsconfig's path mapping so tests import the
// same way application code does. UI/e2e tests are deferred (design §10).
//
// `*.supabase.test.ts` are excluded here: they hit the live Supabase DB and need
// secrets, so they stay out of the default (keyless) run and CI. Run them on
// demand with `npm run test:supabase` (vitest.supabase.config.ts).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Force keyless: strip any real-mode env Vitest loaded from `.env`, so the
    // env-selected composition can never write to a live backend (#103).
    setupFiles: ["./test/setup/keyless-env.ts"],
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.supabase.test.ts"],
  },
});
