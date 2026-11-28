# Kinfall console layout: "no scroll, full screen, orientation-aware" — design

Status: design, awaiting owner approval. Date: 2026-11-22.

Legend: **[Owner]** = decided by the owner in conversation. **[My call]** = chosen by the designer; the owner may change it.

## 1. Why

The owner wants Kinfall to feel like a console game and not like a web page of cards: a fixed screen that uses the whole display, takes advantage of the orientation, and follows the principles of game interfaces (always-visible HUD, the scene as the protagonist, menus that never hide the action, no page scrolling). **[Owner]** This continues the visual style work (`2026-11-20-visual-style-design.md`), which gave the game its look; this spec changes how every screen is composed.

What exists today (facts from the code):

- Mobile: every run screen renders inside `ui/Screen.tsx`, a vertical `ScrollView` with reveal-into-view logic and a pinned footer capped at 55% of the window. Two panes already appear on wide or landscape windows (`ui/windowSize.ts`, `layoutFor`), and the battle has a compact layout below `height / fontScale = 600`. The log, party and choices still stack and scroll. `app.json` has `orientation: default` (free rotation).
- Web: one `index.html`, a router that shows one `[data-screen]` section, page scroll, a topbar with language, reduce motion and text size, and a battle grid (stage, log, menu, d-pad, footer) that becomes two columns from 48 rem. No height or orientation queries. `.log` and `.run-log` scroll inside fixed heights.
- The shared core has no layout code; the pure logic of mobile `windowSize.ts` is the natural seed.

## 2. Goals

- No page or screen scroll on any run screen (title, map, battle, event, end; the game hub of 0.4.0 added a sixth screen, `hub`, to the same contract with its own `MIN_BUDGET` row, see the [game hub QA note](../notes/2026-11-23-game-hub-qa.md)) at any normal phone, tablet or desktop window, in both orientations. **[Owner]**
- Landscape is the primary design: a console composition (scene on one side, actions on the other). Portrait gets its own composition (scene on top, actions in the thumb zone at the bottom), also without scrolling. **[Owner: option B]**
- Use the whole display: immersive mode on Android, a fullscreen option on the web, safe-area insets respected. **[Owner: "full screen"]**
- Game-UI principles on every screen: **[My call]**
  1. A persistent HUD (party health and focus, zone and node) that never scrolls away.
  2. The scene is the protagonist; text lives in small overlays, not in stacked cards.
  3. One consistent place for the actions (the action rail on the right in landscape, the bottom band in portrait) on every screen.
  4. Information has depth: a short line by default, the full history or details in a drawer that opens on demand (never a blocking page).
  5. Feedback happens in the scene (already built by the visual style), not in extra text.
  6. Every control reachable by touch (48 dp mobile, 44 px web), keyboard, and the existing d-pad.
- One shared layout contract in `@kinfall/core` that both apps implement, with the "nothing overflows" rule checked by tests. **[Owner: approach 2]**
- Both apps (web and mobile), mobile first. **[My call: the owner did not restrict it]**

## 3. Non-goals

- No gameplay, balance, content or engine change; no change to art generation. The golden files (battle, run, art) stay byte-identical.
- No orientation lock, no second game, no gamepad API support, no new visual style (the dusk pixel fantasy stays).
- No iOS verification (the iOS shell is not built or tested yet), no store listing work.

## 4. Anti-goals (a failure even if it technically works)

- Text clipped or unreadable at system font scale 200% or web text size 150%. The no-scroll rule yields to accessibility (section 7).
- A different focus or reading order for screen-reader users than today (ACCESSIBILITY.md).
- Touch targets below 48 dp / 44 px, or controls hidden in a way that cannot be opened with a screen reader or the keyboard.
- Information lost for small windows: if it does not fit, it moves into a drawer; it is never dropped.
- A visual regression of the scene (crop, framing) on the sizes that work today.

## 5. Constraints that stay

From `apps/mobile/ACCESSIBILITY.md`, the creature design spec and the visual style spec: text stays real text (only the logo is art); touch targets 48 dp / 44 px; reduced motion on every effect (system setting OR app switch); contrast AA 4.5:1 and 3:1 focus rings; the screen-reader order is the reading order (two panes: left first; battle: rival HUD, stage hidden, your HUD, choices); the web router keeps `hidden` and `inert` on inactive screens and moves focus to the screen heading; the confirmation to abandon a run appears where its button was; the log is a polite live region with only the newest lines live; flashes at most 2 per second and shake at most 3 art pixels; no horizontal overflow at 320 px wide at text 80, 100 and 150; the `pointer: coarse` d-pad stays; layout code never imports `sim/rng` and never touches the sim or the art generator.

