# Mobile app: accessibility and layout checklist

What the mobile app (`apps/mobile`) does for accessibility and adaptive layout, and how each case was checked. Task 8 of the [React Native plan](../../docs/superpowers/plans/2026-11-16-react-native-app.md). The layout rules themselves are described in the README ([Accessibility and layout](../../README.md#accessibility-and-layout)).

Legend: **verified** (checked on the Android emulator and/or by Jest, as stated), **unit-tested only**, **not testable here** (with the reason).

## How it was checked

- **Jest / React Native Testing Library** (`npm run test:mobile`): roles, names and states of every touchable on every run screen, 48dp targets, hidden sprites, the size-class logic, the compact battle, two panes, where the abandon confirmation shows, the reveal scroll maths, the iOS announcements and the palette contrast. Suites: `__tests__/screens/Layout.test.tsx`, `__tests__/ui/windowSize.test.ts`, `__tests__/ui/reveal.test.tsx`, `__tests__/platform/announce.test.tsx`, `__tests__/theme.test.ts`, plus the earlier screen suites.
- **Android emulator** (AVD `webgames_api36`, Android 16 / API 36, Expo Go, Metro): a scripted driver (adb + `uiautomator dump`) opened every screen in each configuration below, took a screenshot and checked from the view hierarchy that every touchable shown whole is at least 48x48dp and named, that nothing sticks out sideways, that at least one battle choice is on the first screen of the battle, and that the abandon confirmation is fully on screen once open. Event and end screens were reached through the dev tools' sample saves, then **Continue run**; the battle by tapping the first available node of a new run.
- Window sizes were set with `wm size` / `wm density` and rotation, font scale with `settings put system font_scale`, the theme with `cmd uimode night`.

## Device matrix (Android emulator)

Screens per configuration: title, map (+ confirmation), battle (+ one played turn, + confirmation when the battle lasted), recruit with a full party, shrine, shrine without souls, cache, mystery (each + confirmation from Android back), run won, run lost.

| Window (dp) | Font | Language / theme | Result |
|---|---|---|---|
| 360x640 (small phone) | 200% | es / dark | 17 screens, no issue; compact battle (choices pinned) |
| 360x640 | 200% | en / light | first run: the map confirmation was cut at the bottom of the screen (fixed: the reveal now retries after the frame and on the content size change, see Fixes); rerun: 19 screens, no issue, including the confirmation in the pinned battle footer |
| 360x640 | 100% | en / dark | 17 screens, no issue |
| 360x640 | 100% | es / light | title, map, battle and both confirmations: no issue |
| 411x914 (phone) | 100% | en / light | 17 screens, no issue |
| 411x914 | 100% | es / light | 18 screens, no issue |
| 411x914 | 200% | en / dark | 17 screens, no issue; compact battle |
| 411x914 | 200% | es / dark | title, map, battle and both confirmations: no issue |
| 914x411 (landscape) | 100% | es / dark | 18 screens, no issue; two panes everywhere |
| 914x411 | 200% | en / light | 18 screens; the map confirmation was cut in the first run (same fix, rerun clean). The battle confirmation after a played turn was not opened by the driver's tap in two runs (the tap landed while the column was still scrolling); opened by hand afterwards it shows whole next to the choices |
| 800x1280 (tablet portrait) | 100% | en / light | 17 screens, no issue; one column capped at 720dp |
| 1280x800 (tablet landscape) | 200% | es / dark | 17 screens, no issue; two panes |
| 1280x800 | 100% | en / light | title, map, battle: no issue |
| 600x800 (foldable-like window) | 200% | es / light | 17 screens, no issue; compact battle |
| 600x800 | 100% | en / dark | title, map, battle: no issue |

## Checklist

### Screen readers
| Case | Status |
|---|---|
| Every touchable has a role (button, radio, radiogroup, link), a name and its state (disabled, checked, selected, busy) | verified: Jest sweep on title, map, battle, events and end at 360x640 @200% and 1280x800; emulator hierarchy: no unnamed touchable in any configuration |
| Map nodes read core's `map.nodeLabel` ("Wild creature: available", "you are here" for the current node) | verified: Jest; emulator content descriptions |
| Creature sprites, element icons, HP/focus bars and map glyphs are hidden; the same information is in text | verified: Jest (`importantForAccessibility="no-hide-descendants"`); emulator hierarchy |
| The seed hint is read once (as the field's hint), not twice | unit-tested only |
| Battle: new turn lines in a polite live region (Android), focus moves to the prompt after each settled turn, not while the confirmation is open | verified: Jest |
| Run log: only the newest lines are live; nothing is re-announced after a resume or a language change | verified: Jest |
| iOS announcements (no live regions there): new log lines, the save warning and the confirmation question are announced once through `announceForAccessibility`, keyed so re-renders and language changes do not repeat them; Android never calls it (no double reading) | unit-tested only (no iOS device) |
| Focus order follows reading order; in two panes the left pane is read before the right | verified by the view order (Jest and the uiautomator hierarchy), not by a TalkBack walk |
| TalkBack walk-through | partly: TalkBack 16 was enabled on the emulator and its first focus landed on the screen heading ("Start"), but swipes, taps and keyboard shortcuts injected through adb never moved its focus on API 36, so the traversal and spoken output could not be inspected. What TalkBack reads is what the hierarchy exposes (content descriptions, roles, states), which the matrix checked. A walk-through on a real phone is still to do |
| VoiceOver (iOS) | not testable here: no Mac or iOS device |

### Touch targets
| Case | Status |
|---|---|
| Every touchable at least 48x48dp | verified: Jest (`minHeight` >= 48 on every touchable); emulator: no touchable under 48dp in any configuration |

### Text size up to 200%
| Case | Status |
|---|---|
| No clipped or truncated text, rows wrap instead of scrolling sideways | verified: emulator screenshots at 200% (360x640, 411x914, 600x800, landscape, tablet); no horizontal overflow in the hierarchy |
| Battle choices reachable without scrolling the scene away: compact layout (smaller creatures, HP and focus on one line, choices and Abandon pinned at the bottom) when height / font scale < 600dp | verified: emulator at 360x640 and 411x914 @200% (the first choice is on the first screen; the scene scrolls above); Jest |
| Abandon confirmation next to its trigger (in place of the button, or after the event choices) and scrolled fully into view | verified: emulator in every configuration (see the matrix); Jest for the placement |

### Motion
| Case | Status |
|---|---|
| Battle animations off with reduce motion / remove animations (animator duration scale 0) | verified: Jest; emulator (the AVD runs with animator scale 0: turns settle at once) |
| Screen transitions off with reduce motion (native-stack `animation: none`) | not checked separately: driven by the same reduce motion hook; the emulator runs had animations off |

### Colour and contrast
| Case | Status |
|---|---|
| WCAG AA for every colour pair the screens use, light and dark (4.5:1 text, 3:1 control outlines and meter fills) | verified numerically: `CONTRAST_PAIRS` in `src/theme.ts`, checked by `__tests__/theme.test.ts`. Fixed: light disabled text (#6b6e7d on #ececf3 was 4.30:1, now #5f6271 at 5.14:1) and the outline of unfilled controls (the #c9cad6 border was 1.63:1; secondary buttons, inputs, radio cards and the language toggle now use `outline`, 3.95:1 light / 4.54:1 dark on their surface) |
| Meaning never by colour alone (won/lost, available/locked, replace, disabled evolve) | verified: text always carries it (screenshots) |
| Light and dark themes follow the system | verified: emulator in both (switched between launches) |
| Status bar icons readable in both themes (edge to edge) | verified: emulator screenshots |

### Window sizes and insets
| Case | Status |
|---|---|
| Size classes and layout decisions (pure `layoutFor`) | unit-tested: every device of the matrix and the boundaries |
| Small phone 360x640 | verified (emulator) |
| Phone 411x914 | verified (emulator) |
| Phone in landscape (914x411): two panes on every screen, display cutout inset respected | verified (emulator); the app is no longer locked to portrait |
| Tablet portrait 800x1280: one column capped at 720dp, centred | verified (emulator) |
| Tablet landscape 1280x800: two panes | verified (emulator) |
| Foldable inner screen ~600x800 | verified as a resized emulator window, not a real foldable |
| Real foldable (hinge, posture changes, unfold while running) | not testable here: no foldable device or foldable AVD in this setup |
| Split screen / freeform windows | not tested |
| Edge to edge: content clear of status bar, navigation bar and cutouts | verified (emulator, gesture navigation) |
| Three-button navigation bar | not tested (the AVD uses gesture navigation) |

### Languages
| Case | Status |
|---|---|
| Spanish and English on every screen (Spanish is the longer one) | verified: matrix rows in both |

## Fixes made from the emulator runs

- The abandon confirmation could open cut off at the bottom when it was the last thing on the screen: the scroll ran before the scroll view knew the new content height and was clamped. `Screen` now reveals it again after the frame and on the next content size change, and never assumes a clamped scroll landed (commits "reveal a confirmation again once the content height caught up" and "retry the reveal and never assume a clamped scroll landed").

## Not testable here (summary)

- iOS and VoiceOver: no Mac or iOS device.
- Real phones and a real foldable: emulator only.
- A full TalkBack walk-through: adb-injected gestures do not drive TalkBack on the API 36 emulator; it needs a person on a device.
- Expo Go's own dev overlay was disabled during the runs (`__expo_disable_fab=1`); production builds do not have it.
