import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // No preload helper for the lazy chunks: it would cost the initial bundle about 0.5 KB, and a
    // lazy chunk's own imports are fetched one round trip later instead (the scene shows when ready).
    modulePreload: false,
    rolldownOptions: {
      output: {
        // Everything the first page needs stays in one initial chunk. Without this, modules shared
        // by the page and the lazy art/battle chunks are split into extra initial files, which
        // costs bytes and requests on the first load.
        codeSplitting: { groups: [{ name: 'app', tags: ['$initial'] }] },
      },
    },
  },
  test: { name: 'web', include: ['tests/**/*.test.ts'] },
});
