# Engine core and battle slice (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic TypeScript engine core plus one playable creature battle in the browser (keyboard, touch, gamepad; es/en), proven deterministic across Node, Firefox and WebKit.

**Architecture:** A pure simulation layer (no DOM, no time, no `Math.random`) holds all rules; content is plain data validated by a schema; presentation is a PixiJS canvas driven by the simulation's event log plus DOM menus (so menus are real accessible buttons). The sim never reads anything the presentation produces.

**Tech Stack:** TypeScript (strict), Vite, Vitest, PixiJS 8, Playwright (+ `@axe-core/playwright`), GitHub Actions, Node 24, npm.

**Spec:** `docs/superpowers/specs/2026-11-14-creature-roguelike-design.md` (read it first; sections 3, 5, 6, 8 and 11 bind this plan).

This is **plan 1 of 5**, matching spec section 9. It covers phase 1 only. Phases 2–5 (run loop, content pass with bots, community features, polish and release) get their own plans after this one lands; Wander mode needs its own design pass first.

## Global Constraints

- Simulation code under `src/sim/` and `src/content/` must not use `Math.random`, `Date`, `performance.now`, `Math.sin/cos/pow/exp/log`, or any floating-point maths whose result could differ between engines: integers only, seeded PRNG only (spec §3).
- Same seed + same player inputs = same outcome on any browser or device (spec §3, §6).
- Initial download under ~2 MB; later assets lazily loaded (spec §3).
- Only permissively licensed dependencies (MIT/BSD/Apache/OFL); project code is MIT (spec §3).
- Spanish and English from day one; every UI string exists in both (spec §3, §8).
- Keyboard, mouse/touch and gamepad; colour is never the only carrier of meaning; honour reduced motion; no flashing effects; scalable text (spec §3).
- Original names, art and layouts; no 18-type chart; five elements `ember, thorn, tide, gale, umbra` (provisional names; this is the cycle order) in one data-driven cycle (spec §5, §11.5).
- Web only; no server, accounts or tracking (spec §1, §2, §11.1).
- No `git push` and no deployment in this plan; the owner decides when to create the remote.

## Review Focus

1. Seeds that are empty, very long, or full of Unicode must not throw and must hash identically every time (Task 2).
2. Illegal actions (move index out of range, swap to a fainted or active creature, acting after the battle ended, not enough focus) must be rejected with a `rejected` event and the state unchanged, never throw or corrupt state (Task 4).
3. A serialised state that is corrupted, truncated or from another version must be rejected with a clear error message, never crash the page (Task 6).
4. Key repeat, held keys, window blur mid-press and simultaneous keyboard + touch + gamepad must never produce a double action (Task 8).
5. A 320 px wide screen, long Spanish strings, large text, `prefers-reduced-motion`, and a hidden/backgrounded tab mid-animation must leave the battle playable and the sim result unchanged (Tasks 10, 11).

## File Structure

```
webgames/
  package.json  tsconfig.json  vite.config.ts  playwright.config.ts  index.html
  .gitignore  LICENSE  README.md  .github/workflows/ci.yml
  scripts/check-size.mjs
  src/
    sim/      rng.ts  state.ts  battle.ts  ai.ts  codec.ts  golden.ts
    content/  schema.ts  elements.ts  species.ts  moves.ts  index.ts
    art/      palette.ts  creatureGen.ts  elementIcon.ts
    platform/ input.ts  i18n.ts  strings.ts
    view/     battleView.ts  menu.ts
    main.ts   styles.css
  tests/      (unit, mirrors src/) and tests/e2e/ and tests/golden/
```

---