## 6. Approaches considered

| Option | What it is | Why (not) |
|---|---|---|
| A. Each platform on its own | Drop the `ScrollView` on mobile, rewrite the CSS grid on web, each with its own composition | Fastest, but the rules drift apart and there is nothing common to test "nothing overflows" against. |
| **B. Shared layout contract in core, each platform draws it (chosen)** **[Owner]** | Core defines pure functions: size classes, orientation, which regions a screen has and how much height or width each may take; mobile and web implement them; tests exercise the contract on a device matrix | Keeps the console feel without giving up real text and accessibility; starts from the existing pure `layoutFor`. More upfront design than A. |
| C. The whole UI inside the canvas | HUD and menus drawn in Pixi and Skia | The most "game", but breaks "text stays real text" (accessible, translatable, scalable) and is a rewrite. |

## 7. The design

### 7.1 The layout contract (core)

A new pure module in `packages/core/src/layout/` (platform-neutral, no DOM or React Native import; covered by the existing `platform-neutral` guard test). **[My call: names are indicative]**

- Input: window width and height in dp or CSS px, the text scale (system `fontScale` on mobile, the text-size setting on web as a fraction), and whether the primary pointer is coarse.
- Output (`LayoutSpec`):
  - `orientation`: `landscape` when width > height, else `portrait`.
  - size classes (width at 600 and 840, height at 480 and 900, as today).
  - `mode`: `console` (fits without scrolling), or `fallback` (see 7.5).
  - for each screen, the regions it has and their share of the available area: in landscape `hud` (a slim top strip), `stage`/`primary` (left, at least 55% of the width) and `rail` (right, actions); in portrait `hud`, `stage` (top 38 to 45% of the height), `info` (one or two lines) and `actions` (bottom band, in the thumb zone).
  - the budget in "text-sized" units of height (height divided by the text scale), so large fonts switch to `fallback` through one rule instead of per-screen breakpoints.
- The mobile `windowSize.ts` pure functions move here (`widthClass`, `heightClass`, `layoutFor`, the thresholds); `useLayout()` stays in mobile as a thin hook. The web gets a small `layout.ts` that reads the viewport and text size and writes the result as `data-orientation`, `data-layout` and CSS custom properties on `.app`; the CSS uses them (grid areas per mode).
- The two copies of `stageFrame` (mobile and web `stageLayout.ts`) are unified in core as part of this work, since the scene is the main region. **[My call; the builder may defer if the scene tests make it risky]**

### 7.2 Composition per screen

Landscape (console):

```
┌──────────────────────────────────────────────────────────┐
│ HUD: party ♥ ◆ · Zone 2 · Node 5            [log] [menu] │
├──────────────────────────────────────┬───────────────────┤
│                                      │  ACTION RAIL      │
│   SCENE / primary content            │  [Move 1]         │
│   (one-line message over it)         │  [Move 2]         │
│                                      │  [Swap] [Flee]    │
└──────────────────────────────────────┴───────────────────┘
```

Portrait: HUD strip on top, the scene below it (38 to 45% of the height), a one or two line message strip, the actions as a 2-column grid at the bottom.

