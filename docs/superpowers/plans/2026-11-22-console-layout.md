# Console layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every run screen of Kinfall (title, map, battle, event, end) fits the window without page scroll, in landscape (console composition) and portrait (thumb-zone composition), full screen, on web and Android.

**Architecture:** A pure layout contract in `@kinfall/core` (`src/layout/spec.ts`) turns window size, orientation and effective text scale into a mode (`console` or `fallback`) and a plan of regions (HUD, primary, actions, info). Web (CSS grid driven by data attributes) and mobile (React Native views) implement the plan; log, party and settings move into sheets. After Task 1 the web track (Tasks 2 to 7) and the mobile track (Tasks 8 to 13) are independent.

**Tech Stack:** TypeScript, npm workspaces (`packages/core`, `apps/web` Vite + Vitest + Playwright, `apps/mobile` Expo SDK 58 / RN 0.88 + Jest), `expo-navigation-bar` (new).

**Spec:** `docs/superpowers/specs/2026-11-22-console-layout-design.md` (read section 11, "Calls made after the builder check", together with it).

## Global Constraints

- Breakpoints stay: width classes at 600 and 840, height classes at 480 and 900.
- Content width cap: 1200 (landscape) and 720 (portrait); wider windows letterbox with the dusk backdrop.
- Effective text scale = `systemFontScale x appTextSize`, capped at 2.0; web has no system scale so it is `appTextSize` (0.8 to 1.5). Slider range 80 to 150 step 10 on both platforms.
- `console` mode must hold with no page scroll at 640x360 and 360x640 at text scale 1.0 and 1.3, and at every larger window up to 2.0; `fallback` when `height / textScale` is below the screen's minimum budget (starts at 270, tuned by measuring) or the height is below 320; in fallback only the primary region scrolls, never the page.
- Touch targets: 48 dp on mobile, 44 px on web. Reduced motion (system setting OR the app switch) applies to sheet motion too.
- Text stays real text; the screen-reader order stays as in `apps/mobile/ACCESSIBILITY.md`; web router keeps `hidden` + `inert` on inactive screens.
- The golden files (battle, run, art) stay byte-identical; layout code never imports `sim/rng`, the sim or the art generator; `packages/core/tests/platform-neutral.test.ts` must pass.
- No horizontal overflow at 320 px wide at web text 80, 100 and 150.
- Settings keys keep the `webgames.` prefix (ADR 0002): `webgames.textSize` (web, exists), `webgames.textSize` and `webgames.immersive` (mobile, new, AsyncStorage like `motionSetting.ts`).
- Everything in the repo is English; UI strings go through `@kinfall/core/platform/i18n` in es and en. Commits: imperative, no trailers.

## Review Focus

1. Rotating the phone in the middle of a battle: the battle state, log and animation survive and the layout switches without a remount that loses them (Tasks 7 and 11).
2. Text at 200% in a landscape phone (fallback): actions stay pinned and reachable, the page itself never scrolls (Tasks 1, 6 and 11).
3. A sheet open with keyboard or TalkBack: focus trapped inside, Escape / Back closes it, focus returns to the opener, the background is inert (Tasks 4 and 9).
4. Landscape on a phone with a display cutout: HUD and rail stay clear of the safe-area insets (Tasks 2 and 10).
5. Web fullscreen entered and left (Esc, browser chrome shows or hides): the layout recomputes and nothing is cut off (Tasks 2 and 5).

---

### Task 1: The layout contract in core

**Files:**
- Create: `packages/core/src/layout/spec.ts`
- Test: `packages/core/tests/layout/spec.test.ts`

