# ADR 0001: One shared core with two app shells (web and React Native)

- **Status:** accepted
- **Date:** 2026-11-16 (plan `5d8517d`; executed on branch `rn-monorepo`, 2026-11-16 to 2026-11-18, not merged yet)
- **Area:** architecture, repository layout

## Context

- The game (a deterministic creature roguelike) started as a browser app. Its engine (`sim`, `content`, `art`, strings, run saves, pure screen models) is plain TypeScript without DOM or Pixi, and its behaviour is pinned by golden replays and about 580 tests.
- The owner wants the same game on a phone, with the same seed giving the same run, and wants the work to double as a real React Native learning project.
- Only the presentation is platform specific: DOM and Pixi views, keyboard and gamepad input, `localStorage`, `navigator`.
- The plan is in [docs/superpowers/plans/2026-11-16-react-native-app.md](../superpowers/plans/2026-11-16-react-native-app.md).

## Decision

The repository is one npm workspaces monorepo with one shared core and two shells:

- `packages/core` (`@kinfall/core`) holds everything that does not need a page. It is platform-neutral: `src` compiles with `lib: ["ES2022"]` and no `types`, so any use of `document`, `localStorage`, `navigator` or `console` fails `tsc`; a test also scans for platform globals. It is consumed as TypeScript source, with no build step.
- `apps/web` (`@kinfall/web`) is the browser shell (Vite, Pixi, DOM views).
- `apps/mobile` (`@kinfall/mobile`) is the React Native shell.
- Platform services are injected into core by each shell: language (`configureI18n`), run saves (`createRunStorage` for sync storages, `createAsyncRunStorage` for async ones), the battle turn controller (`BattleUi`, `BattleScene`, `TimerApi`, `Logger`). State is copied with `clone()`, not `structuredClone`.
- One repository, one CI. The golden files are shared: Node, the browser and the device JS engine (Hermes) must all reproduce them.

### Related choices for the mobile shell

- **Expo managed (Expo Go), no native folders committed.** It is the fastest path to a real React Native app and runs on a phone without accounts, signing or a build. `apps/mobile/android` and `ios` are git-ignored; a prebuild is only made locally and in CI for the debug build. Versions of Expo, React Native and React are pinned exactly so device checks are reproducible. The plan first said "with a development build"; Expo Go proved enough (Skia ships inside it) and the development build was not needed.
- **Sprites with `@shopify/react-native-skia`.** Core's generator returns a pixel grid (data); core's `gridToRects` merges it into rects and the app draws one Skia `Rect` each, crisp at integer scales. The plan's fallback (a `View` grid or `react-native-svg`) was not needed.
- **AsyncStorage behind an adapter.** `@react-native-async-storage/async-storage` is wrapped as core's `AsyncStorageLike` (`apps/mobile/src/platform/asyncStorage.ts`), so core stays free of React Native and saves keep the same slot (`webgames.run.v1`) and rules on both shells.

## Consequences

Benefits:

- Game rules, content, strings, models and the turn state machine exist once; a fix lands in both apps.
- The same seed gives the same run on web and on a phone, checked by the goldens in Vitest, Playwright, Jest and the on-device self test.
- The platform-neutral rule is enforced by the compiler and a test, not by convention.

Costs:

- Every screen, the sprite renderer, input and the presentation glue are written twice (DOM and React Native).
- Core must never use platform APIs, even convenient ones (`structuredClone`, `console`); this needs discipline and sometimes an interface plus an adapter.
- Changing a golden file changes behaviour on both apps, so goldens are reviewed carefully.
- One CI has to cover a Vite build, Playwright and an Android build; mobile checks need device or emulator work that CI cannot do.

How it is checked: `npm run typecheck` (core `src` without DOM types), `packages/core/tests/platform-neutral.test.ts`, `npm test`, `npm run test:mobile`, the golden diff in the `core` CI job and the device Self test.

## Alternatives considered

- **Separate repositories (engine package plus two app repos).** Rejected as too heavy for one owner: versioning and publishing the engine, and keeping three CI setups in step. Reasons beyond "keep one repo and one CI" (plan decision 2) are not recorded.
- **Flutter or Kotlin Multiplatform for the phone.** Both would force a second implementation of the engine (Dart or Kotlin) or a bridge, losing the shared TypeScript core and the golden-hash guarantee for free. The owner also wanted real React Native. The plan does not record a written comparison.
- **React Native Web (one UI codebase for both).** Not chosen: the web game already has DOM and Pixi views, keyboard and gamepad input and a tuned accessibility test suite, and a rewrite of it was not wanted. The plan does not record a longer analysis.
