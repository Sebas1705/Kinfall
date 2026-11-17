# webgames

`webgames` is a placeholder name for a TypeScript browser-game project: a deterministic game engine plus a creature roguelike built on top of it. The name is a placeholder and may change.

## Layout

The repository is an npm workspaces monorepo:

| Path | Package | Contents |
|---|---|---|
| `packages/core` | `@webgames/core` | The deterministic engine and everything that does not need a page: `src/sim` (battle and run simulation), `src/content`, `src/art` (sprite generator and palettes, as data), `src/platform` (strings, i18n, run saves) and `src/models` (the pure screen models: map, event, end, battle menu). Its tests, the golden replays (`packages/core/tests/golden/*.golden.json`) and the owner scripts (goldens, bots, art preview) live here too. TypeScript source is consumed directly, without a build step: imports look like `@webgames/core/sim/run/run`. |
| `apps/web` | `@webgames/web` | The browser game: `index.html`, `src/main.ts`, the DOM and Pixi views (`src/view`), keyboard/gamepad input, the Vite and Playwright configs, view unit tests and the end-to-end specs (`tests/e2e`). It imports the engine only through `@webgames/core/...`. |
| `apps/mobile` | `@webgames/mobile` | The React Native app (Expo, TypeScript), at the scaffold stage: a "hello core" screen that plays a bot run from a seed with `@webgames/core` and shows its hash. Jest tests (`jest-expo`) live in `__tests__`. See [Mobile app](#mobile-app). |

Core is platform-neutral so it can also run under React Native (Hermes):

- Its source has no DOM and no Node globals. `packages/core/tsconfig.json` compiles `src` with `lib: ["ES2022"]` and no `types`, so `document`, `localStorage`, `navigator` or `console` fail `tsc`; `packages/core/tsconfig.test.json` covers tests and scripts (Node types and jsdom allowed). `packages/core/tests/platform-neutral.test.ts` also scans `src` for platform globals, including `globalThis`/`self` aliases that `tsc` would accept.
- State is copied with `clone()` (`src/sim/clone.ts`, plain data only) instead of `structuredClone`, which Hermes may lack.
- Platform services are injected by the app. i18n: `configureI18n({ storage, detect, onChange })` binds the shared `t()`/`getLang()`/`setLang()` (English and adapter-free until then); the web app calls `installWebI18n()` from `apps/web/src/platform/webI18n.ts` at startup (localStorage key `webgames.lang`, `navigator.language`, `<html lang>`). Run saves: `createRunStorage(storage, content)` takes a `StorageLike`, and `createAsyncRunStorage(storage, content)` (`src/platform/asyncRunStorage.ts`) is its promise-based twin for React Native, with the same slot `webgames.run.v1`, results and rules (it shares the helpers in `runStorage.ts`); the web app passes `defaultStorage()` from `apps/web/src/platform/webStorage.ts` (localStorage, or null when blocked).

All commands below run from the repository root.

## Development

```sh
npm install
npm run dev        # start the Vite dev server for apps/web (open the printed URL to play)
npm test           # unit tests of core and web (Vitest projects)
npm run test:mobile # unit tests of apps/mobile (Jest with jest-expo, runs on Node)
npm run typecheck  # strict TypeScript check of the root config and every workspace (core src without DOM, core tests, mobile, web)
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

## Mobile app

`apps/mobile` is an Expo (managed) app on Expo SDK 58 (React Native 0.88.1, React 19.3.0; the three are pinned to exact versions so device determinism checks are reproducible). It has no native folders: it runs in Expo Go, and `apps/mobile/android` and `apps/mobile/ios` are git-ignored in case a prebuild is ever made locally. App name `Webgames`, slug `webgames` and package id `app.webgames.placeholder` are placeholders.

Today it is one "hello core" screen: type a seed (default `golden-0`), press **Run**, and it plays a whole run with the core bot and the first starter, then shows the starter, `hashRun` of the final state, the result, the score and the number of steps. For the same seed the hash must equal the one Node computes (for example `golden-0` gives `280338e8c541b53c`, the same as `run.golden.json`).

Platform adapters live in `apps/mobile/src/platform/`: `asyncStorage.ts` (`defaultAsyncStorage()`, `@react-native-async-storage/async-storage` as core's `AsyncStorageLike`, null if unusable), `mobileI18n.ts` (`installMobileI18n()` reads the saved language `webgames.lang` first, then configures core i18n with a synchronous in-memory adapter that writes through to AsyncStorage; the device language comes from `expo-localization`; `App.tsx` renders nothing until it resolves, so there is no flash of the wrong language) and `a11ySettings.ts` (`useA11ySettings()`: system reduce motion and font scale). The hello screen also has an ES/EN toggle, **Save last run** / **Load** buttons (none, ok with hash, corrupt, unavailable) and a read-only reduce motion and font scale line.

To run it on an Android emulator (paths are this machine's, adjust them):

```sh
export JAVA_HOME="$HOME/.jdks/jdk-21.0.12.1+1"
export ANDROID_HOME="$HOME/Android/sdk"   # the SDK that has emulator/ and platform-tools/
export PATH="$ANDROID_HOME/platform-tools:$PATH"
"$ANDROID_HOME/emulator/emulator" -avd <your_avd> &   # an API 34+ AVD
cd apps/mobile && npx expo start --android
```

The Expo CLI downloads and installs the matching Expo Go on the emulator the first time, then opens the app. No account, EAS or signing is needed. To use a phone, install Expo Go and scan the QR code that `npx expo start` prints (same network).

Metro uses Expo's default config (`apps/mobile/metro.config.js`): since SDK 52 it detects the npm workspace and watches the repository root, and package `exports` are enabled by default, so `@webgames/core/<path>` resolves to `packages/core/src/<path>.ts` without aliases. `apps/mobile/tsconfig.json` extends `expo/tsconfig.base` with `strict` and `noUncheckedIndexedAccess` and type-checks the core modules the app imports.

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