**Interfaces:**
- Produces (importable as `@kinfall/core/layout/spec`):
  - `type WidthClass = 'compact' | 'medium' | 'expanded'`, `type HeightClass = 'compact' | 'medium' | 'expanded'`, `type Orientation = 'landscape' | 'portrait'`, `type LayoutMode = 'console' | 'fallback'`, `type ScreenId = 'title' | 'map' | 'battle' | 'event' | 'end'`.
  - `interface Rect { x: number; y: number; width: number; height: number }`.
  - `interface RegionPlan { content: Rect; hud: Rect; primary: Rect; actions: Rect; info: Rect | null }` (`info` is null in landscape; the rects tile `content` exactly, with no overlap).
  - `interface WindowInfo { width: number; height: number; textScale: number }`.
  - `interface LayoutSpec { orientation: Orientation; width: WidthClass; height: HeightClass; mode: LayoutMode; regions: RegionPlan }`.
  - Constants `WIDTH_MEDIUM = 600`, `WIDTH_EXPANDED = 840`, `HEIGHT_MEDIUM = 480`, `HEIGHT_EXPANDED = 900`, `CONTENT_MAX_LANDSCAPE = 1200`, `CONTENT_MAX_PORTRAIT = 720`, `TEXT_SCALE_MAX = 2`, `MIN_HEIGHT_PX = 320`, `MIN_BUDGET: Record<ScreenId, number>` (all 270 for now).
  - `effectiveTextScale(system: number, app: number): number`, `widthClass(w: number): WidthClass`, `heightClass(h: number): HeightClass`, `layoutSpec(info: WindowInfo, screen: ScreenId): LayoutSpec`.

- [ ] **Step 1: Write the failing tests** in `packages/core/tests/layout/spec.test.ts`:
  - `effectiveTextScale caps at 2`: `(1.5, 1.5)` is 2; `(1, 0.8)` is 0.8; `(1.3, 1)` is 1.3.
  - `class boundaries`: `widthClass(599)` compact, `(600)` medium, `(840)` expanded; `heightClass(479)` compact, `(480)` medium, `(900)` expanded.
  - A device matrix table `[name, w, h, textScale, orientation, mode]`: 320x640 and 360x640 at 1.0 and 1.3 are portrait console; 360x640 at 2.0 is portrait console; 640x360 at 1.0 and 1.3 are landscape console; 640x360 at 2.0 is fallback; 914x411 at 1.0 landscape console and at 2.0 landscape fallback (411 / 2 is below the 270 budget); 560x300 at 1.0 landscape fallback (height < 320); 600x800, 800x1280, 1280x800, 1366x768, 1920x1080 at 1.0 and 2.0 console.
  - `regions tile the content box`: for every matrix row and every `ScreenId`, the area of `hud + primary + actions + info` equals `content` width x height and no two rects overlap.
  - `landscape plan`: `primary.width >= 0.55 * content.width`, `actions.width >= 200`, `info` is null. `portrait plan`: `primary.height` between 0.38 and 0.45 of the window height, `info` not null.
  - `content is capped and centred`: 1920x1080 gives `content.width === 1200` and `content.x === 360`; 1000x1600 gives `content.width === 720`.
- [ ] **Step 2: Run** `npm test -w @kinfall/core -- layout/spec` and expect FAIL (module missing).
- [ ] **Step 3: Implement** `spec.ts` with the signatures above. Orientation is `width > height`. `mode` is `fallback` when `height < MIN_HEIGHT_PX`, `textScale > TEXT_SCALE_MAX`, or `height / textScale < MIN_BUDGET[screen]`, else `console`. Landscape plan: HUD strip on top of the content box (height from the text scale), then `primary` on the left (the rest of the width minus `actions`) and `actions` on the right (width `clamp(0.32 * content.width, 200, 360)`). Portrait plan: HUD, `primary` (about 41% of the window height), `info` (one or two text lines tall), `actions` filling the bottom. Pure and platform-neutral (no DOM or RN import).
- [ ] **Step 4: Run** the same command and `npm test -w @kinfall/core -- platform-neutral`; expect PASS for both.
- [ ] **Step 5: Commit** `feat: add the console layout contract to core`.

---

## Web track

### Task 2: Web layout driver and full-height shell

**Files:**
- Create: `apps/web/src/view/layout.ts`, `apps/web/tests/view/layout.test.ts`
- Modify: `apps/web/index.html` (viewport meta `viewport-fit=cover`), `apps/web/src/styles.css` (`.app` becomes `height: 100dvh`; grid areas per `data-mode` and `data-orientation`; safe-area padding with `env(safe-area-inset-*)`), `apps/web/src/main.ts` (start the driver), `apps/web/playwright.config.ts` (projects `phone-landscape` 640x360 and `phone-portrait` 360x640, both `hasTouch`, `isMobile`).

