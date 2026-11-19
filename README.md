# Kinfall

**Kinfall** is a TypeScript game project: a deterministic game engine plus a creature roguelike built on top of it, played in the browser and on a phone from one shared core. The name was decided on 2026-11-19 ([ADR 0002](docs/adr/0002-kinfall-name-and-tester-distribution.md)); the Android application id is `es.sebas1705.kinfall`. The npm packages use the same name (root package `kinfall`, workspace scope `@kinfall/*`). Only two things keep the earlier working name `webgames`: the storage keys `webgames.run.v1`, `webgames.lang` and `webgames.textSize`, kept on purpose so existing saves and settings survive, and the local folder until the owner renames it. A future GitHub repository should be `Sebas1705/kinfall`.

## Layout

The repository is an npm workspaces monorepo:

| Path | Package | Contents |
|---|---|---|
| `packages/core` | `@kinfall/core` | The deterministic engine and everything that does not need a page: `src/sim` (battle and run simulation), `src/content`, `src/art` (sprite generator and palettes, as data), `src/platform` (strings, i18n, run saves) and `src/models` (the pure screen models: map, event, end, battle menu, and the battle turn controller). Its tests, the golden replays (`packages/core/tests/golden/*.golden.json`) and the owner scripts (goldens, bots, art preview) live here too. TypeScript source is consumed directly, without a build step: imports look like `@kinfall/core/sim/run/run`. |
| `apps/web` | `@kinfall/web` | The browser game: `index.html`, `src/main.ts`, the DOM and Pixi views (`src/view`), keyboard/gamepad input, the Vite and Playwright configs, view unit tests and the end-to-end specs (`tests/e2e`). It imports the engine only through `@kinfall/core/...`. |
| `apps/mobile` | `@kinfall/mobile` | The React Native app (Expo, TypeScript): a whole run by touch over an autosaved run session, plus dev tools (a "hello core" screen, a sprite gallery and a device determinism self test). Jest tests (`jest-expo`) live in `__tests__`. See [apps/mobile/README.md](apps/mobile/README.md). |

Why it is one repository with a shared core and two app shells: [ADR 0001](docs/adr/0001-shared-core-two-shells.md).

## Core rules

### Platform-neutral

Core runs under Node, in browsers and under React Native (Hermes), so:

- Its source has no DOM and no Node globals. `packages/core/tsconfig.json` compiles `src` with `lib: ["ES2022"]` and no `types`, so `document`, `localStorage`, `navigator` or `console` fail `tsc`; `packages/core/tsconfig.test.json` covers tests and scripts (Node types and jsdom allowed). `packages/core/tests/platform-neutral.test.ts` also scans `src` for platform globals, including `globalThis`/`self` aliases that `tsc` would accept.
- State is copied with `clone()` (`src/sim/clone.ts`, plain data only) instead of `structuredClone`, which Hermes may lack.
- Platform services are injected by the app. i18n: `configureI18n({ storage, detect, onChange })` binds the shared `t()`/`getLang()`/`setLang()` (English and adapter-free until then); the web app calls `installWebI18n()` from `apps/web/src/platform/webI18n.ts` at startup (localStorage key `webgames.lang`, `navigator.language`, `<html lang>`), the mobile app calls `installMobileI18n()`. Run saves: `createRunStorage(storage, content)` takes a `StorageLike`, and `createAsyncRunStorage(storage, content)` (`src/platform/asyncRunStorage.ts`) is its promise-based twin for React Native, with the same slot `webgames.run.v1`, results and rules (it shares the helpers in `runStorage.ts`); the web app passes `defaultStorage()` from `apps/web/src/platform/webStorage.ts` (localStorage, or null when blocked).

Do not add platform code to core: add an interface to core and implement it in the app.

### Determinism and the golden files

The same seed and the same choices always give the same battle and the same run, on every engine and both apps. Three things enforce it:

- **Integer-only simulation.** The engine uses integers, `Math.imul`, `Math.floor` and default string sorting, and draws randomness only from its seeded generator.
- **Golden replays.** `packages/core/tests/golden/battle.golden.json` and `run.golden.json` store final hashes, results and scores for fixed seeds. Vitest replays them in Node, the web Playwright spec replays them in Chromium (and Firefox and WebKit in CI), the mobile Jest suite replays the hello-core hash, and the mobile dev **Self test** replays them on a device's Hermes (see [apps/mobile/README.md](apps/mobile/README.md#device-self-test-determinism-on-hermes)).
- **CI regenerates and compares them.** The `core` job runs `npm run golden:update` and `npm run golden:runs` and fails on any diff.

Golden workflow: a change that moves a golden file is a change in game behaviour. Run `npm run golden:update` (battles) and/or `npm run golden:runs` (runs), review the diff, and commit the new files together with the change that caused them and a note saying why. Never update the goldens to hide a failure on another engine: that is a determinism bug in core.

## Development

All commands run from the repository root.

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

Per app:

