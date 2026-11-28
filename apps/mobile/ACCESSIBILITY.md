# Mobile app: accessibility and layout checklist

What the mobile app (`apps/mobile`) does for accessibility and adaptive layout, and how each case was checked. Task 8 of the [React Native plan](../../docs/superpowers/plans/2026-11-16-react-native-app.md). The layout rules themselves are described in the [mobile README](README.md#accessibility-and-layout).

Legend: **verified** (checked on the Android emulator and/or by Jest, as stated), **unit-tested only**, **not testable here** (with the reason).

## How it was checked

- **Jest / React Native Testing Library** (`npm run test:mobile`): roles, names and states of every touchable on every run screen, 48dp targets, hidden sprites, the console layout of every screen (regions, no page scroll, the pinned fallback), the sheets, where the abandon confirmation shows, the reveal scroll maths, the iOS announcements and the palette contrast. Suites: `__tests__/screens/Layout.test.tsx`, `__tests__/ui/reveal.test.tsx`, `__tests__/platform/announce.test.tsx`, `__tests__/theme.test.ts`, plus the earlier screen suites.
- **Android emulator** (AVD `webgames_api36`, Android 16 / API 36, Expo Go, Metro): a scripted driver (adb + `uiautomator dump`) opened every screen in each configuration below, took a screenshot and checked from the view hierarchy that every touchable shown whole is at least 48x48dp and named, that nothing sticks out sideways, that at least one battle choice is on the first screen of the battle, and that the abandon confirmation is fully on screen once open. Event and end screens were reached through the dev tools' sample saves, then **Continue run**; the battle by tapping the first available node of a new run.  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.**
- Window sizes were set with `wm size` / `wm density` and rotation, font scale with `settings put system font_scale`, the theme with `cmd uimode night`.

## Device matrix (Android emulator)

> Every row below describes the earlier scrolling layouts (page scroll, two panes, the compact battle). The console layout replaced them (fixed regions, sheets, a pinned fallback at 200% text), so those rows are marked superseded and need a new emulator pass. What the console layout has is proved in Jest (`Layout.test.tsx`, `runMetrics.test.ts`, `hudMetrics.test.ts`, `battleMetrics.test.ts`). Known text-size exceptions: the map board is 7 columns of 48 to 64 dp, so its node names follow the text size only while they fit and then shrink (down to 60 percent); the full name and state are in the rail readout and in the accessible name. The HUD shows full party chips only when they fit, else one compact chip or none (the Run sheet always lists the party). The save-failure banner floats over the top of the primary region until dismissed.

Screens per configuration: title, map (+ confirmation), battle (+ one played turn, + confirmation when the battle lasted), recruit with a full party, shrine, shrine without souls, cache, mystery (each + confirmation from Android back), run won, run lost.

| Window (dp) | Font | Language / theme | Result |
|---|---|---|---|
| 360x640 (small phone) | 200% | es / dark | 17 screens, no issue; compact battle (choices pinned)  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 360x640 | 200% | en / light | first run: the map confirmation was cut at the bottom of the screen (fixed: the reveal now retries after the frame and on the content size change, see Fixes); rerun: 19 screens, no issue, including the confirmation in the pinned battle footer  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 360x640 | 100% | en / dark | 17 screens, no issue  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 360x640 | 100% | es / light | title, map, battle and both confirmations: no issue  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 411x914 (phone) | 100% | en / light | 17 screens, no issue  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 411x914 | 100% | es / light | 18 screens, no issue  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 411x914 | 200% | en / dark | 17 screens, no issue; compact battle  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 411x914 | 200% | es / dark | title, map, battle and both confirmations: no issue  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 914x411 (landscape) | 100% | es / dark | 18 screens, no issue; two panes everywhere  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 914x411 | 200% | en / light | 18 screens; the map confirmation was cut in the first run (same fix, rerun clean). The battle confirmation after a played turn was not opened by the driver's tap in two runs (the tap landed while the column was still scrolling); opened by hand afterwards it shows whole next to the choices  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 800x1280 (tablet portrait) | 100% | en / light | 17 screens, no issue; one column capped at 720dp  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 1280x800 (tablet landscape) | 200% | es / dark | 17 screens, no issue; two panes  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 1280x800 | 100% | en / light | title, map, battle: no issue  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 600x800 (foldable-like window) | 200% | es / light | 17 screens, no issue; compact battle  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| 600x800 | 100% | en / dark | title, map, battle: no issue  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |

## Checklist

### Screen readers
| Case | Status |
|---|---|
| Every touchable has a role (button, radio, radiogroup, link), a name and its state (disabled, checked, selected, busy) | verified: Jest sweep on title, map, battle, events and end at 360x640 @200% and 1280x800; emulator hierarchy: no unnamed touchable in any configuration  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| The hub: a radiogroup (named "Games") of three radio cards with their checked state; the "coming soon" cards carry `disabled` and a name that says it once ("Simulator, Coming soon"); Play is a button | unit-tested only: `HubScreen.test.tsx`, `Layout.test.tsx` (48 dp sweep at 360x640 @200% and 1280x800) |
| Map nodes read core's `map.nodeLabel` ("Wild creature: available", "you are here" for the current node) | verified: Jest; emulator content descriptions  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| Creature sprites, element icons, HP/focus bars and map glyphs are hidden; the same information is in text | verified: Jest (`importantForAccessibility="no-hide-descendants"`); emulator hierarchy  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| The seed hint is read once (as the field's hint), not twice | unit-tested only |
| Battle: new turn lines in a polite live region (Android), focus moves to the prompt after each settled turn, not while the confirmation is open | verified: Jest |
| Run log: only the newest lines are live; nothing is re-announced after a resume or a language change | verified: Jest |
| iOS announcements (no live regions there): new log lines, the save warning and the confirmation question are announced once through `announceForAccessibility`, keyed so re-renders and language changes do not repeat them; Android never calls it (no double reading) | unit-tested only (no iOS device) |
| Focus order follows reading order; in two panes the left pane is read before the right | verified by the view order (Jest and the uiautomator hierarchy), not by a TalkBack walk  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| TalkBack walk-through | partly: TalkBack 16 was enabled on the emulator and its first focus landed on the screen heading ("Start"), but swipes, taps and keyboard shortcuts injected through adb never moved its focus on API 36, so the traversal and spoken output could not be inspected. What TalkBack reads is what the hierarchy exposes (content descriptions, roles, states), which the matrix checked. A walk-through on a real phone is still to do  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| VoiceOver (iOS) | not testable here: no Mac or iOS device |
| Hub: TalkBack on a "coming soon" card, which is disabled for screen readers yet still pressable (selecting it focuses it and speaks the polite "... is coming soon." line; Play with it focused does the same) | not verified: Jest checks the state and the live region text only; TalkBack may skip or dim a disabled item, and may not offer the double tap on it. To check on a real phone |