**Interfaces:**
- Consumes: `layoutSpec`, `effectiveTextScale`, `ScreenId` from Task 1.
- Produces: `startLayout(root: HTMLElement, opts: { screen: () => ScreenId; textScale: () => number }): { refresh(): void; stop(): void }`. It listens to `resize`, `visualViewport` resize and `fullscreenchange`, and sets on `root` the attributes `data-orientation`, `data-mode`, and the custom properties `--hud-h`, `--rail-w`, `--stage-h` from the plan.

- [ ] **Step 1: Write the failing test** `layout.test.ts`: with `innerWidth/innerHeight` set to 640x360 and text scale 1, `startLayout` sets `data-orientation="landscape"` and `data-mode="console"`; after changing to 360x640 and dispatching `resize` it reads `portrait`; at text scale 2 and 640x360 it reads `fallback`; dispatching `fullscreenchange` re-runs it; `stop()` removes the listeners.
- [ ] **Step 2: Run** `npm test -w @kinfall/web -- layout` and expect FAIL.
- [ ] **Step 3: Implement** `layout.ts` and the CSS grid (areas `hud`, `primary`, `actions`, `info`); the existing screens keep working inside `primary` until Tasks 6 and 7 recompose them. Respect the 1200 / 720 px content cap with the dusk backdrop continuing outside.
- [ ] **Step 4: Run** `npm test -w @kinfall/web` and `npm run build -w @kinfall/web`; expect PASS.
- [ ] **Step 5: Commit** `feat: drive the web shell from the layout contract`.

### Task 3: Web sheet component

**Files:**
- Create: `apps/web/src/view/sheet.ts`, `apps/web/tests/view/sheet.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `openSheet(opts: { title: string; content: HTMLElement; opener: HTMLElement; onClose?: () => void }): { close(): void }`. A sheet is a bottom sheet in portrait and a side drawer in landscape (`data-orientation` of `.app`), shown as `role="dialog"` with `aria-modal="true"` and a visible Close button (44 px). While open, `#screens` is `inert`; Escape closes; focus moves into the sheet and returns to `opener` on close; its motion is off when reduced motion is on (system media query or the `.reduce-motion` class).

- [ ] **Step 1: Write the failing tests**: `opens as a dialog and inerts the screens` (`role=dialog` exists, `#screens` has `inert`); `Escape closes and returns focus to the opener`; `Tab wraps inside the sheet` (Tab from the Close button reaches the first focusable inside; Shift+Tab from it reaches the Close button); `a second open closes the first`.
- [ ] **Step 2: Run** `npm test -w @kinfall/web -- sheet`, expect FAIL.
- [ ] **Step 3: Implement** `sheet.ts` and its CSS; the polite live region (`[data-announcer]`) keeps working and is not inerted.
- [ ] **Step 4: Run** the same command, expect PASS.
- [ ] **Step 5: Commit** `feat: add the web sheet`.

### Task 4: Web HUD, settings sheet, fullscreen

**Files:**
- Modify: `apps/web/index.html` (the topbar is replaced by a `header.hud` with the title, party chips area, a Settings button and a Fullscreen button; the settings controls move into the sheet content), `apps/web/src/view/settings.ts` (`wireTextSize` keeps its keys; settings controls are built for the sheet), `apps/web/src/view/runPage.ts`, `apps/web/src/styles.css`
- Create: `apps/web/src/view/fullscreen.ts`, `apps/web/tests/view/fullscreen.test.ts`
- Modify (strings): `packages/core/src/platform/i18n` string tables for `hud.settings`, `hud.fullscreen`, `hud.exitFullscreen` in es and en.

**Interfaces:**
- Consumes: `openSheet` (Task 3), `startLayout` (Task 2).
- Produces: `toggleFullscreen(el?: HTMLElement): Promise<void>` and `isFullscreen(): boolean` in `fullscreen.ts` (uses the Fullscreen API; resolves without error where unsupported and the button is then hidden).