| | Web (`apps/web`) | Mobile (`apps/mobile`) |
|---|---|---|
| Run | `npm run dev` | `cd apps/mobile && npx expo start` (Expo Go on a phone or emulator; `--android` for the emulator). See [Run it](apps/mobile/README.md#run-it) |
| Test | `npm test` (Vitest) and `npm run test:e2e` (Playwright) | `npm run test:mobile` (Jest); Maestro device flows in `apps/mobile/.maestro` |
| Build | `npm run build`, then `npm run size` | Signed release APK for testers: `scripts/distribute-android.sh --dry-run` (uploading drops `--dry-run`); see [docs/distribution.md](docs/distribution.md). CI builds an Android debug APK; see [CI](#ci) |

## Playing the web game

Run `npm run dev` and open the page. The title screen starts a run (an Expedition): pick a starter, keep or type a seed, and choose **New run**. A run is three zones of node maps (wild creatures, elites, shrines, caches, mysteries and a boss per zone). Between battles you recruit defeated creatures, rest or evolve at shrines, and a creature that faints is lost for the run. `?seed=NAME` prefills the seed: the same seed and the same choices always give the same run.

Play with the keyboard (Tab or arrows, Enter to confirm) or by clicking or tapping; in battle a gamepad also works. The page is available in Spanish and English and has a reduced-motion toggle and a text-size slider.

- **Saves live in this browser.** The run is saved automatically after every action (every battle turn included) in `localStorage` under the key `webgames.run.v1`, and **Continue run** on the title screen resumes it. Clearing the site data deletes the save. If the browser blocks storage, the run stays playable and a warning says it is not being saved. A damaged save is reported and can be discarded.
- **Single battle.** `?mode=battle` (for example `/?mode=battle&seed=NAME`) opens the phase-1 demo battle on its own, without a run.
- **Balance.** With the current numbers the game is effectively unwinnable: the bots win 0 of 900 runs (300 seeds x 3 starters) and rarely leave zone 0, and even a search with perfect information wins only about 1 run in 15. Balance is phase 3 work (see the [phase 3 handoff](docs/superpowers/notes/2026-11-16-phase-3-handoff.md)).
- **Known issue.** The battle engine still has no turn limit, so a boss that heals (the zone-1 Thorn Sovereign with mending_moss) can make a fight endless. Reloading resumes the same battle; the battle screen has an **Abandon run** button, and **New run** on the title screen starts over.

## Mobile app

`apps/mobile` is an Expo (managed) app on Expo SDK 58 that plays the same run by touch: title, map, battle, event and end screens, autosave and resume, English and Spanish, large text, screen readers, tablets and foldables. It runs in Expo Go; no native folders are committed. Testers get a signed release build through Firebase App Distribution ([docs/distribution.md](docs/distribution.md)). Everything about it (how to play, structure, battle screen, accessibility and layout, device self test, how to run it on an emulator or a real phone, Jest and Maestro tests) is in [apps/mobile/README.md](apps/mobile/README.md); the accessibility checklist is in [apps/mobile/ACCESSIBILITY.md](apps/mobile/ACCESSIBILITY.md).

## CI

`.github/workflows/ci.yml` runs on pushes to `main`, on pull requests and by hand (`workflow_dispatch`). It only checks: no job signs or uploads a build or reads a secret, and the token is read-only (`contents: read`). Each job and the commands to run it locally from the root:

| Job | What it runs | Locally |
|---|---|---|
| `core` | typecheck of every workspace, Vitest, golden files regenerated and compared | `npm run typecheck`, `npm test`, `npm run golden:update`, `npm run golden:runs`, then `git diff --exit-code -- packages/core/tests/golden` |
| `web` | production build and size budget | `npm run build`, `npm run size` |
| `web-e2e` (after `web`) | Playwright in Chromium, Firefox and WebKit | `npm run test:e2e` (Edge only, see below) |
| `mobile` | mobile typecheck and Jest | `npm run typecheck -w @kinfall/mobile`, `npm run test:mobile` |
| `android-debug` (after `mobile`) | `expo prebuild`, then `./gradlew assembleDebug` for the emulator ABI (`x86_64`) with JDK 21 | see below |

The Android job builds the debug variant only, signed with the SDK's throwaway debug key. Locally it needs JDK 17 or newer, `ANDROID_HOME` and the NDK version the generated project asks for (`ndkVersion`; the Skia and Hermes native code needs it):

```sh
cd apps/mobile
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64
```

`expo prebuild` rewrites the `android` script in `package.json`; revert that, CI does not commit it. Locally the NDK is installed with `sdkmanager "ndk;27.1.12297006"` and the Gradle wrapper downloads Gradle 9.4.1 itself; the release build ran on Windows on 2026-11-19 (see [docs/distribution.md](docs/distribution.md), which also explains the short CMake folders Windows needs). The workflow has not run on GitHub yet: the repository has no GitHub remote. See [Owner-only steps](docs/owner-steps.md).

`.github/workflows/distribute-android.yml` is a separate, manual-only workflow that builds the signed release APK and uploads it to Firebase App Distribution. It is unused until a remote exists and needs the `DOPPLER_TOKEN` repository secret; see [docs/distribution.md](docs/distribution.md).

Caches: npm through `actions/setup-node`, Gradle through `gradle/actions/setup-gradle` (which also validates the Gradle wrapper). Actions are pinned by major tag, like the rest of the repository.

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
| RN | React Native app on the shared core: [plan](docs/superpowers/plans/2026-11-16-react-native-app.md), tasks 1-10 executed on branch `rn-monorepo` (not merged, not pushed) | Done, with device checks pending ([owner steps](docs/owner-steps.md)) |
| 3-5 | Content and balance, community features, release | Not started |

## Documentation

- [docs/adr/](docs/adr/README.md): architecture decision records ([0001: shared core, two shells](docs/adr/0001-shared-core-two-shells.md)).
- [docs/owner-steps.md](docs/owner-steps.md): what was not verified and what only the owner can do.
- [docs/distribution.md](docs/distribution.md): Android release build, signing, Doppler secrets, versioning and Firebase App Distribution.
- [Creature roguelike design spec](docs/superpowers/specs/2026-11-14-creature-roguelike-design.md), the [plans](docs/superpowers/plans/) and the [phase 3 handoff](docs/superpowers/notes/2026-11-16-phase-3-handoff.md).
- [apps/mobile/README.md](apps/mobile/README.md) and [apps/mobile/ACCESSIBILITY.md](apps/mobile/ACCESSIBILITY.md).

## Licence

[MIT](LICENSE) (c) 2026 Sebas1705.
