import { defineConfig } from 'vitest/config';

// Runs the unit tests of every workspace; each one keeps its own config.
export default defineConfig({
  test: { projects: ['packages/core', 'apps/web'] },
});
