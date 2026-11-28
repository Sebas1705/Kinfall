# Game hub (common game-selection screen) — design

Status: approved by the owner on 2026-11-23 (short design for a small change).

## Intent and why

The original spec wants three original games (simulator, creature roguelike, survival), built one at a
time on a shared base. Only the roguelike (Kinfall) exists. Before building the other two, the app
needs one common place to choose a game, so that each new game is an entry in a list and not a new
app. The hub also proves the shared console layout with a second screen kind.

## Goals

- One hub screen, first thing on web and Android, with one card per game.
- Kinfall is the only playable card now. "Simulator" and "Survival" are "coming soon" cards with a
  provisional name and no logic (their real names and designs come later).
- Same console contract as the run screens: no page scroll at 640x360 and 360x640, text at 1.0 and
  1.3, the scrolling fallback beyond that, the shared HUD and Settings sheet, es/en.
- The last game played is focused when the hub opens, so entering it is one tap.
- Existing saves and storage keys do not change. Existing deep links keep working.

## Non-goals and anti-goals

- No extraction of the engine into generic packages (done when the second game shows what is common).
- No design or code for the simulator or the survival game.
- No accounts, remote lists or analytics. Anti-goal: the hub must never slow down or hide Kinfall.

## Constraints

- One APK, one web build, one Firebase project (no per-game apps).
- `packages/core` stays platform-neutral (no DOM or React Native imports).
- Goldens (battle, run, art) stay byte-identical.
- The hub is always shown, even with a single playable game (the pattern stays tested).

## Approaches considered

- A. Hub inside the same app, game list in `core` (chosen by the owner): smallest change, one release path.
- B. One app per game with shared packages: multiplies Firebase projects, signing and releases.
- C. Extract the engine first: a large refactor with no second game to validate it.

## Design

- `packages/core/src/games/registry.ts`: the list of games (`id`, `status`, string keys for name and
  tagline), the last-game key and a pure `initialFocus(last)` that returns the stored game if it is
  playable, else the first playable one.
- Layout contract: a sixth `ScreenId`, `hub`, with its own `MIN_BUDGET` row.
- Web: a `hub` router screen is the default page; `?game=kinfall` (and `?mode=battle`, `?seed=`) go
  straight to Kinfall as today. A "Games" HUD button on the Kinfall title returns to the hub.
- Android: a `Hub` route is the new initial route; Play pushes `Title`, so system Back returns to the hub.
- Last game: `kinfall.lastGame` in localStorage (web) or AsyncStorage (Android); unreadable storage
  or an unknown value falls back to the first playable game.
- Version 0.4.0. Tagging and distribution stay owner decisions.

## Left to the builder

Card visuals (reuse the existing pixel frames and creature art), exact `MIN_BUDGET` numbers (measured
with the fit tests), and the wording of the "coming soon" tagline.