### Task 1: Project scaffold, CI and licence

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.gitignore`, `LICENSE` (MIT, holder `Sebas1705`, year 2026), `README.md`, `.github/workflows/ci.yml`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (Vitest), `typecheck` (`tsc --noEmit`), `test:e2e` (Playwright), `size` (`node scripts/check-size.mjs`). `tsconfig` strict with `noUncheckedIndexedAccess`.

- [ ] **Step 1:** Write `tests/smoke.test.ts` with `it('runs the test runner', () => expect(1 + 1).toBe(2))`.
- [ ] **Step 2:** Run `npx vitest run` before creating `package.json`; expected: fails (no project yet).
- [ ] **Step 3:** `git init -b main`; create the files above by hand (no scaffolding generator). Dependencies: `pixi.js`; dev: `vite`, `typescript`, `vitest`, `@playwright/test`, `@axe-core/playwright`. README states the placeholder name, the MIT licence and links the spec. CI runs on push to `main` and on PRs: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. (E2E jobs are added in Task 11.)
- [ ] **Step 4:** Run `npm run typecheck && npm test && npm run build`; expected: all pass.
- [ ] **Step 5:** Commit `chore: scaffold project, MIT licence and CI`.

### Task 2: Seeded PRNG and determinism guard

**Files:**
- Create: `src/sim/rng.ts`, `tests/sim/rng.test.ts`, `tests/sim/determinism-guard.test.ts`

**Interfaces:**
- Produces:
  - `type RngState = [number, number, number, number]`
  - `interface Rng { next32(): number; nextInt(maxExclusive: number): number; fork(label: string): Rng; getState(): RngState }`
  - `createRng(seed: string | number): Rng`; `restoreRng(state: RngState): Rng`; `hashString(s: string): number` (32-bit, deterministic, FNV-1a over UTF-16 code units).

- [ ] **Step 1: Write failing tests** in `rng.test.ts`:
  - `same seed gives same sequence`: two `createRng('abc')`, first 100 `next32()` equal.
  - `different seeds differ`: `createRng('a')` vs `createRng('b')` first 10 values differ.
  - `nextInt stays in range and is unbiased enough`: 10,000 draws of `nextInt(6)` all in 0..5 and every face seen at least 1,400 times.
  - `fork is stable and independent`: `fork('x')` sequence equals a second `fork('x')` from a fresh rng with the same seed, and drawing from the fork does not change the parent's next value.
  - `getState/restoreRng round-trips`: after 7 draws, `restoreRng(r.getState())` yields the same next 5 values as `r`.
  - Review-focus 1: `createRng('')`, `createRng('x'.repeat(100000))` and `createRng('🦊ñ日本')` do not throw, and calling each twice gives identical first values. `nextInt(0)` and `nextInt(-1)` throw `RangeError`.
  - Golden: `createRng('golden').next32()` first 3 values equal fixed literals recorded from the first passing run (they pin the algorithm forever).
- [ ] **Step 2:** `npx vitest run tests/sim/rng.test.ts`; expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/sim/rng.ts` with sfc32 seeded from four `hashString`-derived words (seed string/number converted with `String(seed)`); `nextInt` uses rejection sampling on `next32()`; `fork(label)` seeds a new rng from `hashString(label)` mixed with the parent's current state without advancing the parent.
- [ ] **Step 4: Write `determinism-guard.test.ts`:** reads every `.ts` file under `src/sim` and `src/content` and fails if the source matches `/Math\.(random|sin|cos|tan|pow|exp|log|sqrt)|Date\.|performance\.now|new Date/`. (Comments are stripped before matching.)
- [ ] **Step 5:** Run `npx vitest run tests/sim`; expected: PASS.
- [ ] **Step 6:** Commit `feat(sim): seeded PRNG and determinism guard`.

### Task 3: Content schema, elements and first data

**Files:**
- Create: `src/content/schema.ts`, `elements.ts`, `species.ts`, `moves.ts`, `index.ts`; `tests/content/content.test.ts`

