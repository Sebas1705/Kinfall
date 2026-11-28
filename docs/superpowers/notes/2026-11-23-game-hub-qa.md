# Game hub: QA note (release candidate 0.4.0)

Date: 2026-11-28. Branch `feat/game-hub`. This note says what was run, what was not, what is known to be limited, and what the owner still has to check. Nothing was tagged, pushed or uploaded. The version in `apps/mobile/app.json` is `0.4.0`.

The hub is a new first screen on both apps: three radio cards (Kinfall, playable; two "coming soon" games), a Play button, and the last game played is focused on the next start. Play on Kinfall opens the existing title. The layout contract (`packages/core/src/layout/spec.ts`) has a sixth screen, `hub`, with `MIN_BUDGET.hub = { landscape: 235, portrait: 475 }`. Landscape was measured on the web; portrait is set by the Android fit proofs (the Android portrait primary region is 41% of the height), where 470 fails and 475 is the smallest passing value. The web still shows a console on a 360x640 phone at 100% and 130% text (640 / 1.3 = 492).

## What was run (automated, on the development PC, 2026-11-28)

| Check | Command | Result |
|---|---|---|
| Core and web unit tests | `npx vitest run` | 62 files, 1062 tests passed |
| Mobile unit tests | `npm run test:mobile` (Jest) | 48 suites, 1327 tests passed |
| Typecheck, all workspaces | `npm run typecheck` | clean |
| Build | `npm run build` | ok |
| Size budget | `npm run size` | initial load 37,771 of 38,000 bytes gzipped, scene art 24,212 of 60,000, within budget |
| Web e2e | `npm run test:e2e -- --project=chromium --project=phone-landscape --project=phone-portrait` | 364 passed, 65 skipped (project-scoped skips), 0 failed, 5.7 min |
| Golden files | `git diff origin/main --stat -- packages/core/tests/golden` | empty: goldens untouched |

The hub is covered by `hub.spec.ts` (keyboard, roving focus, soon cards, last game, fallback reachability, 44 px targets), the layout matrix of `layout.spec.ts`, and axe in `run-a11y.spec.ts` (light/dark x en/es x 320/1000 px, text 150%). On Android the Jest proofs cover the hub console rows of the layout matrix plus generated short portrait windows (widths 320, 360 and 411 at the budget height with text 100, 115, 130 and 150%, and fixed windows 360x380, 360x420, 411x440 and 360x480), in English and Spanish (`runMetrics.test.ts`, `Layout.test.tsx`). This is a matrix, not every possible window, plus the hub screen, the last-game storage and the navigation (hub first, Play opens the title, Back from the title returns to the hub). The mobile `mobile` Playwright project of earlier notes was not part of this run.

The fix wave also removed a duplicate "Coming soon" read on the web soon cards (badge only now; playable cards keep the tagline).

## What was not run

There is no emulator, device or desktop browser session in this environment, so the manual matrix was **not** run and nothing below is claimed as verified.

- No emulator or device at all. In particular: TalkBack double tap on the disabled-but-pressable "coming soon" card, Android Back from the Title and from the Hub, safe-area insets on a notched phone, and 130% and 200% text on real fonts (the Android fit proofs use conservative estimates of text height, not measured text).
- Firefox and WebKit e2e projects are CI-only; nothing from this branch has run in CI yet.
- The Maestro flows (`resume-after-kill.yaml`, `subflows/open-title.yaml`, now going through the hub) were edited but never run.
- No release APK was built for 0.4.0.

## Known limitations (deferred minors from the reviews)

- The Android fit proof is one-directional: a row the hub cannot fit is a fallback row, but not the reverse (a fallback row may in fact fit).
- The "fallback rows" metric test is near-vacuous.
- Portrait announce lines are not compared with the info band.
- The Title test lost its live language-switch coverage (the language is checked after a restart, since the app now starts on the hub).
- The hub heading is dropped only on tight console rows of the Android screen (it is kept in the scrolling fallback, which includes 320x640 at 150% in Spanish). No tested console row currently triggers the drop, so the path is covered by a unit render only.
- The web fallback e2e viewport check does not detect a card hidden under the pinned rail.
- The web initial bundle is 37,771 of 38,000 bytes (229 B headroom). The budget was raised from 37,000 because the hub is a new first screen: 37,508 measured with the screen and routing, before the console layout and the live-region fix.
- Web browser Back: the web router never touches `history` (no `pushState`, `popstate` or hash in `apps/web/src`), so browser Back from Kinfall's title does not return to the hub; it leaves the page. The in-page route back is the **Games** button, shown on Kinfall's title only, never mid-run. Not tried in a real browser.
- Entry URLs: `?game=kinfall`, `?seed=...` and `?mode=battle` bypass the hub (`gameFromSearch`, `apps/web/src/main.ts`; `?mode=battle` loads the demo battle page); an unknown `?game=` shows the hub.
- The taglines live inside the cards, not in the landscape rail as the first plan said.
- The web text-size slider caps at 150%, so the 200% fallback is tested with short windows at 150% (640x300, 360x420); 2.0 is covered by the core budget table only.
- A deep link `?game=kinfall` does not write the last game (only Play from the hub does).
- `FramePressable` now passes `disabled={disabled || undefined}` so a card can be disabled for screen readers and stay pressable; this touches every framed button (the full Jest suite passes).

## Owner checklist

See "Real-phone checks for 0.4.0 (game hub)" in [owner-steps](../../owner-steps.md): Back behaviour, TalkBack on the radio cards and the soon card, text at 130% and fallback at 200%, the hub in both orientations, and last-game focus after reopening the app.
