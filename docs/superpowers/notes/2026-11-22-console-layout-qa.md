# Console layout: QA note (release candidate 0.3.0)

Date: 2026-11-22. Branch `console-ui`. Plan: [console layout](../plans/2026-11-22-console-layout.md), spec: [design](../specs/2026-11-22-console-layout-design.md). This note says what was run, what was not, what is known to be limited, and what the owner still has to check. Nothing was tagged, pushed or uploaded.

## What was run (automated, on the development PC, 2026-11-22)

| Check | Command | Result |
|---|---|---|
| Core and web unit tests | `npm test` (Vitest, root) | 58 files, 1011 tests passed |
| Mobile unit tests | `npm run test:mobile` (Jest) | 46 suites, 1198 tests passed |
| Typecheck, all workspaces | `npm run typecheck` | clean |
| Golden files | `npm run golden:update` + `npm run golden:runs`, then `git diff --exit-code -- packages/core/tests/golden` (the CI step "Golden files are up to date") | byte-identical, no diff |
| Web e2e | `npx playwright test --project=chromium --project=mobile --project=phone-landscape --project=phone-portrait` in `apps/web` | final run after the fix wave: 378 passed, 62 skipped (project-scoped skips), 4 failed only because two runs overlapped on the same test-results folder (all 4 groups pass when rerun alone: battle.spec on phone-portrait 8 of 8, run and run-a11y on chromium 20 of 20), 6.7 min. Run against a Vite dev server that was already listening on port 5199 (`reuseExistingServer`). Evidence that it served this checkout: the listening process was `node ...\Sebas1705\kinfall\node_modules\.bin\..\vite\bin\vite.js --port 5199 --strictPort`, which serves the files of this working tree from disk |
| Android release APK | `bash scripts/distribute-android.sh --dry-run` (Doppler `kinfall/prd`; signs and builds, uploads nothing) | BUILD SUCCESSFUL in 3 min 21 s, including the prebuild with the new `expo-navigation-bar` module: signed release APK `apps/mobile/android/kinfall-0.3.0-186.apk`, 131,811,429 bytes (about 126 MB), versionName 0.3.0, versionCode 186 (the commit count of the tree before this note's commit; the committed tree gets 187). Nothing uploaded. The Android build needed `JAVA_HOME` (JDK 21) and `ANDROID_HOME` exported first, as in the environment notes |

Firefox and WebKit e2e projects were not run locally. CI now runs the new `phone-landscape` and `phone-portrait` projects too (the "Mobile viewport" job), but nothing from this branch has run in CI yet: push the branch once and read the results, including Firefox and WebKit, where `inert`, `100dvh` and the CSS `content: '...' / ''` alternative text were never exercised on those engines. The golden check shows the simulation output is byte-identical on this machine's Node; it says nothing about other engines.

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
- A screen density below 2 (the battle stage floor is only proven for density 2 or more).
- The live region while a sheet is open: paused on the web (the screens are inert), still announcing on mobile (see Rulings); check both with a screen reader.
- Rebuild the APK from the committed (and rebased) HEAD before testing or distributing: the dry-run build kinfall-0.3.0-186 came from the uncommitted tree (the committed HEAD gives a different versionCode).
- The web: removal of the html `scrollbar-gutter` on a desktop browser (no layout shift when a scrollbar appears), and the Fullscreen button in a real browser (Chrome, Firefox, Safari).
- Near-square landscape windows and HUD chips at 320 px with 150% text, which were never measured.
- The first build that contains the new native module `expo-navigation-bar`: install the APK and start it.

## Known limitations (from the task ledger)

### Layout contract and budgets
- The HUD is about 52 px in the real web shell while the original contract planned 28; the contract was made honest in Task 6 (`HUD_LINE` and `MIN_BUDGET` per measured screen). Budgets are split by orientation: landscape title 220, map 275, battle 270, event 250, end 210; portrait title 380, map 470, battle 480, event 380, end 310, as measured on the web. The final fix wave raised title landscape to 245, title and event portrait to 460 and end portrait to 330 after the mobile proofs (see Rulings).
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
- The sheet follows rotation while open on web and mobile; the Close button is last in the tab order (accepted by the APG).
- Touch users cannot read the map node types except through the accessible name (Task 6 added a fix; reverify on a device).
- Task 9: the Task 10 wiring keeps the live region outside the root that gets the sheet backdrop props, with a test; the real TalkBack behaviour is unverified.
- Immersive mode defaults to on.
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
- The web e2e reused the dev server on port 5199; the evidence that it was this checkout is in the table above.
- `expo-navigation-bar` is a new native module: the generated `android/` folder needs a fresh prebuild (the distribution script does it).

## Rulings

Copied in order from the ledger (`.superpowers/sdd/2026-11-22-console-layout/progress.md`), which is the source, each with what it costs if wrong.

### Pre-flight
1. Ruling: 914x411 at 2.0 is fallback, matching the spec 7.5 example (a landscape phone at 200%). Cost if wrong: one table row.
2. Ruling: remove the legacy `layoutFor` in Task 13 (Task 12 leaves the other screens on it). Cost if wrong: none.
3. Ruling: the new `Screen` shell is opt-in through a prop, with the legacy path kept until Task 13. Cost if wrong: a temporary dual path.

### Tasks
4. Task 1: fallback still returns a region plan and consumers use it (HUD and actions stay pinned, spec 7.5). Cost if wrong: none.
5. Task 5: the d-pad is hidden for coarse pointers only when landscape height is under 480 or portrait height under 800 (the rail buttons are directly tappable). Cost if wrong: the d-pad is missing on small phones.
6. Task 6 dispatch: the HUD is about 52 px in the real web shell while the contract said `HUD_LINE` 28; the contract is made honest (`HUD_LINE` and `MIN_BUDGET` per measured screen) while keeping 640x360 and 360x640 console at 1.0 and 1.3. Cost if wrong: core test churn.
7. Task 6: orientation-split `MIN_BUDGET` accepted with the measured values (landscape title 220, map 275, battle 270, event 250, end 210; portrait title 380, map 470, battle 480, event 380, end 310); 360x640 at 2.0 is fallback for the screens that need more. Cost if wrong: phones at 200% scroll inside the primary region instead of fitting.
8. Task 8: wiring the text size into app text (the `AppText` wrapper, loading the setting at startup) belongs to Task 8, since the contract's effective scale includes the app setting. Cost if wrong: a mechanical import change across screens.
9. Task 9: the Task 10 wiring must put the polite live region (battle log line) outside the root that gets `useSheetBackdropProps`, with a test of the root props while a sheet is open. Cost if wrong: a screen reader never announces the turn lines (no-hide-descendants silences a live region inside it).
10. Task 12: keep the budget (console must hold at 640x360 and 360x640 at 1.0 and 1.3) and make heights deterministic instead: bounded choice cells and plates, arithmetic tests on shared constants. Cost if wrong: short detail text in the rail (the full text stays in the accessible label).
11. Task 13: the Discard confirmation opens in a sheet, not inline: two deliberate taps as before. Cost if wrong: one more tap on a rare, destructive action (only a corrupt, unloadable save is at stake).

### Final review
12. Ruling: I1 to I5 are fixed in one final fix wave (no second wave). Cost if wrong: another wave.
13. Ruling: I6a, the web d-pad hidden for coarse pointers on small phones (landscape height under 480, portrait under 800), accepted and the spec amended. Cost if wrong: a touch-only player without the d-pad on small phones.
14. Ruling: I6b, arrow-key focus over the map is not implemented (Tab and the rail work); the spec is amended and it is a follow-up. Cost if wrong: keyboard users tab through up to 19 nodes.
15. Ruling: I6c, the live region while a sheet is open differs by platform (web pauses it because the screens are inert; mobile keeps announcing per the Task 9 ruling); the spec is amended. Cost if wrong: a web screen-reader user may miss a turn message while a sheet is open.
16. Ruling: I6d, the fallback threshold is the orientation-split budgets plus the 2.0 cap (no separate 1.3 threshold); the spec is amended. Cost if wrong: none (documentation).

### Decided in the final fix wave (not in the ledger)
17. The budgets were raised (title landscape 245, title and event portrait 460, end portrait 330) because the mobile proofs, now generated from every console row of the contract up to 200% text, showed overflow at 360x640 @150%, 411x914 @200%, 600x800 @200% (title, event), 640x360 @150% (title) and 360x640 @200% (end). Those rows fall back, on the web too. Cost if wrong: those windows scroll inside the primary region instead of fitting.
18. The mobile proofs do not cover windows narrower than 360 dp or scales between 1.0, 1.3, 1.5 and 2.0. Cost if wrong: a very narrow phone may clip.
19. The mobile HUD heading may be cut with an ellipsis (keeping at least 8 characters, the full text as its accessible name) when nothing else fits, for example the Spanish end heading at 411x914 @200%. Cost if wrong: a truncated heading on a large-text phone.
20. The web fallback pins the rail (capped at 55% of the window and at what leaves the primary a quarter of it); the inline run details come after the rail in the DOM and tab order, so scrolled to the very end they push the rail away. Cost if wrong: at the end of a long fallback screen the actions are not pinned.

## Leftover and stale items

- Leftover: the `stageFrame` unification was deferred (spec 11.7).
- Stale lines removed from this note: the deprecated `setVisibilityAsync` remark (the code already uses `setHidden`) and "sheet orientation read once at open" (the sheet follows rotation).
- Flaky under load, not caused by this branch: the e2e test "battle: rotating during a turn animation" failed once with four parallel workers and passed in isolation (six repeats).