| Screen | Primary region | Actions | Moves into drawers |
|---|---|---|---|
| Title | Hero art and wordmark | New run, Continue (and Discard) as the rail; starters as a horizontal strip or paged chooser in the primary region | Seed field, saves note, language, motion, text size, dev link: a settings sheet |
| Map | The node map drawn as a fixed board (layers side by side in landscape, a compact board in portrait) | Choose node (focus moves over nodes; the selected node's action goes to the rail) | Run log, party details, Abandon |
| Battle | The stage (already built) | Moves and swaps in the rail or bottom band | Full battle log, Abandon |
| Event | The offer (recruit, shrine, cache, mystery) as a scene vignette plus a short description | The event choices | Party details, log |
| End | Result scene and the main score | New run, To title | Detailed stats, run log |

**Settings** (today in the web topbar and, on mobile, as two toggles on the title) become a settings sheet opened from an icon in the HUD, on both platforms: language, reduce motion, text size (the web has a 80 to 150 slider; mobile gets the same control so both apps behave the same way). **[My call]**

Party is at most 3 and the run log shows at most 8 lines (`MAX_PARTY`, `RUN_LOG_VISIBLE`), so the HUD fits three chips and the drawer a short list.

### 7.3 Full screen and orientation

- Android: immersive mode (system bars hidden with swipe to reveal), safe-area and display cutout respected; `orientation` stays `default` (free rotation). The layout reacts live to rotation (the manifest already handles `orientation|screenSize`). **[My call: immersive on by default, toggle in settings]**
- Web: the app fills `100dvh`; `viewport-fit=cover` and `env(safe-area-inset-*)`; the topbar disappears (its controls live in the HUD and the settings sheet); a Fullscreen API button in the HUD (works only from a user gesture) hides the browser chrome. No forced orientation on the web (the Screen Orientation lock is not reliable outside fullscreen and installed apps).

### 7.4 Overlays and drawers

The log, the party details and the settings open as a sheet over the scene (bottom sheet in portrait, side drawer in landscape), closable with Back, Escape and a visible button, with focus trapped inside and returned to the opener. The abandon confirmation keeps appearing where its button was (existing rule) and becomes the first thing a sheet-less screen shows. The one-line message strip is a polite live region, like today's log.

### 7.5 Accessibility fallback (the only scroll allowed)

`mode: fallback` applies when the window height divided by the effective text scale is below the screen's minimum budget (orientation-split `MIN_BUDGET`), when the effective scale is above 2.0, or when the height is under 320 px (for example a landscape phone at 200% text); there is no separate 1.3 threshold (see section 12, item d). In fallback the rail (the battle's choices, a run screen's actions) and the HUD stay pinned, the rail capped at 55% of the window height with its own inner scroll, and only the primary or drawer content scrolls inside its own region; the page itself never scrolls. This keeps the 200% requirement and the existing compact-battle idea, now decided by one rule. **[My call]**

### 7.6 Input

Touch targets as today. Keyboard: spatial arrow-key focus over the rail and the board (the web already has a d-pad for coarse pointers; it stays). Screen readers: reading order follows the DOM and the accessibility tree in the order listed in ACCESSIBILITY.md; the regions are landmarks on the web (`header`, `main`, a labelled `nav` or `group` for the rail).

## 8. Testing and verification

- Core: a device matrix table test for the contract, with at least 320x640, 360x640, 411x914, 640x360, 914x411 (phone landscape), 600x800, 800x1280, 1280x800, 1366x768 and 1920x1080, each at text scales 1.0, 1.3 and 2.0; asserts `orientation`, `mode` and that the region shares sum to the available area.
- Mobile Jest: the existing `Layout.test.tsx` and window mocks extended with the landscape phones; assert that, in `console` mode, no screen renders a scroll container for the page, that every touchable is at least 48 dp, and that the reading order is unchanged.
- Web Playwright: new landscape phone projects (640x360 and 800x360, touch) and a portrait one; per screen assert `document.scrollingElement.scrollHeight <= innerHeight` and no horizontal overflow at 320 px wide at text 80, 100 and 150; the existing axe, 44 px target and focus-order checks stay green.
- The goldens (battle, run, art) are unchanged and checked by the existing CI step.
- Manual: the emulator matrix in ACCESSIBILITY.md (360x640, 411x914, 914x411, 800x1280, 1280x800, 600x800, at 100 and 200% text), a real phone in both orientations, and TalkBack through each screen. I will say honestly what I could not test.

## 9. Suggested order (the builder may reshape it)

1. The contract in core with its matrix tests (and moving `windowSize` and `stageFrame`).
2. The web shell: `100dvh`, no topbar, HUD, settings sheet, fullscreen button; then the battle, then the other screens.
3. The mobile shell: drop the page `ScrollView`, HUD, sheets, immersive mode; then the battle, then the other screens.
4. Cross-platform QA, the manual matrix, docs (`docs/` and ACCESSIBILITY.md), and a tester release.

## 10. Left to the builder

Names and file layout of the new modules; exact region proportions (the numbers above are starting points to tune by looking at the screens); the sheet and drawer component details; how the node map is drawn as a fixed board; whether the starters are a strip or a pager; the motion of drawers (it must respect reduced motion); the order of phases.

## 11. Calls made after the builder check

All **[My call]**, settled so the plan does not have to guess; the owner may change any of them.

1. **When `console` mode must hold.** The target is no scroll at 640x360 (phone landscape) at text scale 1.0 and 1.3, at 360x640 (portrait) at 1.0 and 1.3, and at every larger window up to 2.0. Above that effective scale, or below 320 dp of height, the screen switches to `fallback` (7.5; the exact rule is in section 12, item d). The per-screen minimum budgets are derived by measuring the real screens against this target. The Playwright no-scroll assertions hold in `console` mode only; fallback has its own assertion (the page does not scroll, only the primary region inside it does).
2. **Effective text scale.** One number on both platforms: `effective = systemFontScale x appTextSize`, capped at 2.0. Web has no system font scale in its own layout input (the browser zoom already changes the viewport), so there `effective = appTextSize` (0.8 to 1.5). Mobile gets the same slider (0.8 to 1.5) that multiplies the system scale; app text uses `maxFontSizeMultiplier` consistent with the cap. The fallback rule (7.5, section 12 item d) applies to this effective value.
3. **The node map** is bounded: 7 layers per zone, 2 or 3 nodes in each, 1 for the boss (at most 19 nodes). It is drawn as a fixed board (layers side by side in landscape, compact in portrait); if it does not fit at large text it falls under `fallback`. The selection model stays as today (activating a node moves there); arrow keys move focus between nodes.
4. **Rail size.** A creature has 4 moves, a party has at most 3, so a battle has at most 4 moves, 2 swaps and flee. The rail is a one- or two-column grid sized by the contract; if it still does not fit it goes to `fallback` rather than paging.
5. **Sheets and screen readers.** While a sheet is open, the content behind it is hidden from the accessibility tree (`inert` on web, `importantForAccessibility="no-hide-descendants"` on mobile) and the live region is paused; closing returns focus to the opener. The abandon confirmation stays inline where its button was (as today), not in a sheet.
6. **Immersive mode.** `expo-navigation-bar` plus the existing safe-area code (a managed Expo module, applied by prebuild; the `android` folder is generated and gitignored, not committed). It is a new native dependency, so it ships in the next tester release. The on/off choice is stored with the existing settings and remembered across launches; default on.
7. **`stageFrame` unification** may be deferred to a later change if it risks the scene; the scene framing is checked by the existing stage-layout unit tests plus a visual check by hand on the matrix sizes. A narrower scene at 640x360 may crop more sky, never the creatures.
8. **Large desktop windows.** Content is capped at 1200 px wide as the mobile layout already does; wider windows letterbox with the dusk backdrop continuing, and the scene keeps whole-number scales.

## 12. Deviations accepted at the end of the implementation

Each one was ruled during the build and is recorded in `.superpowers/sdd/2026-11-22-console-layout/progress.md`; the cost says what happens if the ruling turns out wrong. **[My call]**, the owner may reverse any of them.

- **a. The web d-pad is hidden for coarse pointers only when landscape height < 480 or portrait height < 800.** The rail buttons are directly tappable there, so the d-pad is redundant (7.6 said it stays). Cost if wrong: a touch-only player on a small phone has no d-pad.
- **b. Arrow-key focus over the map is not implemented** (7.6 and 11.3 promised it). Tab and the rail work. Follow-up. Cost if wrong: keyboard users tab through up to 19 nodes.
- **c. The live region while a sheet is open differs by platform** (11.5 said it is paused). On the web the screens are inert, so it is paused. On mobile it keeps announcing (the Task 9 ruling: the polite region sits outside the root that is hidden from the accessibility tree). Cost if wrong: a web screen-reader user can miss a turn message while a sheet is open, or a mobile one hears a message about a screen the sheet covers.
- **d. The fallback threshold is the orientation-split `MIN_BUDGET` plus the 2.0 cap.** There is no separate 1.3 threshold: the old wording in 7.5 and 11.2 is superseded by this item. Cost if wrong: none (documentation).
- **e. Abandon lives in the Settings sheet on mobile** (three taps from a run screen), and the title's Discard confirmation opens in a sheet instead of inline (11.5 kept the abandon confirmation inline). Closing the Settings sheet cancels a pending abandon confirmation. Cost if wrong: a deliberate destructive action takes one tap more than before.
- **f. The title and event portrait budgets are 460, the title landscape budget 245 and the end portrait budget 330** (they were 380, 220, 380 and 310 when the web screens were measured). The mobile fit proofs, now run over every console row of the contract up to 200% text (`apps/mobile/test-utils/consoleRows.ts`), showed the Android screens overflow at 360x640 @150%, 411x914 @200% and 600x800 @200% (title, event), 640x360 @150% (title) and 360x640 @200% (end), so those rows fall back. The mobile end note now takes up to three lines instead of two so that 411x914 @200% in Spanish stays a console. Cost if wrong: those windows scroll inside the primary region instead of fitting, and the web does the same there (for example a title at 360x640 and 150% text).
- **g. Not proven on mobile:** windows narrower than 360 dp (the 320 dp row of the contract is a web case; on Android the map board is 44 dp per node there) and text scales between the rows tested (1.0, 1.3, 1.5, 2.0). Cost if wrong: a very narrow phone may clip.

