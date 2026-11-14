# webgames

`webgames` is a placeholder name for a TypeScript browser-game project: a deterministic game engine plus a creature roguelike built on top of it. The name will change.

## Development

```sh
npm install
npm run dev        # start the Vite dev server (open the printed URL to play)
npm test           # unit tests (Vitest, tests/**/*.test.ts)
npm run typecheck  # strict TypeScript check
npm run build      # production build into dist/
npm run size       # gzipped initial JS+CSS of dist/ must be <= 2,000,000 bytes
npm run test:e2e   # end-to-end, determinism and accessibility specs (Playwright)
```

## Playing

Run `npm run dev` and open the page. Pick a move or swap with the keyboard (arrows or Tab, Enter to confirm), by clicking or tapping, or with a gamepad. `?seed=NAME` makes a battle reproducible: the same seed and the same choices always give the same result. The page is available in Spanish and English and has a reduced-motion toggle and a text-size slider.

## End-to-end tests

`npm run test:e2e` starts the dev server on port 5199 and runs the specs in `tests/e2e`: golden-replay determinism, battle flows (keyboard, click, reduced motion, hidden tab) and an axe accessibility matrix (light/dark, en/es, 320 and 1000 px, text size 150%).

- Locally, the `chromium` and `mobile` (320x640, touch) projects run in Microsoft Edge (`channel: 'msedge'`), so no browser is downloaded. Set `PW_CHANNEL` to use another channel.
- The `firefox` and `webkit` projects only exist when `CI` or `PW_ALL` is set. CI installs them with `npx playwright install --with-deps chromium firefox webkit`.
- Cross-engine determinism (Firefox and WebKit) has **not** been verified locally; it is only verified when CI runs.

## Status

Phase 1 (engine core and one playable battle) is implemented: deterministic simulation, content, generated art, input layer, Spanish/English strings, battle view, golden replays, size budget and accessibility specs. Later phases (run loop, content, community features, release) are not started.

## Design

See the [creature roguelike design spec](docs/superpowers/specs/2026-11-14-creature-roguelike-design.md).

## Licence

[MIT](LICENSE) (c) 2026 Sebas1705.
