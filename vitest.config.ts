import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pure TS domain/adapter/use-case tests run in the Node environment with no
// network. The `@/*` alias mirrors tsconfig's path mapping so tests import the
// same way application code does. UI/e2e tests are deferred (design §10).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
