import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // src/ is the DOM-free domain core; lib/ holds the offline-queue logic
    // (in-memory store + drain orchestration) — both pure + unit-tested here.
    include: ['src/**/*.test.ts', 'lib/**/*.test.ts'],
  },
});
