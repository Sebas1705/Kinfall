# Phase 3 handoff

Written at the end of phase 2 (run loop), after the final whole-branch review. It records what phase 3 inherits: balance first, then a few engine and save changes, then the deferred minors.

## 1. Balance is the first task

Current state: the run bots win 0 of 900 runs (300 seeds x 3 starters) and rarely leave zone 0. A search with perfect information wins about 2 of 30. The game is effectively unwinnable.

Diagnosis:

- There are no neutral matchups: every element pair is x2 or x0.5, and with STAB the damage race is roughly 4x.
- The zone-0 wild pool contains each starter's counter, and the wild species is not telegraphed on the map.
- The start party is 1 creature, and losing it ends the run.
- Nothing grows with the run, while enemy HP rises 8% per layer.
- Bosses and elites outscale everything: the zone-0 boss cindermaw has 220% HP, and the zone-1 boss Thorn Sovereign heals about 55 HP per turn through mending_moss.

Levers to try (tune with the bots and the perfect-information search as the yardstick):

- Effectiveness 200/50 -> 150/67, or add neutral pairs.
- Start with a party of 2, or give a free heal after each win.
- Wild `hpPercent` below 100, or show the wild species on the map.
- Boss `hpPercent` 220/260/320 -> about 150/180/220, and drop mending_moss from the Thorn Sovereign script.
- `evolveCost` 3 -> 2, or +1 soul per win.

## 2. Engine turn cap

Add a constant, not stored in state (for example `MAX_TURNS = 60`). Reaching it ends the battle with winner `'enemy'`, like the mutual-wipe rule. One exit check in `applyAction`, plus a turn bound in `validateState`. Phase-1 goldens are unaffected because every golden battle is far below 60 turns. Then remove the bot's `HEAL_UNTIL_TURN` workaround (`src/sim/run/bot.ts`). Until then the battle screen's Abandon run button is the only way out of an endless fight.

## 3. Saves

- Add a `contentVersion` to the save envelope and an "outdated save" message distinct from "corrupt". Balance changes will invalidate saves.
- Add `path` (cleared nodes) to `RunState` with save versioning, to fix the cleared-path-after-reload limitation (the map trail is lost on reload).

## 4. The golden rule has to change

"Phase-1 golden hashes never change" cannot survive balance work. Regenerating goldens under review is acceptable: `npm run golden:update` and `npm run golden:runs`. Say so in the PR that does it.

Tests that pin content numbers and will need edits:

- `tests/content/run-content.test.ts`
- `tests/sim/run/encounters.test.ts`
- `tests/content/content.test.ts`
- some score, events and run tests
- both golden JSON files

The e2e full-run spec (60 s timeout, 400-action bound) may need adjusting for longer runs.

## 5. Other deferred minors

Phase 3:

- "Party member {n}" log lines: pass the party into the log context.
- Run log is below the fold on phones.
- `pickNode` rejects silently (no log, no message).
- Battle-end run events are lost if the page reloads between the final turn and `onEnd`.
- Two tabs overwrite one save slot.
- Recruit replace has no confirmation (focus starts on Let it go).
- `elements.ts` comment does not match the code (diff 1 and 3).

Phase 3 or 5:

- The gamepad is inert on the title, map and event screens.