### Console layout features (not testable here)
| Case | Status |
|---|---|
| Sheets (Run details, Settings, Options, Discard): focus moves to the title on open and back to the opener on close, the screen behind is hidden from the accessibility tree | not testable here: Jest checks the props and the focus calls, no emulator or TalkBack session was run |
| Immersive mode (system bars hidden, swipe from the edge reveals them, the Settings switch) | not testable here: no emulator or device session; to check on Android 13, 14 and 15 |
| Text size stepper in Settings (80 to 150 percent, announced value) | not testable here: Jest covers the values and persistence; the spoken announcement was never heard |
| Android Back with a sheet open (the sheet closes first; closing Settings cancels a pending abandon confirmation) | not testable here: Jest drives the BackHandler, no device |
| TalkBack with the modal sheet (does the polite battle log line still get announced while a sheet is open?) | not testable here: no TalkBack walk-through; the live region sits outside the root that is hidden while a sheet is open |

### Touch targets
| Case | Status |
|---|---|
| Every touchable at least 48x48dp | verified: Jest (`minHeight` >= 48 on every touchable); emulator: no touchable under 48dp in any configuration  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |

### Text size up to 200%
| Case | Status |
|---|---|
| No clipped or truncated text, rows wrap instead of scrolling sideways | verified: emulator screenshots at 200% (360x640, 411x914, 600x800, landscape, tablet); no horizontal overflow in the hierarchy  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Battle choices reachable without scrolling the scene away: compact layout (smaller creatures, HP and focus on one line, choices and Abandon pinned at the bottom) when height / font scale < 600dp | verified: emulator at 360x640 and 411x914 @200% (the first choice is on the first screen; the scene scrolls above); Jest  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Abandon confirmation next to its trigger (in place of the button, or after the event choices) and scrolled fully into view | verified: emulator in every configuration (see the matrix); Jest for the placement  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** The abandon confirmation now lives in a sheet (Settings in battle, a discard sheet on the title screen); Jest covers where it shows. |

