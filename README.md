# webgames

`webgames` is a placeholder name for a TypeScript browser-game project: a deterministic game engine plus a creature roguelike built on top of it. The name is a placeholder and may change.

## Layout

The repository is an npm workspaces monorepo:

| Path | Package | Contents |
|---|---|---|
| `packages/core` | `@webgames/core` | The deterministic engine and everything that does not need a page: `src/sim` (battle and run simulation), `src/content`, `src/art` (sprite generator and palettes, as data), `src/platform` (strings, i18n, run saves) and `src/models` (the pure screen models: map, event, end, battle menu). Its tests, the golden replays (`packages/core/tests/golden/*.golden.json`) and the owner scripts (goldens, bots, art preview) live here too. TypeScript source is consumed directly, without a build step: imports look like `@webgames/core/sim/run/run`. |
| `apps/web` | `@webgames/web` | The browser game: `index.html`, `src/main.ts`, the DOM and Pixi views (`src/view`), keyboard/gamepad input, the Vite and Playwright configs, view unit tests and the end-to-end specs (`tests/e2e`). It imports the engine only through `@webgames/core/...`. |

All commands below run from the repository root.

## Development

```sh
npm install
npm run dev        # start the Vite dev server for apps/web (open the printed URL to play)
npm test           # unit tests of every workspace (Vitest projects: core and web)
npm run typecheck  # strict TypeScript check of the root config and every workspace
npm run build      # production build into apps/web/dist/
npm run size       # gzipped initial JS+CSS of apps/web/dist/ must be <= 2,000,000 bytes
npm run test:e2e   # end-to-end, determinism and accessibility specs (Playwright, apps/web/tests/e2e)
npm run bots       # bot statistics over many runs (npm run bots -- 300: 300 seeds x 3 starters)
npm run golden:update # regenerate packages/core/tests/golden/battle.golden.json (review the diff before committing it)
npm run golden:runs   # regenerate packages/core/tests/golden/run.golden.json (review the diff before committing it)
npm run art:preview   # write packages/core/art-preview.html with every sprite (git-ignored)
```

## Playing

Run `npm run dev` and open the page. The title screen starts a run (an Expedition): pick a starter, keep or type a seed, and choose **New run**. A run is three zones of node maps (wild creatures, elites, shrines, caches, mysteries and a boss per zone). Between battles you recruit defeated creatures, rest or evolve at shrines, and a creature that faints is lost for the run. `?seed=NAME` prefills the seed: the same seed and the same choices always give the same run.

Play with the keyboard (Tab or arrows, Enter to confirm) or by clicking or tapping; in battle a gamepad also works. The page is available in Spanish and English and has a reduced-motion toggle and a text-size slider.

- **Saves live in this browser.** The run is saved automatically after every action (every battle turn included) in `localStorage` under the key `webgames.run.v1`, and **Continue run** on the title screen resumes it. Clearing the site data deletes the save. If the browser blocks storage, the run stays playable and a warning says it is not being saved. A damaged save is reported and can be discarded.
- **Single battle.** `?mode=battle` (for example `/?mode=battle&seed=NAME`) opens the phase-1 demo battle on its own, without a run.
- **Balance.** With the current numbers the game is effectively unwinnable: the bots win 0 of 900 runs (300 seeds x 3 starters) and rarely leave zone 0, and even a search with perfect information wins only about 1 run in 15. Balance is phase 3 work.
- **Known issue.** The battle engine still has no turn limit, so a boss that heals (the zone-1 Thorn Sovereign with mending_moss) can make a fight endless. Reloading resumes the same battle; the battle screen has an **Abandon run** button, and **New run** on the title screen starts over.

## End-to-end tests

`npm run test:e2e` starts the dev server on port 5199 and runs the specs in `apps/web/tests/e2e`:

- `determinism.spec.ts`: the battle and run golden replays (`packages/core/tests/golden/*.golden.json`) run inside the page (loading the core modules from the dev server) and are compared with the stored hashes, results and scores.
- `battle.spec.ts`: the `?mode=battle` flows (keyboard, click, reduced motion, hidden tab).
- `run.spec.ts`: a whole run by keyboard; a reload in the middle of a battle (Continue resumes the same battle and the run ends exactly as without the reload); a corrupted save; blocked storage; abandoning a run; crafted saves for the recruit, shrine, cache, mystery and won screens in English and Spanish.
- `a11y.spec.ts` and `run-a11y.spec.ts`: axe (WCAG 2.2 AA and best practice) on the battle, title, map, event and end screens in light/dark, en/es, 320 and 1000 px at text size 150%. They also check horizontal overflow, 44x44 px targets at 320 px, node types named in text and focus after each screen change.

Notes:

- If a dev server from another project already holds port 5199, stop it first: outside CI, Playwright reuses whatever answers on that port.
- The hidden-tab specs simulate a document that reports itself hidden and a page whose animation frames never fire; they do not simulate real browser throttling or backgrounding.
- Locally, the `chromium` and `mobile` (320x640, touch) projects run in Microsoft Edge (`channel: 'msedge'`), so no browser is downloaded. Set `PW_CHANNEL` to use another channel.
- The `firefox` and `webkit` projects only exist when `CI` or `PW_ALL` is set. CI installs them with `npx playwright install --with-deps chromium firefox webkit`.
- Cross-engine determinism (Firefox and WebKit) has **not** been verified locally; it is only verified when CI runs.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Engine core and one playable battle: deterministic simulation, content, generated art, input layer, Spanish/English strings, battle view, golden replays, size budget, accessibility specs | Done |
| 2 | Run loop: node maps over three zones, party, recruiting, shrines and evolution, bosses, score, autosave and resume, title/map/event/end screens, run bot and golden runs | Done (balance not tuned) |
| 3-5 | Content and balance, community features, release | Not started |

## Design

See the [creature roguelike design spec](docs/superpowers/specs/2026-11-14-creature-roguelike-design.md).

## Licence

[MIT](LICENSE) (c) 2026 Sebas1705.
