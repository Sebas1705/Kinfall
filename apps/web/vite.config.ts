import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  test: { name: 'web', include: ['tests/**/*.test.ts'] },
});