**Interfaces:**
- Produces:
  - `type ElementId = 'ember' | 'thorn' | 'tide' | 'gale' | 'umbra'`; `ELEMENTS: readonly ElementId[] = ['ember', 'thorn', 'tide', 'gale', 'umbra']` — this exact order defines the cycle (index 0..4).
  - `type StatusId = 'scorch' | 'stun'`.
  - `interface Stats { health: number; power: number; guard: number; speed: number; focus: number }`
  - `interface ArtParams { body: 'blob' | 'tall' | 'wide' | 'serpent'; limbs: 0 | 1 | 2 | 3 | 4; pattern: 'plain' | 'stripes' | 'spots'; eyes: 1 | 2 | 3; key: string }`
  - `interface SpeciesDef { id: string; names: { en: string; es: string }; elements: [ElementId] | [ElementId, ElementId]; base: Stats; moves: string[]; art: ArtParams }`
  - `interface MoveDef { id: string; names: { en: string; es: string }; element: ElementId; kind: 'damage' | 'heal' | 'status'; power: number; focusCost: number; accuracy: number; status?: StatusId; target: 'enemy' | 'self' }`
  - `interface Content { species: SpeciesDef[]; moves: MoveDef[] }`; `const CONTENT: Content`
  - `effectiveness(attacker: ElementId, defender: readonly ElementId[]): number` returning a percent: per defender element, `i = index in ELEMENTS`; attacker index `a`; `(d - a + 5) % 5` is 1 or 3 → 200, 2 or 4 → 50, 0 → 100; dual types multiply (`×a/100` per element).
  - `validateContent(c: Content): string[]` (empty array = valid).

- [ ] **Step 1: Write failing tests:**
  - `effectiveness`: `('ember', ['thorn']) === 200`, `('ember', ['tide']) === 50`, `('ember', ['gale']) === 200`, `('ember', ['umbra']) === 50`, `('ember', ['ember']) === 100`, `('ember', ['thorn', 'gale']) === 400`, `('ember', ['thorn', 'tide']) === 100`; and each element is super-effective against exactly 2 others and resisted by exactly 2 others.
  - `CONTENT is valid`: `validateContent(CONTENT)` equals `[]`.
  - `validator catches errors`: duplicate species id, unknown move id in a species, a move with `accuracy` outside 1..100, a damage move with `power <= 0`, a missing `es` or `en` name, and a species with `base.health <= 0` each yield one message naming the offending id.
  - `content size`: `CONTENT.species.length === 6` and `CONTENT.moves.length === 12` (slice sizes; later plans raise them); every species has 4 moves.
- [ ] **Step 2:** Run `npx vitest run tests/content`; expected: FAIL.
- [ ] **Step 3: Implement** the files. Data: 6 original species covering all five elements (one dual-element), 12 moves (damage moves for each element at power 35–55 with focus cost 0 or 1 for the strong ones, one heal, one `scorch` status move, one `stun` move), stats between 20 and 60. Names are provisional and original; keep `names.en/es` for each.
- [ ] **Step 4:** Run `npx vitest run tests/content`; expected: PASS.
- [ ] **Step 5:** Commit `feat(content): schema, element cycle and first species and moves`.

### Task 4: Battle core

**Files:**
- Create: `src/sim/state.ts`, `src/sim/battle.ts`; `tests/sim/battle.test.ts`

**Interfaces:**
- Consumes: `createRng`, `restoreRng`, `RngState` (Task 2); `Content`, `effectiveness` (Task 3).
- Produces (`state.ts`):
  - `type Side = 'player' | 'enemy'`
  - `interface Combatant { speciesId: string; hp: number; maxHp: number; focus: number; maxFocus: number; status: { id: StatusId; turns: number } | null; fainted: boolean }`
  - `interface TeamSpec { speciesIds: string[] }`
  - `type Action = { type: 'move'; moveIndex: number } | { type: 'swap'; toIndex: number }`
  - `interface BattleState { version: 1; seed: string; rng: RngState; teams: Record<Side, Combatant[]>; active: Record<Side, number>; turn: number; winner: Side | null; intent: { moveIndex: number } | null }`
  - `type BattleEvent = { type: 'turnStart'; turn: number } | { type: 'move'; side: Side; moveId: string; hit: boolean } | { type: 'damage'; side: Side; amount: number; effectiveness: number } | { type: 'heal'; side: Side; amount: number } | { type: 'status'; side: Side; status: StatusId } | { type: 'swap'; side: Side; toIndex: number } | { type: 'fainted'; side: Side } | { type: 'rejected'; reason: 'illegal' | 'ended' | 'focus' } | { type: 'end'; winner: Side }`
