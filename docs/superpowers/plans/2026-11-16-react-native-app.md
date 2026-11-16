# React Native app (Expo) on a shared core: implementation plan

> Status: draft for the owner. Execute only after phase 2 (run loop) is merged into `main`.
> Goal: a learning-oriented but real React Native app that plays the same creature roguelike, reusing the deterministic engine unchanged, so the same seed gives the same run on web and on a phone.

## Why this is feasible

- `src/sim`, `src/content` and `src/art` are plain TypeScript: no DOM, no Pixi. The art generator returns a `PixelGrid` (data), not a canvas.
- `src/platform/strings*.ts` and the `t()` function are pure text. Only language detection and persistence touch `localStorage`, `navigator` and `document` (`src/platform/i18n.ts`).
- `runStorage` already takes an injected `StorageLike`.
- The 580+ tests and the golden hashes (`tests/golden/battle.golden.json`, `tests/golden/run.golden.json`) are the proof that behaviour is identical after the move.

What must be rewritten: every screen (DOM -> React Native components), the sprite renderer (Pixi -> Skia), keyboard/gamepad input (-> touch), and the thin "presentation controller" glue.

## Decisions (change them before starting if you disagree)

1. **Expo (managed, with a development build)**, TypeScript, not bare React Native: fastest path, still real RN. Check the current Expo SDK and React Native version when you start and pin them.
2. **npm workspaces monorepo**: `packages/core`, `apps/web` (today's app, moved), `apps/mobile` (Expo). Keep one repo and one CI.
3. **Core has no DOM types**: `packages/core/tsconfig.json` uses `lib: ["ES2022"]` only, so any accidental `document` or `localStorage` use fails `tsc`. This is the enforcement mechanism.
4. **Sprites with `@shopify/react-native-skia`** (draws the `PixelGrid` as rects, crisp at any scale). Fallback if Skia gives trouble: a `View` grid or `react-native-svg`.
5. **Storage**: `@react-native-async-storage/async-storage` behind the existing `StorageLike` (it is async, so add an async variant `AsyncStorageLike` and make `runStorage` generic over sync/async; the web keeps the sync one).
6. **Language**: `expo-localization` for the default, AsyncStorage for the saved choice; `setLang`/`getLang` take injected adapters instead of touching `localStorage`.
7. **No store publishing, no accounts, no secrets** in this plan. A dev build on an emulator or the owner's phone is the finish line. Publishing is a later, separate decision that the owner takes.

## Risks to settle first (Task 2)

- **`structuredClone`**: the engine uses it in 9 places. Hermes may not provide it depending on the version. Replace it with a `clone()` helper in core (JSON round trip is enough: all state is JSON-safe and already canonicalised for hashing; keep `structuredClone` when present for speed only if the golden tests prove the result is identical). Golden hashes must not change.
- **Hermes numeric/string behaviour**: the engine uses integers, `Math.imul`, `Math.floor` and default `sort()` on strings, all standard. The check is running the goldens on a real Hermes runtime, see Task 6.
- **Performance of `validateRun`** (regenerates 3 maps per load): measure on a low-end device; cache by seed if it exceeds ~50 ms.

## Tasks

### Task 1: Monorepo split (no behaviour change)
- Create `packages/core` with `src/sim`, `src/content`, `src/art` (generator + palette, not painters), `src/platform/{strings,strings.run,i18n(pure part),runStorage}` and their tests; `apps/web` keeps views, Pixi, input and e2e.
- Update imports (`@webgames/core`), Vite alias, vitest projects, tsconfig references, CI paths, `npm run size` budget.
- **Done when:** all existing unit tests, `golden:update` / `golden:runs` outputs (no diff), build and the 52 e2e tests pass unchanged.

### Task 2: Make core platform-neutral
- Remove DOM access from core: `i18n` gets `createI18n({ storage, detect, onChange })`; web passes `localStorage`/`navigator`/`document` adapters, mobile passes its own.
- Add `clone()` and replace `structuredClone` (golden proof). Add a core-only `tsc` with no DOM lib to CI.
- **Done when:** `tsc -p packages/core` passes without DOM, goldens unchanged, web app behaves the same.

### Task 3: Expo app scaffold
- `apps/mobile` with Expo + TypeScript, a Jest setup (`jest-expo`, React Native Testing Library), lint, and metro configured for the workspace (`watchFolders`, `nodeModulesPaths`).
- A "hello core" screen that starts a run from a seed and prints `hashRun`.
- **Done when:** `npx expo start` runs on an Android emulator (JDK, SDK and emulator are in user folders on this PC; check the paths first) and the screen shows a hash equal to the web hash for the same seed.

### Task 4: Storage, language and settings adapters
- `AsyncStorage` adapter for run saves (async `load/save/clear`, same `none | ok | corrupt | unavailable` results), language persistence, text-size and reduced-motion from `AccessibilityInfo`.
- **Done when:** unit tests with a fake async storage mirror the web `runStorage` tests (quota error keeps old save, corrupt never deletes).

### Task 5: Sprite renderer
- `<CreatureSprite species scale />` using Skia from `generateCreature(...)`, plus the element icon. Hidden from screen readers; the text name carries the meaning.
- **Done when:** a gallery screen shows all species crisp at 2-3 scales, light and dark.

### Task 6: Device determinism check (the core guarantee)
- In-app "Self test" screen (dev only) that replays every entry of both golden files with Hermes and shows pass/fail with the first mismatching index.
- **Done when:** it passes on the emulator and on one real phone. This is the only way to know Hermes matches Node; Jest runs on Node and cannot prove it.

### Task 7: Screens (reuse the pure models)
- Reuse `buildMapModel`, `buildEventModel`, `buildEndModel`, `runEventLine`, `buildMenu`/`logLines` (move these pure parts to core in Task 1).
- Build title, map, battle, event and end screens with `react-navigation` (or `expo-router`). Battle uses simple animated views (Reanimated) driven by the same event list; the presentation controller is re-implemented as a hook around the existing pure `applyRunAction`.
- Autosave after every action with the same failure banner behaviour; resume into the exact phase.
- **Done when:** a full run can be played with touch only, saved, killed and resumed, in Spanish and English.

### Task 8: Accessibility and layout
- `accessibilityRole`/`accessibilityLabel` on nodes (`map.nodeLabel` strings), 48dp touch targets, font scaling up to 200%, reduced motion, dark mode, small phones (360x640), tablets and foldables (use window size classes; follow the `adaptive-ui` skill), TalkBack and VoiceOver pass.
- **Done when:** a checklist of those cases is verified on the emulator and documented with what could not be tested.

### Task 9: Tests and CI
- Jest tests for adapters and screens; Maestro (or Detox) smoke flow: new run -> pick node -> battle -> recruit -> abandon.
- CI job: core tests, mobile unit tests, Android debug build via EAS or Gradle (no signing, no upload).
- **Done when:** CI is green on a branch; nothing is published.

### Task 10: Docs
- README for the monorepo layout and how to run each app, an ADR (`docs-conventions`) for "shared core + two shells", and the list of owner-only steps (store accounts, signing keys) for later.

## Out of scope
- Store listings, signing, push notifications, backend, analytics.
- Wander mode, balance (phase 3), daily run and share codes (phase 4), they will be built once in core and consumed by both shells.

## Owner-only steps
- Provide or confirm the Android emulator/device for the self test (Task 6).
- Decide later whether to publish (Play internal testing / TestFlight needs accounts and signing, never part of this plan).
