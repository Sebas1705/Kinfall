# Console layout: QA note (release candidate 0.3.0)

Date: 2026-11-22. Branch `console-ui`. Plan: [console layout](../plans/2026-11-22-console-layout.md), spec: [design](../specs/2026-11-22-console-layout-design.md). This note says what was run, what was not, what is known to be limited, and what the owner still has to check. Nothing was tagged, pushed or uploaded.

## What was run (automated, on the development PC, 2026-11-22)

| Check | Command | Result |
|---|---|---|
| Core and web unit tests | `npm test` (Vitest, root) | 58 files, 1004 tests passed |
| Mobile unit tests | `npm run test:mobile` (Jest) | 46 suites, 603 tests passed |
| Typecheck, all workspaces | `npm run typecheck` | clean |
| Golden files | `npm run golden:update` + `npm run golden:runs`, then `git diff --exit-code -- packages/core/tests/golden` (the CI step "Golden files are up to date") | byte-identical, no diff |
| Web e2e | `npx playwright test --project=chromium --project=mobile --project=phone-landscape --project=phone-portrait` in `apps/web` | 363 passed, 53 skipped (project-scoped skips), 0 failed, 6.4 min. Run against a Vite dev server already listening on port 5199 and started from this checkout (`reuseExistingServer`), which serves the current files from disk |
| Android release APK | `bash scripts/distribute-android.sh --dry-run` (Doppler `kinfall/prd`; signs and builds, uploads nothing) | BUILD SUCCESSFUL in 3 min 21 s, including the prebuild with the new `expo-navigation-bar` module: signed release APK `apps/mobile/android/kinfall-0.3.0-186.apk`, 131,811,429 bytes (about 126 MB), versionName 0.3.0, versionCode 186 (the commit count of the tree before this note's commit; the committed tree gets 187). Nothing uploaded. The Android build needed `JAVA_HOME` (JDK 21) and `ANDROID_HOME` exported first, as in the environment notes |

Firefox and WebKit e2e projects were not run (CI runs them); the golden check and Jest are the cross-engine determinism guard.

## What was not run

There is no emulator, device or desktop browser session in this environment, so the manual matrix was **not** run and nothing below is claimed as verified.

## Owner checklist

- The emulator matrix of [ACCESSIBILITY.md](../../../apps/mobile/ACCESSIBILITY.md): 360x640, 411x914, 914x411, 800x1280, 1280x800 and 600x800, each at 100 and 200% text. Its old rows are marked superseded until this is done.
- TalkBack through each screen (title, map, battle, events, end).
- Android Back with a sheet open: the sheet closes first; in a battle Back with the Settings sheet open may close the sheet and cancel the abandon confirmation (needs a check).
- The polite live region (battle log line) while a sheet is open: it must still be announced (it sits outside the root that is hidden from accessibility while a sheet is open; TalkBack behaviour with `accessibilityViewIsModal` is unverified).
- Safe-area insets on a notched phone, in landscape too.
- Immersive mode (swipe to reveal) on Android 13, 14 and 15; the Settings switch.
- The battle stage at 360x640 with 130% text (creatures about 12 dp tall).
- A screen density below 2.
- The web: removal of the html `scrollbar-gutter` on a desktop browser (no layout shift when a scrollbar appears), and the Fullscreen button in a real browser (Chrome, Firefox, Safari).
- Near-square landscape windows and HUD chips at 320 px with 150% text, which were never measured.
- The first build that contains the new native module `expo-navigation-bar`: install the APK and start it.

## Known limitations (from the task ledger)

### Layout contract and budgets
- The HUD is about 52 px in the real web shell while the original contract planned 28; the contract was made honest in Task 6 (`HUD_LINE` and `MIN_BUDGET` per measured screen). Budgets are split by orientation: landscape title 220, map 275, battle 270, event 250, end 210; portrait title 380, map 470, battle 480, event 380, end 310.
- 914x411 at 200% text is the fallback layout (spec 7.5), and so is 360x640 at 200% for the screens that need more height: they scroll inside the primary region instead of fitting. The console layout is promised at 1.0 and 1.3 for 640x360 and 360x640.
- In the fallback the HUD and the actions stay pinned (spec 7.5); their caps are shares of the raw window height while the root is padded by the insets, so with insets the primary region keeps less than 25%.
- The contract does not know the safe-area insets (regions come from the raw window, the root is padded by them): on a notched landscape phone the primary region can be smaller than promised.
- The rail width (17 rem) lives in CSS, not in the contract.

### Battle
- The stage box is only about 53 dp at 360x640 with 130% text: creatures about 12 dp tall (correct, tiny; a budget limit).
- The stage floor is proven only for screen density 2 or more (`STAGE_MIN_DP` uses `MIN_DENSITY` 2); at density 1.5 about 5 dp could clip.
- The line-height factor 1.25 and the chrome constants (`CELL_CHROME`, `PLATE_CHROME`) are estimates, not measured. Detail text in the rail is kept short; the full text is in the accessible label.
- The side labels Player and Rival are no longer visible text (accessible label only).
- The core has no Flee action, so the rail has none.
- Abandon now lives in the Settings sheet (three taps: Settings, Abandon, Yes). The title screen's Discard confirmation is in a sheet too; accepted, since only a corrupt, unloadable save is at stake.
- Web: the d-pad is hidden for coarse pointers when the landscape height is under 480 or the portrait height under 800 (the rail buttons are tappable directly); untested at in-between sizes. At 640x360 in Spanish with a long creature name the rail scrolls inside itself (the page never scrolls).

### Map and text size
- The map board is 7 columns of 48 to 64 dp, so node names follow the text size only while they fit, then shrink down to 60%; beyond that a long name (Santuario, Criatura at about 200% in the fallback) may clip. The full name and state are in the rail readout and the accessible name.
- Locked and cleared map nodes are disabled, so Tab visits only the available ones. Arrow-key spatial focus over the map (spec 7.6) is not implemented and was not scheduled in the plan.
- The corrupt-save notice in the title rail may scroll at 640x360 at 130% (rare state, untested).
- The HUD shows full party chips only when they fit, else one compact chip or none (the Run sheet always lists the party). The save-failure banner floats over the primary region until dismissed.

### Sheets, immersive mode, accessibility
- Sheet orientation is read once at open (rotating while open keeps the old form); the Close button is last in the tab order (accepted by the APG).
- Touch users cannot read the map node types except through the accessible name (Task 6 added a fix; reverify on a device).
- Task 9: the Task 10 wiring keeps the live region outside the root that gets the sheet backdrop props, with a test; the real TalkBack behaviour is unverified.
- Immersive mode defaults to on; `setVisibilityAsync` is deprecated in `expo-navigation-bar` (use `setHidden` later).
- Fullscreen on web uses only the unprefixed API; the button is hidden where it is unsupported.

## Deferred minors (copied from the ledger, by area)

### Contract and tests
- Tests do not detect a per-screen `MIN_BUDGET` mixup in a case where the budgets diverge: add an override test.
- Boundary budget cases are untested; no inset slack or arithmetic test for the HUD and the map name width; the 25% test is arithmetic on constants.
- No assertion of a minimum visible character count of map labels at narrow sizes and 1.3.
- The ResizeObserver path of the sheet has no direct test.
- The turn-animation e2e test never confirms the turn still runs after the first rotation; `trackErrors` fails on any console error (possible flake) and is not applied to the control page; the canvas-remount assertion is not mutation-checked.
- The new `AppText` tests may leave the text-size setting at 150 or 80 without a reset.
- Task 9: tests for the finished-guard and unmount cleanup are vacuous; replace them with the second-close design (reopen mid slide-out, let the interrupted callback run, close again, assert the sheet stays rendered until the slide-out finishes). The "Close not in tree" test is weak.
- The end-screen live region is not covered by the sheet test; the base axe tests no longer see the settings controls (the sheet test compensates); a 44 px check on `.hud__btn` is not confirmed.

### Web
- `--stage-h` was published but is unused apart from Task 5; resize handlers are not rAF-coalesced; the `?mode=battle` demo page does not start the driver.
- The log sheet's home, focus and scroll behaviour; non-finite `maxScale`.
- The sheet scroll region is not re-synced when content grows (Task 6 fix round covered the main case).

### Mobile
- The stepper computes the next value from the render closure (use `textSizeSetting.get()`); the Android announcement says "110 percent" without "Text size"; the value text `minWidth` 64 may shift at max scale; `ImmersiveSwitch` duplicates the `MotionToggle` row; persistence on a step and a rapid double press are untested.
- Styles without an explicit `fontSize` do not follow the setting; loading the setting can clobber a value set earlier.
- Task 10: the fallback HUD and actions caps should be computed from the padded height, or the test name and comment qualified; the chips role and the immersive default-on flash.
- `BattleView` keeps its own abandon-sheet logic (follow-up: move onto `useRunSheets`); duplicated `onLayout`, banner style and `MAIN_PAD` constants across screens; the title starter cards show no element icons or names visually; `Sheet` calls do not pass `screen` (default battle sizing); the `stageLayout` banner option and `FramePressable` icon prop are used only by tests and battle.
- `runController` has duplicated toTitle and abandon logic, and `renderBattleFooter` clears the chips.
- `hudMetrics` imports from `screens/battleMetrics` (a ui-to-screens dependency).

### Process notes
- Main advanced locally (f9f01a6 to 8cf0484) while this branch stayed on f9f01a6: merge or rebase at the end.
- The web e2e reused the dev server on port 5199; it was started from this checkout, so the results are valid.
- `expo-navigation-bar` is a new native module: the generated `android/` folder needs a fresh prebuild (the distribution script does it).