- Produces (`battle.ts`):
  - `createBattle(seed: string, player: TeamSpec, enemy: TeamSpec, content: Content): BattleState`
  - `legalActions(state: BattleState, content: Content): Action[]` (for the player side)
  - `applyAction(state: BattleState, action: Action, content: Content): { state: BattleState; events: BattleEvent[] }` — pure: returns a new state, never mutates the input. Resolves one full turn: the player's action and the enemy's action ordered by speed (a swap always goes first; ties broken with `nextInt(2)` from the state's rng), end-of-turn status effects, faint handling (a fainted active creature is replaced by the next living one automatically on the enemy side; on the player side the player must `swap` next turn if any other lives, otherwise the battle ends), and the win check.
  - Pinned rules (integers only): `base = floor(move.power * attacker.power / defender.guard)`; `damage = max(1, floor(base * effectiveness / 100))`; same-element attacker gets `×125/100` before the effectiveness step; a miss occurs when `nextInt(100) >= accuracy`; focus: moves with `focusCost > 0` are illegal unless the user has enough, focus regenerates by 1 per turn up to max; a swap costs the turn; `maxHp = base.health * 4`.
  - Enemy action in this task: first legal move (the AI arrives in Task 5; `intent` stays `null`).

- [ ] **Step 1: Write failing tests:**
  - `damage formula`: with the first ember damage move (power 40), attacker `power 50`, defender thorn `guard 40`, expected damage is `((40*50/40|0) * 125/100 | 0) * 200 / 100` — assert the exact integer the formula yields for the two chosen species and fix it as a literal.
  - `does not mutate input`: deep-freeze the input state (`Object.freeze` recursively), `applyAction` does not throw and the original equals a stored `structuredClone` of itself.
  - `faster creature acts first`: the event order of `move` events matches the speed order for a fixed seed.
  - `win and loss`: a scripted battle where the player always uses its strongest move reaches `winner === 'player'` with a final `end` event; the reverse team ends with `winner === 'enemy'`.
  - `swap`: swapping to a living benched creature changes `active.player`, emits `swap` first, and the enemy still acts.
  - Review-focus 2, each asserting `events` is exactly `[{ type: 'rejected', reason: … }]` and the returned state deep-equals the input: `moveIndex: 9`, `moveIndex: -1`, `swap` to the active index, `swap` to a fainted creature, `swap` out of range, any action after `winner` is set (`'ended'`), a move whose focus cost exceeds current focus (`'focus'`).
  - `legalActions` never includes an action that `applyAction` would reject.
  - `determinism`: running the same scripted battle twice gives deep-equal final states.
- [ ] **Step 2:** `npx vitest run tests/sim/battle.test.ts`; expected: FAIL.
- [ ] **Step 3: Implement** `state.ts` and `battle.ts` per the interfaces; use `structuredClone` on entry and `createRng`/`restoreRng` for randomness, writing the new `rng` state back.
- [ ] **Step 4:** Run `npx vitest run tests/sim`; expected: PASS.
- [ ] **Step 5:** Commit `feat(sim): battle core with pinned damage rules`.

### Task 5: Statuses, enemy AI and telegraphed intent

**Files:**
- Create: `src/sim/ai.ts`; Modify: `src/sim/battle.ts`; Test: `tests/sim/ai.test.ts`, extend `tests/sim/battle.test.ts`

**Interfaces:**
- Consumes: Task 4 types.
- Produces: `chooseEnemyMove(state: BattleState, content: Content): number` (a legal move index, deterministic given the state: highest expected damage `power * effectiveness`, ties broken with `nextInt` on a fork `rng.fork('ai:' + turn)` so the main rng stream is unaffected); `BattleState.intent` is set at the start of every turn to `{ moveIndex }` when the battle is created with `telegraph: true` (new optional parameter `options?: { telegraph?: boolean }` on `createBattle`, stored in state as `telegraph`), and the enemy then executes exactly that move.
- Status rules: `scorch` deals `floor(maxHp / 8)` (minimum 1) at the end of each turn for 3 turns; `stun` makes the afflicted creature skip its next action once; a creature has at most one status; applying a status when one exists is ignored.

- [ ] **Step 1: Write failing tests:**
  - `AI picks the super-effective move` when one exists, for a fixed seed.
  - `AI never picks an illegal move` over 200 random seeds (focus-limited species included).
  - `AI does not disturb the main rng`: the player's accuracy rolls for a scripted battle are identical with and without calling `chooseEnemyMove`.
  - `telegraph is honest`: for 100 seeds with `telegraph: true`, the move the enemy executes equals `state.intent.moveIndex` shown before the player acts.
  - `scorch` ticks for exactly 3 turns with the pinned damage and then clears; `stun` skips exactly one enemy action; a second status on an afflicted creature is ignored.
- [ ] **Step 2:** Run `npx vitest run tests/sim/ai.test.ts`; expected: FAIL.
- [ ] **Step 3: Implement** the AI, the intent computation and the two statuses in `battle.ts`.
- [ ] **Step 4:** Run `npx vitest run tests/sim`; expected: PASS (Task 4 tests still green).
- [ ] **Step 5:** Commit `feat(sim): statuses, enemy AI and telegraphed intent`.

### Task 6: Serialisation, state hash, replay and golden runs

**Files:**
- Create: `src/sim/codec.ts`, `src/sim/golden.ts`, `tests/sim/codec.test.ts`, `tests/golden/battle.golden.json`, `tests/sim/golden.test.ts`

**Interfaces:**
- Consumes: `BattleState`, `Action`, `applyAction`, `createBattle`.
- Produces:
  - `canonicalize(value: unknown): string` (JSON with object keys sorted, no whitespace).
  - `hashState(state: BattleState): string` (FNV-1a 64-bit as 16 hex chars over `canonicalize(state)`, implemented with `BigInt`-free two-word arithmetic so it is identical everywhere).
  - `serializeState(state: BattleState): string` and `deserializeState(text: string): { ok: true; state: BattleState } | { ok: false; error: string }`; the text carries `version` and a checksum; any parse, version or checksum failure returns `{ ok: false, error }` with a human-readable message, never throws.
  - `replayBattle(seed: string, player: TeamSpec, enemy: TeamSpec, actions: Action[], content: Content, options?: { telegraph?: boolean }): { finalHash: string; winner: Side | null }` in `golden.ts`.

- [ ] **Step 1: Write failing tests:**
  - `canonicalize is key-order independent`: `{a:1,b:2}` and `{b:2,a:1}` give the same string.
  - `round-trip`: `deserializeState(serializeState(s))` returns `ok` and a state whose `hashState` equals the original's.
  - Review-focus 3: truncated text, flipped character, `''`, `'{}'`, `'null'`, text with `version: 2`, and a valid text with a tampered `hp` each return `{ ok: false }` with a non-empty `error`; none throws.
  - `hashState` golden literals for two fixed states (recorded from the first passing run).
  - `golden.test.ts`: loads `tests/golden/battle.golden.json` (array of `{ name, seed, player, enemy, telegraph, actions, finalHash, winner }`, at least 3 entries with different seeds, one ending in a loss) and asserts `replayBattle` reproduces each `finalHash` and `winner`. A helper script `npm run golden:update` (Node script, owner-run) regenerates the file; the test never rewrites it.
- [ ] **Step 2:** Run `npx vitest run tests/sim/codec.test.ts tests/sim/golden.test.ts`; expected: FAIL.
- [ ] **Step 3: Implement** the four functions; generate the golden file once with the helper after the tests for codec pass.
- [ ] **Step 4:** Run `npx vitest run`; expected: PASS.
- [ ] **Step 5:** Commit `feat(sim): serialisation, state hash, replay and golden runs`.

### Task 7: Creature art generator and element icons

**Files:**
- Create: `src/art/palette.ts`, `src/art/creatureGen.ts`, `src/art/elementIcon.ts`; `tests/art/art.test.ts`

**Interfaces:**
- Consumes: `SpeciesDef`, `ArtParams`, `ElementId`.
- Produces:
  - `interface PixelGrid { width: number; height: number; pixels: Uint8Array; palette: string[] }` (index 0 = transparent)
  - `elementPalette(element: ElementId): string[]` (5–6 colours per element, original palettes)
  - `generateCreature(species: SpeciesDef): PixelGrid` — 24×24, deterministic from `species.art.key` via `createRng`, vertically mirrored about the centre column, built from `body` shape × `limbs` × `pattern` × `eyes`, coloured with the first element's palette.
  - `elementIcon(element: ElementId): PixelGrid` — 8×8, a distinct shape per element (so colour is never the only cue).

- [ ] **Step 1: Write failing tests:** `generateCreature` twice gives equal `pixels`; symmetry check `pixels[y*24+x] === pixels[y*24+(23-x)]` for all x,y; every pixel index `< palette.length`; at least 30% of cells are non-transparent and no cell on the outer 1-pixel border is set; the 6 species of `CONTENT` produce pairwise different grids; `elementIcon` shapes are pairwise different when all colours are mapped to one value; palettes meet a contrast check: each element's body colour has a luminance contrast of at least 3:1 against both `#0e0e13` and `#f6f6fa` (implement the WCAG luminance formula inside the test).
- [ ] **Step 2:** Run `npx vitest run tests/art`; expected: FAIL.
- [ ] **Step 3: Implement** per the interfaces; `generateCreature` is pure and uses integer coordinates only.
- [ ] **Step 4:** Run `npx vitest run tests/art`; expected: PASS.
- [ ] **Step 5:** Commit `feat(art): parametric creature generator and element icons`.

### Task 8: Input layer

**Files:**
- Create: `src/platform/input.ts`; `tests/platform/input.test.ts`

**Interfaces:**
- Produces:
  - `type GameAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'swap'`
  - `mapKey(e: { code: string; repeat?: boolean }): GameAction | null` (Arrow keys and WASD → directions; `Enter`/`Space`/`KeyZ` → confirm; `Escape`/`Backspace`/`KeyX` → back; `Tab` is never captured; `KeyQ` → swap; `repeat: true` → `null`)
  - `mapGamepad(prev: boolean[], next: boolean[]): GameAction | null` (edge-triggered on the standard layout: d-pad 12–15, A=0 confirm, B=1 back, Y=3 swap; only a press, not a hold, returns an action)
  - `createInput(target: HTMLElement, onAction: (a: GameAction) => void): { dispose(): void }` — wires `keydown`, `blur` (clears pressed state) and gamepad polling through `requestAnimationFrame` (injectable `poll` for tests); on-screen touch buttons are plain `<button data-action="…">` elements inside `target` that call `onAction` on `click`.

- [ ] **Step 1: Write failing tests:** the `mapKey` table above; `repeat: true` returns null (Review-focus 4); gamepad hold of A for 10 frames emits exactly one `confirm`; releasing and pressing again emits a second; `blur` between a press and release emits nothing extra; keyboard `Enter` and a gamepad `A` arriving in the same frame emit one `confirm`, not two (a 50 ms de-duplication window per action, measured with an injected clock); `dispose()` removes all listeners (asserted with spies); clicking a `data-action` button emits that action.
- [ ] **Step 2:** Run `npx vitest run tests/platform/input.test.ts` (jsdom environment for this file via `// @vitest-environment jsdom`; add `jsdom` as a dev dependency); expected: FAIL.
- [ ] **Step 3: Implement** the three exports.
- [ ] **Step 4:** Run the same command; expected: PASS.
- [ ] **Step 5:** Commit `feat(platform): keyboard, gamepad and touch input mapping`.

### Task 9: Internationalisation

**Files:**
- Create: `src/platform/strings.ts`, `src/platform/i18n.ts`; `tests/platform/i18n.test.ts`

**Interfaces:**
- Produces: `type Lang = 'en' | 'es'`; `STRINGS: Record<Lang, Record<StringKey, string>>`; `t(key: StringKey, params?: Record<string, string | number>): string` (`{name}` placeholders); `getLang(): Lang`; `setLang(lang: Lang): void` (persists in `localStorage` inside try/catch, sets `document.documentElement.lang`); `detectLang(): Lang` (saved choice, else `navigator.language` starting with `es`, else `en`); `moveName(move: MoveDef): string` and `speciesName(s: SpeciesDef): string` use the current language.
- Strings needed by Task 10: battle log lines for each `BattleEvent` type, menu labels (Fight, Swap, Back), status names, "Victory", "Defeat", "New battle", effectiveness messages ("It's very effective" / "It's not very effective"), the intent label ("Next: {move}"), settings labels (Language, Reduce motion, Text size), and the permanent-loss reminder ("A creature that falls is lost for this run." — shown in the slice's battle intro).

- [ ] **Step 1: Write failing tests:** `es` and `en` have identical key sets; no value is empty; the same `{placeholders}` appear in both languages for every key; `t('…', { name: 'X' })` replaces all occurrences and leaves unknown placeholders untouched; `detectLang` returns `es` for `'es-ES'`, `en` for `'fr'`; `setLang` survives `localStorage` throwing.
- [ ] **Step 2:** Run `npx vitest run tests/platform/i18n.test.ts`; expected: FAIL.
- [ ] **Step 3: Implement** the files with all strings in both languages.
- [ ] **Step 4:** Run the same command; expected: PASS.
- [ ] **Step 5:** Commit `feat(platform): es/en strings and language handling`.

### Task 10: Battle view and playable page

**Files:**
- Create: `src/view/battleView.ts`, `src/view/menu.ts`, `src/styles.css`; Modify: `index.html`, `src/main.ts`; Test: `tests/view/menu.test.ts`

**Interfaces:**
- Consumes: sim (Tasks 4–6), art (Task 7), input (Task 8), i18n (Task 9).
- Produces:
  - `battleView.ts`: `createBattleView(host: HTMLElement): Promise<BattleView>`; `interface BattleView { render(state: BattleState): void; play(events: BattleEvent[], opts: { reducedMotion: boolean }): Promise<void>; destroy(): void }` — PixiJS canvas showing both active creatures (generated sprites scaled by an integer factor with nearest-neighbour filtering), HP and focus bars (with numbers, not colour only), status and element icons, and the enemy's telegraphed move. `play` animates events in order (lunge, hit flash limited to ≤2 Hz and never full-screen, bar tweens); with `reducedMotion` it applies the final visuals immediately. Animations use elapsed frame time only for visuals; nothing reads back into the sim.
  - `menu.ts`: DOM menu built from `legalActions`: real `<button>`s (min 44×44 CSS px) with names from i18n, focus ring, arrow-key navigation via the input layer, a log region (`role="log"`, `aria-live="polite"`) with the battle text, and a result panel with a "New battle" button. `buildMenu(state, content): MenuModel` is pure so it can be unit-tested.
  - `main.ts`: picks `seed = new URLSearchParams(location.search).get('seed') ?? 'demo'`, creates a 3 v 3 battle with `telegraph: true`, wires input → `applyAction` → `view.play(events)` → re-render; never starts a new action while `play` is pending; reduced motion defaults from `matchMedia('(prefers-reduced-motion: reduce)')` with a visible toggle; language toggle; text-size setting (80–150%) stored locally.

- [ ] **Step 1: Write failing tests** for `buildMenu` (pure): lists one entry per legal action with the right i18n label and `disabled` for moves lacking focus; ordering is stable (moves first, then swaps); the text for the enemy intent matches the telegraphed move in both languages; the long Spanish names do not exceed 24 characters (checked on the data) so they fit a 320 px layout.
- [ ] **Step 2:** Run `npx vitest run tests/view`; expected: FAIL.
- [ ] **Step 3: Implement** `menu.ts` first, then `battleView.ts`, `styles.css`, `index.html` and `main.ts`. CSS uses custom properties for colours, supports `prefers-color-scheme`, scales text with the user setting, and lays out for widths from 320 px up.
- [ ] **Step 4:** Run `npx vitest run` and `npm run build`; expected: PASS and a successful build. Then `npm run dev` and play one full battle by hand with the keyboard, record in the commit message what was seen.
- [ ] **Step 5:** Commit `feat(view): playable battle with PixiJS scene and DOM menus`.

### Task 11: End-to-end, cross-engine determinism, budget and accessibility

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/battle.spec.ts`, `tests/e2e/determinism.spec.ts`, `tests/e2e/a11y.spec.ts`, `scripts/check-size.mjs`; Modify: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Produces: Playwright projects `chromium`, `firefox`, `webkit` (desktop) plus a `mobile` project (Chromium, 320×640, touch); a `webServer` that runs `npm run dev`; a CI job `e2e` that installs browsers with `npx playwright install --with-deps` and runs `npm run test:e2e`; `npm run size` exits non-zero when the gzipped initial JS+CSS of `dist/` exceeds 2,000,000 bytes.

- [ ] **Step 1: Write the specs (they fail until configured):**
  - `determinism.spec.ts`: for every entry of `tests/golden/battle.golden.json`, `page.evaluate(async (e) => (await import('/src/sim/golden.ts')).replayBattle(...))` returns exactly the stored `finalHash`, on all three desktop engines. A mismatch in any engine fails (spec §11.2).
  - `battle.spec.ts`: open `/?seed=e2e` and play to a result using only the keyboard (focus the first menu button, `Enter` on the first enabled action each turn, swap when required) until the result panel shows "Victory" or "Defeat"; assert a result is reached within 60 turns, then press "New battle" and assert the log is cleared. A second test plays the same seed twice via different input routes (keyboard vs clicking the buttons) and asserts the same final log text. A third test emulates `prefers-reduced-motion: reduce` and asserts no animation is pending when `play` resolves (the canvas is idle). A fourth hides the tab (`page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))` plus `Object.defineProperty(document, 'hidden', …)`) mid-battle and asserts the final result equals the foreground run (Review-focus 5).
  - `a11y.spec.ts`: with `@axe-core/playwright`, `wcag2a/wcag2aa/wcag21aa/wcag22aa/best-practice` produce no violations on the battle page in light and dark colour schemes, in `en` and `es`, at 320 px and 1000 px, with text size 150%; and no horizontal overflow and no interactive element smaller than 44×44 CSS px at 320 px.
- [ ] **Step 2:** Run `npx playwright test`; expected: FAIL until the config and server exist.
- [ ] **Step 3: Implement** the config, `check-size.mjs` (build, gzip every JS/CSS file referenced by `dist/index.html`, sum, compare), and the CI `e2e` job; add a `size` step to the existing CI job after `build`.
- [ ] **Step 4:** Run `npx playwright test && npm run build && npm run size`; expected: PASS and size reported.
- [ ] **Step 5:** Update `README.md` with how to run, test and play, and the phase-1 status. Commit `test: end-to-end, cross-engine determinism, size budget and accessibility`.

---

## Self-review

- **Spec coverage:** §3 determinism → Tasks 2, 6, 11; permissive licences and MIT → Task 1; es/en → Task 9; accessibility, reduced motion, colour-not-only → Tasks 7, 10, 11; size budget → Task 11; §5 elements, battle rules, focus, statuses, telegraph, permanent loss message → Tasks 3–5, 9, 10; §6 layers → file structure and Tasks 2–10; §6 cross-engine golden runs → Tasks 6, 11; §7 generated art and element icons → Task 7; §11.2 determinism engines → Task 11; §11.4 and later phases are intentionally outside plan 1. Out of this plan on purpose: map/run loop, recruit/evolve/shrines, items/relics, meta progression, daily run, share codes, PWA/offline, audio, Wander mode (plans 2–5).
- **Step scan:** every step names its file, command or assertions; the only open implementation choices (sprite shapes, palettes, species names and stats within stated ranges) are inside tests that pin their observable properties.
- **Type consistency:** `Rng`, `RngState`, `BattleState`, `Action`, `BattleEvent`, `TeamSpec`, `Content`, `SpeciesDef`, `MoveDef`, `PixelGrid`, `GameAction`, `Lang`, `StringKey` are defined once and used with the same names later; `createBattle` gains `options?: { telegraph?: boolean }` in Task 5, and Tasks 6, 10 and 11 call it that way.
- **Review focus:** each of the five lines has a test in the owning task (2, 4, 6, 8, and 10/11).
- **Proportion:** about 3× the spec's length, mostly tables of interfaces and test lists; no function bodies are written out.