### Motion
| Case | Status |
|---|---|
| Battle animations off with reduce motion / remove animations (animator duration scale 0) | verified: Jest; emulator (the AVD runs with animator scale 0: turns settle at once)  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| Screen transitions off with reduce motion (native-stack `animation: none`) | not checked separately: driven by the same reduce motion hook; the emulator runs had animations off  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |

### Colour and contrast
| Case | Status |
|---|---|
| WCAG AA for every colour pair the screens use, light and dark (4.5:1 text, 3:1 control outlines and meter fills) | verified numerically: `CONTRAST_PAIRS` in `src/theme.ts`, checked by `__tests__/theme.test.ts`. Fixed: light disabled text (#6b6e7d on #ececf3 was 4.30:1, now #5f6271 at 5.14:1) and the outline of unfilled controls (the #c9cad6 border was 1.63:1; secondary buttons, inputs, radio cards and the language toggle now use `outline`, 3.95:1 light / 4.54:1 dark on their surface) |
| Meaning never by colour alone (won/lost, available/locked, replace, disabled evolve) | verified: text always carries it (screenshots) |
| Light and dark themes follow the system | verified: emulator in both (switched between launches)  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| Status bar icons readable in both themes (edge to edge) | verified: emulator screenshots  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |

### Window sizes and insets
| Case | Status |
|---|---|
| Size classes and layout decisions (core's pure `layoutSpec`) | unit-tested in core: every device of the matrix and the boundaries |
| Small phone 360x640 | verified (emulator)  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Phone 411x914 | verified (emulator)  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Phone in landscape (914x411): two panes on every screen, display cutout inset respected | verified (emulator); the app is no longer locked to portrait  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Tablet portrait 800x1280: one column capped at 720dp, centred | verified (emulator)  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Tablet landscape 1280x800: two panes | verified (emulator)  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Foldable inner screen ~600x800 | verified as a resized emulator window, not a real foldable  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Real foldable (hinge, posture changes, unfold while running) | not testable here: no foldable device or foldable AVD in this setup |
| Split screen / freeform windows | not tested |
| Edge to edge: content clear of status bar, navigation bar and cutouts | verified (emulator, gesture navigation)  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** The new layout pads the root by the insets but the contract does not know them, so on a notched landscape phone the primary region can be smaller than promised: check on a device. |
| Three-button navigation bar | not tested (the AVD uses gesture navigation); immersive mode hides the system bars until a swipe: to check on Android 13, 14 and 15 |

### Languages
| Case | Status |
|---|---|
| Spanish and English on every screen (Spanish is the longer one) | verified: matrix rows in both  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |

## Scene art (visual style phase C)

The pixel scene art, frames and effects added in phase C ([README](README.md#scene-art)). Checked with Jest (`__tests__/art/*`, `__tests__/ui/PixelFrame.test.tsx`, `__tests__/platform/motionSetting.test.tsx`, `__tests__/screens/Art.test.tsx`) and on the emulator (same AVD, Expo Go, Metro). The scripted driver of the matrix above ran every screen at 411x914 (en, light) and at 360x640 (es dark at 200%, and en light at 100%: title, map, battle and its confirmations, every event, the zone 2 battle; the driver then lost the title in both runs, a harness problem), plus scripted captures in landscape 914x411 (en, dark) and on a 1280x800 tablet (en, light): title, map, battle, an event and an end screen. The emulator crashed once and its launcher stopped responding after many window-size changes, so the full matrix of Task 8 was not repeated.  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.**

| Case | Status |
|---|---|
| Every canvas (battle stage, title hero, map banner, end scene), frame picture, bar, icon and vignette is hidden from screen readers (`no-hide-descendants` + `accessibilityElementsHidden`) and never touchable | verified: Jest (`Art.test.tsx` checks each scene box and that nothing inside is accessible or clickable); emulator hierarchy: no extra clickable or named node  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| The logo is the one labelled image: role image, name "Kinfall" in both languages | verified: Jest; emulator content description  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| Text stays real text: HUD summaries, HP and focus values, choices, node labels, event text, results and the battle log are unchanged; the art only repeats them | verified: Jest (all earlier label and role tests pass unchanged); emulator screenshots  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| Reading order in battle: rival HUD, (stage hidden), your HUD, then the choices | verified: Jest |
| Text contrast on the frames: every button state and the plate, parchment and dusk, all zones (AA 4.5:1); new theme pairs for text, details, danger and "Run won" on plates and buttons | verified numerically (`PixelFrame.test.tsx`, `theme.test.ts`); the core also checks `uiContrastPairs` |
| 48dp targets with the frames | verified: Jest sweep (`Layout.test.tsx`) and the emulator matrix (no target under 48dp)  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| Pressed, disabled and focus states: pressed sinks (shade on top, content one cell lower), disabled is flat with its own AA text colour, keyboard / D-pad focus draws the focus frame outside the box without moving the layout | pressed and disabled verified on the emulator and in Jest; focus verified in Jest only (no hardware keyboard / D-pad navigation was driven on the emulator)  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| Reduced motion: system setting (Android "Remove animations") OR the app's **Reduce motion** switch (a `switch` with its checked state, saved): no sway, cloud drift, shake or flashes, frozen particles, still effect frames; battle turns settle at once | verified: Jest (frame loop draws one still frame, still effect samples, no shake or flash, the app switch makes a turn settle without animations); emulator: the title scene gives identical screenshots 4 s apart with animator scale 0 and with the app switch on, and different ones with motion on  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| Flashes at most 2 per second, never full-screen white; shake at most 3 art px | verified by the core descriptors and `stageDirector.test.ts` (500 ms flash gap); **not reviewed by people with photosensitivity or vestibular needs** |
| Window sizes and 200% text with the art: compact battle (shorter stage, choices pinned), two panes with the stage on the left, tablets with the whole scene | verified: Jest (stage height share per layout) and the emulator matrix  **Superseded by the console layout (no page scroll, fixed regions, sheets), to re-verify on an emulator; not claimed as verified for the new layout.** |
| Light (parchment) and dark (dusk) frames; the battle scene keeps its zone palette in both | verified: emulator screenshots  **Old layout evidence, superseded by the console layout, to re-verify on an emulator.** |
| TalkBack walk-through with the art | not done: same limitation as above (adb gestures do not drive TalkBack on API 36); the hierarchy shows no art nodes |
| Real phone and low-end GPU | not tested: emulator only |

## Fixes made from the emulator runs

- The abandon confirmation could open cut off at the bottom when it was the last thing on the screen: the scroll ran before the scroll view knew the new content height and was clamped. `Screen` now reveals it again after the frame and on the next content size change, and never assumes a clamped scroll landed (commits "reveal a confirmation again once the content height caught up" and "retry the reveal and never assume a clamped scroll landed").

## Not testable here (summary)

- iOS and VoiceOver: no Mac or iOS device.
- Real phones and a real foldable: emulator only.
- A full TalkBack walk-through: adb-injected gestures do not drive TalkBack on the API 36 emulator; it needs a person on a device.
- Expo Go's own dev overlay was disabled during the runs (`__expo_disable_fab=1`); production builds do not have it.
