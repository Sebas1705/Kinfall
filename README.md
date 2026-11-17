# webgames

`webgames` is a placeholder name for a TypeScript browser-game project: a deterministic game engine plus a creature roguelike built on top of it. The name is a placeholder and may change.

## Layout

The repository is an npm workspaces monorepo:

| Path | Package | Contents |
|---|---|---|
| `packages/core` | `@webgames/core` | The deterministic engine and everything that does not need a page: `src/sim` (battle and run simulation), `src/content`, `src/art` (sprite generator and palettes, as data), `src/platform` (strings, i18n, run saves) and `src/models` (the pure screen models: map, event, end, battle menu). Its tests, the golden replays (`packages/core/tests/golden/*.golden.json`) and the owner scripts (goldens, bots, art preview) live here too. TypeScript source is consumed directly, without a build step: imports look like `@webgames/core/sim/run/run`. |
| `apps/web` | `@webgames/web` | The browser game: `index.html`, `src/main.ts`, the DOM and Pixi views (`src/view`), keyboard/gamepad input, the Vite and Playwright configs, view unit tests and the end-to-end specs (`tests/e2e`). It imports the engine only through `@webgames/core/...`. |
| `apps/mobile` | `@webgames/mobile` | The React Native app (Expo, TypeScript): a title screen and the run map over an autosaved run session (battle, event and end screens are still placeholders), plus dev tools: a "hello core" screen that plays a bot run from a seed with `@webgames/core` and shows its hash, a sprite gallery and a device determinism self test. Jest tests (`jest-expo`) live in `__tests__`. See [Mobile app](#mobile-app). |

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

It opens on the **title screen** and plays the run shell: pick a starter, keep or type a seed and choose **New run**. The map of the zone follows, and a battle node (wild, elite, boss) opens the **battle screen** (Task 7b). Recruit, shrine, cache, mystery and the end of the run still show a clearly marked placeholder (testID `phase-placeholder`) until the event and end screens land (Task 7c of the [React Native plan](docs/superpowers/plans/2026-11-16-react-native-app.md)).

### How to play the shell

1. Start the app (see below). The title shows a random 8-character seed, the three starters and **New run**. **Continue run** is enabled only when a valid save exists.
2. Choose **New run**: the map of zone 1 shows the party, the souls and seven steps, step 1 at the top and the boss last. Available nodes have a solid border and say "available"; the others say "locked".
3. Tap an available node: the run saves. Step 1 nodes are battles: the battle screen shows the rival (HUD left, creature right), your creature (creature left, HUD right), the prompt and one button per choice. Tap a move: the turn is applied and saved first, then it plays (lunge, hit blink, HP bar tween, status chip pop, heal glow, swap and faint fades) while the choices stay disabled. When the battle ends, the next phase shows (another node, a recruit or the end of the run) with the run log lines of the battle's end. Other nodes show a placeholder named after the node with the run log.
4. Kill the app and open it again: **Continue run** resumes into the same battle (same HP, focus, status, rival intent and choices; the battle log starts empty), the same placeholder or the same map.
5. To leave a run, use **Abandon run** on the map or in battle, or Android back anywhere in the run (back opens the confirmation; a second back closes it). **Yes, abandon** deletes the save and returns to the title with a fresh seed.
6. The ES/EN toggle on the title switches every screen and is remembered.

### Structure and navigation

`apps/mobile/src`:

- `run/session.ts`: the run session, a plain object with no React, unit-tested on its own. It owns the current `RunState`, `start(seed, starterId)`, `resume()`, `abandon()`, `discardSave()`, `pickNode(nodeId)` and `act(action)` (any run action: battle turns now, event choices in 7c), the cleared-node `trail` of this session (as the web controller keeps it), the run log (run events; lines come from core's `runEventLine` at render time, so a language change rebuilds them) and the save warning. Its immutable snapshot carries `view` (`map`, `battle`, `event` or `end`, from `runViewOf(phase)`), which is all the Run screen routes on. `run/useRunSession.tsx` has `RunSessionProvider` and `useRunSession()` (`useSyncExternalStore`).
  - Autosave: every applied action enqueues one write of the state it produced through core's `createAsyncRunStorage` (slot `webgames.run.v1`). Writes, and the clear of an abandon or a discard, run one at a time in enqueue order, so two quick taps never interleave and the last write holds the latest state. A failed save shows one dismissible banner per failure streak, a later good save hides it, and play goes on. A rejected action changes nothing, saves nothing and logs a warning.
- `navigation/AppNavigator.tsx`: one native stack with `@react-navigation/native` 7 and `@react-navigation/native-stack` (plus `react-native-screens` and `react-native-safe-area-context` at the versions `npx expo install` pins for SDK 58; all of them run in Expo Go). Routes: `Title` -> `Run`, where `Run` is one screen that draws every phase, so the stack never grows during a run, and the dev routes `Hello`, `Gallery` and `SelfTest`. Headers are off. Android back on the Run screen opens the abandon confirmation instead of leaving; on the title it exits the app. The title re-reads the save every time it gains focus.
- `screens/TitleScreen.tsx`: the seed field (core's `seedFromRandom` and alphabet in `packages/core/src/platform/seed.ts`, shared with the web title; the bytes come from `platform/random.ts`, which uses `globalThis.crypto.getRandomValues` when the engine has it and `expo-crypto` otherwise; Hermes in Expo Go SDK 58 has no `crypto`, so it is `expo-crypto`), the starters as a radio group (sprite, name, element and hint), **New run**, **Continue run**, the damaged-save notice with an inline two-step **Discard saved run**, the storage-unavailable notice, the saves-live-on-this-device note and the ES/EN toggle. A **Dev tools** link opens the dev screens; it exists only in development bundles (`__DEV__`).
- `screens/MapView.tsx` draws core's `buildMapModel`: zone heading, party panel (sprite, name and an HP bar with the numbers as text) and souls, the layers, and nodes as 48dp buttons with a glyph plus their type and state in text (`map.nodeLabel` for screen readers; the current node says "you are here"). Node buttons widen with the font scale, so 200% text gets one node per row.
- `screens/RunScreen.tsx` draws the snapshot's `view`: the map, the battle, or `PHASE_VIEWS[view]` for event and end (the placeholder today; 7c replaces those entries), plus the save banner, the run log (only the newest lines sit in a polite live region; hidden during a battle, which has its own log) and the abandon confirmation. A battle's final turn moves the run on at once (it is applied and saved before it plays), so the Run screen keeps the battle up until that turn has played and the turn controller calls `onEnd`; then it routes on the new phase. The placeholder has no back button, like the web; a saved run in such a phase resumes into the same placeholder.
- `screens/BattleView.tsx` is the battle screen (see below).
- `ui/`: `Button`, `ConfirmPanel` (inline two-step confirmations, no system alert), `LangToggle`, `PartyPanel`, `RunLogPanel`, `SaveBanner` and `Screen` (scrolls inside the safe area). `theme.ts` mirrors the web tokens for light and dark (including surface, accent, focus and danger) and exports `TOUCH` (48dp). `platform/LangContext.tsx` re-renders every screen after a language change.

### Battle screen

- **One turn state machine for both apps.** The turn controller (`packages/core/src/models/battleController.ts`, moved from `apps/web/src/view/controller.ts` with its tests) is platform-neutral: it takes the UI, the scene, the timers and the logger as interfaces (`BattleUi`, `BattleScene`, `TimerApi`, `Logger`). It commits the new state before any animation, ignores input while a play is pending, settles each turn exactly once (normal end, rejection, throw or the watchdog `watchdogMs(eventCount)` = max(2500, 700 per event) ms), calls `onEnd` once after the final play settled, and rebuilds the texts once when the language changes during a pending turn. The web keeps thin re-exports (`apps/web/src/view/controller.ts`, `runTurn.ts`), so its code and e2e tests are unchanged. `packages/core/src/models/battleTurn.ts` (`splitBattleStep`, `battleTurn`) splits an applied run step into the battle events to play and the run events to log.
- `battle/useBattleController.ts` (`useBattleTurns`) wires that controller to React state (busy flag, choices from core's `buildMenu`, the battle log from `logLines`, a focus request) and sends each turn through the run session's `act({ type: 'battle', action })`, so the run is updated and autosaved before the turn plays. A rejected action is a no-op with a logged warning; the battle keeps its state. The screen opens from the run's saved `BattleState`, so a resumed battle shows exactly the saved HP, focus, status, intent and choices with an empty log.
- `battle/useBattleScene.ts` implements `BattleScene` with React Native's built-in `Animated` (native driver; transforms and opacity only, the HP bar is a `scaleX` fill): attacker lunge, hit blink and shake, HP tween, status chip pop (spring), heal glow, swap fade out/in and faint fade. `battle/sceneModel.ts` is the pure part: what each side shows as the turn's events arrive. Every step has a hard time budget (nominal length + 150 ms, then a timer finishes it), a new render cancels a running play, and with the system reduce motion setting (`useA11ySettings`, which on Android follows "Remove animations" / animator duration scale 0) nothing animates and the settled state shows at once. The animation never changes the sim state.
- Layout, vertical-first and one-handed: node heading, rival row, player row, the prompt and the choices (moves first, then swaps as "Swap to {species}"), **Abandon run** (the same two-step inline confirmation as the map, also from Android back), then the battle log last so a growing log never moves the buttons. Choices are 48dp buttons that name the move, its element (icon plus text), power and focus cost (`battle.power`, the only new string); disabled while a turn plays. HP and focus are written as text next to their bars; status is a text chip; the telegraphed rival move ("Next: {move}") is a text line in the rival HUD. Each HUD is one accessible element read as the web's `hud.summary`. Only the latest turn's lines sit in a polite live region, and after each settled turn screen-reader focus moves to the prompt above the choices (`AccessibilityInfo.sendAccessibilityEvent(..., 'focus')`), unless the abandon confirmation is open. At 200% text on a 360x640dp phone the HUDs fill the first screen and the choices are one scroll below; nothing clips.
- Tests (`__tests__/screens/BattleView.test.tsx`, `__tests__/battle/*`, Jest fake timers and a mocked `Animated.timing`/`spring` from `test-support/battleFixtures.ts`): a whole battle with the real engine (one autosave per turn, choices locked while pending, the next phase with the end lines), `onEnd` exactly once, the watchdog and step budgets, reduce motion, a rejected turn, resume mid-battle, abandon by button and by back, a language change during a pending turn, labels and roles, focus.

The dev tools keep the earlier screens. **Hello core**: type a seed (default `golden-0`), press **Run**, and it plays a whole run with the core bot and the first starter, then shows the starter, `hashRun` of the final state, the result, the score and the number of steps. For the same seed the hash must equal the one Node computes (for example `golden-0` gives `280338e8c541b53c`, the same as `run.golden.json`). Its **Damage saved run** button writes text that fails validation into the run slot, to try the title's damaged-save notice on a device.

Platform adapters live in `apps/mobile/src/platform/`: `asyncStorage.ts` (`defaultAsyncStorage()`, `@react-native-async-storage/async-storage` as core's `AsyncStorageLike`, null if unusable), `mobileI18n.ts` (`installMobileI18n()` reads the saved language `webgames.lang` first, then configures core i18n with a synchronous in-memory adapter that writes through to AsyncStorage; the device language comes from `expo-localization`; `App.tsx` renders nothing until it resolves, so there is no flash of the wrong language) and `a11ySettings.ts` (`useA11ySettings()`: system reduce motion and font scale). The hello screen also has an ES/EN toggle, **Save last run** / **Load** buttons (none, ok with hash, corrupt, unavailable) and a read-only reduce motion and font scale line.

Sprites: `apps/mobile/src/art/` has `<CreatureSprite species scale />` and `<ElementIcon element scale />`. They draw the core generator's grid (`generateCreature`, `elementIcon`) with `@shopify/react-native-skia` (2.14.0, the version Expo SDK 58 pins; it ships inside Expo Go, so no development build is needed). Core's pure `gridToRects(grid)` (`packages/core/src/art/gridToRects.ts`) merges same-colour horizontal runs into rects, one Skia `Rect` each, with whole-pixel edges and anti-aliasing off so cells stay crisp at integer scales. Sprites are decorative (hidden from screen readers unless `accessibilityLabel` is passed) and the grid is generated once per species. Canvases set Skia's `androidWarmup`, which also paints the picture as a plain bitmap: without it the Android emulator now and then left one sprite blank on first draw (about 1 launch in 4; none in 8 launches with it). A dev **Gallery** screen (button on the hello screen) lists every species with its elements at scales 2, 3 and 4. Jest loads Skia through `@shopify/react-native-skia/jestSetup` (see `jest.setup.js`) and transforms it via `transformIgnorePatterns`.

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

### Device self test (determinism on Hermes)

The core guarantee is that the same seed gives the same battle and run on every engine. Jest runs on Node, so only the device can prove it for Hermes. The dev **Self test** screen (button on the hello screen) replays every entry of both golden files, `packages/core/tests/golden/battle.golden.json` and `run.golden.json`, on the device JS engine. The screen imports those files directly (Metro bundles JSON from the watched repository root), so there is no copy that could drift.

- The runner is core's pure `runGoldenSelfTest` (`packages/core/src/sim/selfTest.ts`, with `checkBattleGolden`, `checkRunGolden`, `combineSelfTest` and `selfTestSummary`). It makes the same calls and comparisons as the Node golden tests: battle final hash and winner; run final hash, result, score and tags, with no rejected actions. Each file must have a minimum number of entries (3 battles, 4 runs) and every entry needs non-empty actions. Malformed input gives `ok: false`, never an exception.
- It runs only when you press **Run self test**. It yields to the UI between the two files so the spinner shows. The screen shows a large **PASS** or **FAIL**, the battle and run counts, the elapsed time, the first mismatch with its expected and actual values, one line per entry, a monospace summary, and the engine: `HermesInternal` presence and version, platform and OS version, React Native version, Expo SDK, device model (Android `Platform.constants`) and `typeof structuredClone`.
- It also logs two lines that start with `[selftest]` (summary with elapsed time, then the engine). You can read them without the UI: `adb logcat -d -s ReactNativeJS | grep selftest`.
- Auto-run is off by default. It turns on when the bundle is built with `EXPO_PUBLIC_SELFTEST_AUTORUN=1`, or when the app is opened with a URL that has a `selftest` path segment or a `?selftest=1` query, for example `exp://127.0.0.1:8081/--/selftest` in Expo Go or `webgames://selftest` in a build (`app.json` sets the scheme).

Run it on the Android emulator (environment as above):

```sh
"$ANDROID_HOME/emulator/emulator" -avd <your_avd> -no-snapshot &
adb wait-for-device
cd apps/mobile && npx expo start --android    # then: Dev tools > Self test > Run self test
# or without touching the UI: open the app on the self test, it runs on mount
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081/--/selftest" host.exp.exponent
adb logcat -d -s ReactNativeJS | grep selftest
# or bake auto-run into the bundle (also a good check of the minified production bundle)
EXPO_PUBLIC_SELFTEST_AUTORUN=1 npx expo start --no-dev --minify
```

A pass looks like `[selftest] PASS battle 3/3 run 6/6 elapsed=39ms (battle 6ms, run 33ms)`. A failure looks like `FAIL battle 2/3 run 6/6 first=battle#1 {"expected":{...},"actual":{...}}`. A failure on a device is a determinism bug in core. Do not update the goldens to hide it.

#### Verify on a real phone

This is an owner step. It needs a physical device and cannot be done from CI.

1. Install **Expo Go** from the Play Store (or the App Store). It must support SDK 58.
2. Over Wi-Fi: put the phone and the computer on the same network, run `cd apps/mobile && npx expo start`, and scan the QR code (Android: from Expo Go; iOS: with the Camera app). If the network blocks it, try `npx expo start --tunnel`.
3. Or over USB (Android): turn on Developer options and USB debugging, connect the phone, accept the debugging prompt, then run `adb devices` (the phone must be listed), `adb reverse tcp:8081 tcp:8081` and `npx expo start --android`.
4. In the app, press **Dev tools** (at the bottom of the title screen), **Self test**, then **Run self test**. Check for **PASS**, `Battle 3/3`, `Run 6/6` (or the current golden counts) and `HermesInternal: present`. Write down the Hermes version, the device model and the elapsed time.
5. If the result is **FAIL**, keep the screen (screenshot) or the `[selftest]` lines from `adb logcat -d -s ReactNativeJS` and report the first mismatch.

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
