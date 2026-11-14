// Runs a TypeScript module through Vite's SSR loader so it can import src/ without
// extensions (vite-node is not shipped with this vitest version). Usage: node scripts/run-ts.mjs <file.ts>
import { createServer } from 'vite';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/run-ts.mjs <file.ts>');
  process.exit(2);
}
const server = await createServer({
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
