// Runs a TypeScript module through Vite's SSR loader so it can import src/ without
// extensions (vite-node is not shipped with this vitest version).
// Usage: node packages/core/scripts/run-ts.mjs <file.ts>, with <file.ts> relative to packages/core
// (the Vite root is always this package, whatever the current directory is).
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const target = process.argv[2];
if (!target) {
  console.error('usage: node packages/core/scripts/run-ts.mjs <file.ts>');
  process.exit(2);
}
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  logLevel: 'error',
});
try {
  await server.ssrLoadModule(`/${target.split(String.fromCharCode(92)).join('/')}`);
} finally {
  await server.close();
}