- [ ] **Step 1: Write the failing tests**: `fullscreen button hidden when the API is missing`; `toggleFullscreen calls requestFullscreen when not fullscreen and exitFullscreen when it is` (mock `document.fullscreenElement`); `the settings button opens a sheet containing #lang, #reduce-motion and #text-size`.
- [ ] **Step 2: Run** `npm test -w @kinfall/web -- fullscreen settings` and expect FAIL.
- [ ] **Step 3: Implement** the HUD and the settings sheet, keeping ids `lang`, `reduce-motion`, `text-size` so existing wiring and e2e keep working. HUD controls are 44 px. Update the e2e a11y selectors if they assumed the topbar.
- [ ] **Step 4: Run** `npm test -w @kinfall/web` and `npx playwright test --project=chromium --project=mobile` in `apps/web` (port 5199 must be free); expect PASS.
- [ ] **Step 5: Commit** `feat: web HUD with a settings sheet and fullscreen`.

### Task 5: Web battle composition

**Files:**
- Modify: `apps/web/index.html` (battle markup), `apps/web/src/styles.css` (`.battle` areas become `primary` = stage with a one-line message overlay, `actions` = rail grid, log in a sheet), `apps/web/src/view/battlePage.ts`, `apps/web/src/view/battleView.ts`, `apps/web/src/view/battleDom.ts`
- Test: `apps/web/tests/e2e/layout.spec.ts` (new), existing `battle.spec.ts`, `a11y.spec.ts`

**Interfaces:**
- Consumes: `startLayout` regions, `openSheet`.
- Produces: the battle screen draws its log as the last message line over the stage plus a Log button that opens the full log in a sheet; the actions are a one- or two-column grid of at least 44 px buttons; the d-pad for coarse pointers stays.

- [ ] **Step 1: Write the failing e2e** `layout.spec.ts`: for the projects `phone-landscape`, `phone-portrait`, `mobile` and `chromium`, start a run, enter a battle, and assert `document.scrollingElement.scrollHeight <= window.innerHeight`, no horizontal overflow, every button box at least 44 px, and (landscape) the rail is to the right of the stage.
- [ ] **Step 2: Run** `npx playwright test layout --project=phone-landscape` and expect FAIL.
- [ ] **Step 3: Implement** the composition. The stage scale stays whole-number; the existing `SHORT_WINDOW_PX` crop in `battleView.ts` is re-expressed from the plan's `primary` rect.
- [ ] **Step 4: Run** the full web e2e on `chromium`, `mobile`, `phone-landscape`, `phone-portrait`; the existing battle, a11y and determinism specs must stay green.
- [ ] **Step 5: Commit** `feat: web battle in the console layout`.

### Task 6: Web title, map, event and end

**Files:**
- Modify: `apps/web/src/view/screens/title.ts`, `map.ts`, `event.ts`, `end.ts`, `party.ts`, `apps/web/src/view/runLog.ts`, `apps/web/src/styles.css`
- Test: `apps/web/tests/view/{title,map,event,end}.test.ts` (extend), `apps/web/tests/e2e/layout.spec.ts` (extend)

**Interfaces:**
- Consumes: `openSheet`, region variables from Task 2.
- Produces: Title: hero art and wordmark in `primary`, actions in the rail, starters as a horizontal strip, seed field and saves note inside the settings sheet or a "New run options" sheet. Map: a fixed board (layers side by side in landscape, compact in portrait; 7 layers, 2 to 3 nodes each, 1 for the boss), run log and party details in sheets, Abandon in a sheet with the confirmation inline as today. Event: offer as the primary vignette, choices in the rail. End: result scene, main score, New run and To title in the rail, stats in a sheet.

- [ ] **Step 1: Extend the unit tests**: each screen builder still renders its headings, buttons and `aria-label`s (existing tests stay green); the map renders all nodes of a zone reachable by Tab in layer order.
- [ ] **Step 2: Extend `layout.spec.ts`** with the same no-scroll assertions for title, map, event and end on the four projects, using a seeded run to reach each screen.
- [ ] **Step 3: Run** them and expect FAIL where screens still scroll.
- [ ] **Step 4: Implement** the compositions above. Where a screen cannot fit at `console`, fix the composition, not the budget; record any measured minimum in `MIN_BUDGET` (Task 1) with the tests updated.
- [ ] **Step 5: Run** `npm test -w @kinfall/web` and the full web e2e; expect PASS, including axe at 320 px and 1000 px.
- [ ] **Step 6: Commit** `feat: web title, map, event and end in the console layout`.

### Task 7: Web rotation and fullscreen resilience

**Files:**
- Test: `apps/web/tests/e2e/layout.spec.ts` (extend)
- Modify: `apps/web/src/view/layout.ts`, `apps/web/src/view/battleView.ts` only where a test fails

- [ ] **Step 1: Write the failing e2e**: in a battle, call `page.setViewportSize` from 360x640 to 640x360 and back; assert the battle log lines and the HP shown are unchanged and the page does not scroll. Toggle fullscreen through a dispatched `fullscreenchange` after resizing the viewport and assert `data-orientation` follows.
- [ ] **Step 2: Run** `npx playwright test layout -g rotation`, expect FAIL if anything remounts or goes stale.
- [ ] **Step 3: Fix** what the test finds (the scene's ResizeObserver, listeners in `layout.ts`).
- [ ] **Step 4: Run** the e2e on all four projects; expect PASS.
- [ ] **Step 5: Commit** `test: cover web rotation and fullscreen changes`.

---

## Mobile track

### Task 8: Text size setting and layout hook

**Files:**
- Create: `apps/mobile/src/platform/textSizeSetting.ts`, `apps/mobile/__tests__/platform/textSizeSetting.test.ts`, `apps/mobile/src/ui/useLayoutSpec.ts`, `apps/mobile/__tests__/ui/useLayoutSpec.test.ts`
- Modify: `apps/mobile/src/ui/windowSize.ts` (re-export the class helpers from core; keep `layoutFor` and `Layout` until Task 13 removes them)

**Interfaces:**
- Consumes: `layoutSpec`, `effectiveTextScale` (Task 1).
- Produces: `textSizeSetting` with `get(): number` (80 to 150 step 10, default 100), `set(v: number): Promise<void>`, `subscribe(fn: (v: number) => void): () => void`, stored under `webgames.textSize` through the AsyncStorage helper used by `motionSetting.ts`; `useLayoutSpec(screen: ScreenId): LayoutSpec` using `useWindowDimensions` and `effectiveTextScale(fontScale, textSizeSetting.get() / 100)`.

- [ ] **Step 1: Write the failing tests**: `textSizeSetting rejects values outside 80..150 or off the step and keeps the previous`; `it persists and notifies subscribers`; `useLayoutSpec returns landscape console for 640x360 at fontScale 1 and fallback at fontScale 2` (mock `Dimensions` like `__tests__/screens/Layout.test.tsx`).
- [ ] **Step 2: Run** `npm run test:mobile -- textSizeSetting useLayoutSpec`, expect FAIL.
- [ ] **Step 3: Implement** both files. Text components use `maxFontSizeMultiplier` consistent with the 2.0 cap and the setting multiplies through a context so existing text scales with it.
- [ ] **Step 4: Run** `npm run test:mobile`, expect PASS (existing suites unchanged).
- [ ] **Step 5: Commit** `feat: add the mobile text size setting and layout hook`.

### Task 9: Mobile sheet component

**Files:**
- Create: `apps/mobile/src/ui/Sheet.tsx`, `apps/mobile/__tests__/ui/Sheet.test.tsx`

**Interfaces:**
- Produces: `<Sheet visible onClose title children />` (a bottom sheet in portrait, a side drawer in landscape by `useLayoutSpec`) with a visible Close button (48 dp), Android back closing it, `accessibilityViewIsModal`, the content behind hidden through `importantForAccessibility="no-hide-descendants"`, focus moved into it on open and returned to the opener on close, and no slide animation when reduce motion is on.

- [ ] **Step 1: Write the failing tests**: `renders the title and a Close button of at least 48 dp`; `Close and the hardware back call onClose`; `no animation when reduce motion is on`; `the sheet marks itself modal`.
- [ ] **Step 2: Run** `npm run test:mobile -- Sheet`, expect FAIL.
- [ ] **Step 3: Implement** `Sheet.tsx` with a RN `Modal` or an absolutely positioned view, whichever lets the live region behind be paused.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Commit** `feat: add the mobile sheet`.

### Task 10: Mobile shell without page scroll, HUD, immersive mode

**Files:**
- Modify: `apps/mobile/src/ui/Screen.tsx` (console mode renders fixed regions with no `ScrollView`; fallback scrolls only the primary region and pins HUD and actions; safe-area insets respected; the new shell is opt-in through a `screen: ScreenId` prop, and screens that do not pass it keep the legacy ScrollView path until Tasks 12 and 13 migrate them), `apps/mobile/src/screens/RunScreen.tsx`, `apps/mobile/package.json` (add `expo-navigation-bar` with `npx expo install expo-navigation-bar` in `apps/mobile`)
- Create: `apps/mobile/src/platform/immersiveSetting.ts`, `apps/mobile/src/platform/immersive.ts`, `apps/mobile/__tests__/platform/immersive.test.ts`, `apps/mobile/src/ui/Hud.tsx`
- Test: `apps/mobile/__tests__/ui/Screen.test.tsx` (extend)

**Interfaces:**
- Produces: `immersiveSetting` (`get(): boolean` default true, `set`, `subscribe`, key `webgames.immersive`); `applyImmersive(on: boolean): Promise<void>` hiding or showing the navigation and status bars through `expo-navigation-bar` and `StatusBar` (a no-op on non-Android); `<Hud screen onSettings party ... />` showing the party chips, zone and node, and a Settings button (48 dp).

- [ ] **Step 1: Write the failing tests**: `Screen in console mode has no ScrollView` (640x360 and 360x640 at fontScale 1 and 1.3); `Screen in fallback scrolls only the primary region` (640x360 at fontScale 2: one ScrollView, HUD and actions outside it); `applyImmersive(true) hides the navigation bar` (mock the module); `immersiveSetting persists`.
- [ ] **Step 2: Run** `npm run test:mobile -- Screen immersive`, expect FAIL.
- [ ] **Step 3: Implement** the shell and apply immersive mode when the app starts and when the setting changes; keep `RevealScroll` only for fallback.
- [ ] **Step 4: Run** `npm run test:mobile` and `npm run typecheck -w @kinfall/mobile`; expect PASS.
- [ ] **Step 5: Commit** `feat: mobile shell without page scroll, HUD and immersive mode`.

### Task 11: Mobile settings sheet

**Files:**
- Create: `apps/mobile/src/ui/SettingsSheet.tsx`, `apps/mobile/__tests__/ui/SettingsSheet.test.tsx`
- Modify: `apps/mobile/src/screens/TitleScreen.tsx` and `Hud.tsx` (open it), `packages/core/src/platform/i18n` strings (`settings.textSize`, `settings.immersive`) in es and en

**Interfaces:**
- Consumes: `Sheet`, `textSizeSetting`, `immersiveSetting`, `LangToggle`, `MotionToggle`.
- Produces: `<SettingsSheet visible onClose />` with language, reduce motion, text size (stepper 80 to 150), immersive switch.

- [ ] **Step 1: Write the failing tests**: `shows language, motion, text size and immersive controls`; `changing the text size updates textSizeSetting`; `every control is at least 48 dp and has role, name and state`.
- [ ] **Step 2: Run** `npm run test:mobile -- SettingsSheet`, expect FAIL.
- [ ] **Step 3: Implement** the sheet; the title screen's two toggles move into it.
- [ ] **Step 4: Run** `npm run test:mobile`, expect PASS.
- [ ] **Step 5: Commit** `feat: mobile settings sheet`.

### Task 12: Mobile battle composition

**Files:**
- Modify: `apps/mobile/src/screens/BattleView.tsx`, `apps/mobile/src/screens/RunScreen.tsx`, `apps/mobile/src/battle/*` only for the stage size
- Test: `apps/mobile/__tests__/screens/Layout.test.tsx` (extend), existing battle tests

**Interfaces:**
- Consumes: `useLayoutSpec('battle')`, `Hud`, `Sheet`.
- Produces: the stage fills `primary`; the log becomes a one-line message over the stage plus a Log button that opens a sheet; moves and swaps and Flee fill `actions` as a one- or two-column grid; Abandon moves to the Settings or a menu sheet, with the confirmation inline where its button was (as today). `compactBattle` and the three old layouts are removed.

- [ ] **Step 1: Extend `Layout.test.tsx`** with the landscape phones: for 640x360 and 914x411 at fontScale 1 and 1.3, the battle renders no page ScrollView, the choices container sits to the right of the stage, and every touchable is at least 48 dp; for 360x640 the choices are below the stage; the reading order stays rival HUD, stage (hidden), your HUD, choices.
- [ ] **Step 2: Run** `npm run test:mobile -- Layout`, expect FAIL.
- [ ] **Step 3: Implement** the composition. Rotation must keep the same `BattleView` instance (do not key the view on orientation) so the battle, log and animation survive.
- [ ] **Step 4: Add the test** `rotating from portrait to landscape keeps the battle log lines` (re-render with swapped dimensions, assert the same log text).
- [ ] **Step 5: Run** `npm run test:mobile`, expect PASS; goldens untouched.
- [ ] **Step 6: Commit** `feat: mobile battle in the console layout`.

### Task 13: Mobile title, map, event and end

**Files:**
- Modify: `apps/mobile/src/screens/{TitleScreen,MapView,EventView,EndView}.tsx`, `apps/mobile/src/ui/{PartyPanel,RunLogPanel}.tsx`
- Test: `apps/mobile/__tests__/screens/Layout.test.tsx` and the per-screen suites

**Interfaces:**
- Consumes: `useLayoutSpec`, `Hud`, `Sheet`.
- Produces: the same screen compositions as Task 6 (title strip of starters, map as a fixed board, event vignette and rail, end score and rail), with log, party details and stats in sheets.

- [ ] **Step 1: Extend the tests**: for each screen at 640x360 and 360x640 (fontScale 1 and 1.3) assert no page ScrollView, every touchable at least 48 dp, and all map nodes reachable and labelled; the old two-pane assertions are replaced by the region assertions. Once every screen is migrated, remove the legacy path: `layoutFor`, `Layout`, `compactBattle`, `twoPane` and the legacy `Screen` ScrollView branch.
- [ ] **Step 2: Run** `npm run test:mobile -- screens`, expect FAIL.
- [ ] **Step 3: Implement** the compositions; fix the composition rather than the budget, recording any measured minimum in `MIN_BUDGET`.
- [ ] **Step 4: Run** `npm run test:mobile` and `npm run typecheck -w @kinfall/mobile`, expect PASS.
- [ ] **Step 5: Commit** `feat: mobile title, map, event and end in the console layout`.

---

### Task 14: Cross-platform verification, docs, release candidate

**Files:**
- Modify: `apps/mobile/ACCESSIBILITY.md` (new layout, sheets, immersive), `docs/owner-steps.md` (real-phone checks), `docs/distribution.md` (version note), `apps/mobile/app.json` (`expo.version` to `0.3.0`)
- Create: `docs/superpowers/notes/2026-11-22-console-layout-qa.md` (what was run, what was not)

- [ ] **Step 1: Run** `npm test`, `npm run test:mobile`, the goldens check and `npx playwright test` on all four web projects; expect all green with goldens byte-identical.
- [ ] **Step 2: Build** a local release APK with `bash scripts/distribute-android.sh --dry-run` (needs Doppler); expect a signed APK and no upload.
- [ ] **Step 3: Run by hand** the emulator matrix of `ACCESSIBILITY.md` (360x640, 411x914, 914x411, 800x1280, 1280x800, 600x800 at 100 and 200% text) and TalkBack through each screen; write the outcome, including what could not be run, in the QA note.
- [ ] **Step 4: Update** the docs listed above in English.
- [ ] **Step 5: Commit** `docs: record the console layout QA and bump to 0.3.0`. Tagging and distributing `v0.3.0` needs the owner's go-ahead.
