# Browser games platform: engine + first game (creature roguelike) — design

Status: draft for the owner's approval. Working project name: `webgames` (placeholder, not decided).
Language of the repo: English. In-game text ships in Spanish and English.

Legend: **[Owner]** = decided by the owner in conversation. **[My call]** = proposed by the designer, owner may change it.

## 1. Intent and why

The owner wants a website of **original games that run in the browser**, written for the web (not emulation of existing games). The previous attempt, Arcadia (browser emulators + a catalogue of free-licence games), was rejected and deleted: it was about emulating games that already exist. This project is the opposite: **original art and theme**, while *mechanics and ideas* may be borrowed from other games. **[Owner]**

Audience and purpose: a **community, free-to-use site for gamers**. The owner does not want to spend real money to run it, so **all computation happens on the player's device** and the host only serves static files. **[Owner]**

Three genres are wanted, one game each, built one at a time. **[Owner]**
1. Simulators (space, sandbox, arena, battles…).
2. Roguelike with creatures ("Pokémon" and "souls" style).
3. Survival.

**This document covers the shared engine and the first game: the creature roguelike.** **[Owner chose it first]** The other two games get their own design later and must be able to reuse the engine.

"Community" means **no server**: sharing and shared challenges without any backend (option A of the discussion). **[Owner]** Rankings, accounts, comments and real-time multiplayer are explicitly out for now.

## 2. Goals, non-goals, anti-goals

Goals
- A fun, replayable creature-collecting roguelike that is complete from start to finish (a run can be won or lost, and the player wants another).
- Community feel without servers: a **daily run** identical for everyone, **share codes** for runs, **shareable result cards** (text), local codex and unlocks, save export/import.
- A reusable engine so the next two games cost much less than the first.
- Free for players, near-zero running cost, works offline after first load, works on phone and desktop.

Non-goals (for now)
- No server, accounts, global leaderboards, chat, comments, user-generated content hosting, real-time multiplayer.
- No monetisation of any kind (ads, purchases, tracking).
- No emulation and no third-party game assets.

Anti-goals (failure even if it technically works)
- Feeling like a reskin of Pokémon, Slay the Spire or Dark Souls: names, creatures, characters, art, music, UI layouts and exact rule sets must be original. Mechanics are fair game; expression is not. **[Owner allowed borrowing mechanics]**
- Grind: a run should reward decisions, not hours of repetition.
- Unfair randomness: a loss should be explainable by the player's choices.
- A site that needs an operator: no recurring manual work (moderation, support) to keep it alive.

## 3. Constraints

- Static hosting only; target initial download under ~2 MB, each later asset lazily loaded. Must run at a steady frame rate on a mid-range phone.
- Everything the simulation does must be **deterministic**: same seed + same player inputs = same outcome on any browser/device. Needed for daily runs, share codes and replays. No `Math.random`, no wall-clock time, no floating-point-sensitive functions (`sin`, `pow`…) inside the simulation; integer or fixed-point maths and a seeded PRNG.
- Saves live in the browser (IndexedDB/localStorage) and can be exported/imported as text or file. Clearing site data loses them: the UI must say so.
- Only permissively licensed (MIT/BSD/Apache/OFL) dependencies, so the project can stay open source and nothing blocks future monetisation decisions. The project's own code is MIT (**[My call]**, same as the owner's other open projects).
- Accessibility: keyboard, mouse/touch and gamepad; colour is never the only carrier of meaning; honour reduced motion; no flashing effects; text scalable.
- Spanish and English from day one.

## 4. Approaches considered

Engine
- **A. Own small deterministic core in TypeScript + PixiJS for rendering (picked [My call]).** Fixed time step, seeded PRNG, serialisable state, plain-data content. Pros: determinism is by construction, tiny bundle, full control, reusable across genres. Cons: more work than a ready-made engine; we own the bugs.
- B. A full 2D engine such as Phaser. Pros: fast start. Cons: its update loop and state model fight determinism and sharing; larger bundle; coupling.
- C. Godot/Unity web export. Pros: authoring tools. Cons: tens of MB, hard determinism and sharing, heavier on phones, poor fit with "the web app provides the engine".

Game structure
- **A. Node-map expedition, turn-based battles (picked [My call]).** Run = a branching map of encounters across 3 zones ending in a boss each, like a roguelike deck-builder's map. Pros: cheap to build and to balance, very mobile-friendly, ideal for seeds and sharing, little map art. Cons: less "walk around the world" feeling than a Pokémon game.
- B. Free-roaming grid dungeon with real-time or turn-based combat (Mystery-Dungeon style). Pros: stronger exploration feel. Cons: needs level generation, pathing, much more art and tuning; far harder to keep deterministic and shareable.
- C. Open overworld with towns (classic creature-collector). Pros: closest to the inspiration. Cons: not a roguelike, and by far the most content.

**Owner's answer: both.** The owner wants the node-map expedition **and** a walkable world. Resolution (**[My call]**): they are two **modes of the same game** sharing one battle system, one content set, one codex and one engine. Build order: **Expedition mode (node map) first** and ship it; **Wander mode (walkable world) second**, as a later milestone (see sections 5 and 9). Both modes must be possible without rewriting the engine, which is why movement and battles stay discrete and deterministic.

## 5. The game (v1) — all **[My call]** unless marked

Working title: *(none yet)*. Creatures are a made-up kind, called **"echoes"** in this document for now (placeholder).

Fantasy: you are an expedition leader walking into a haunted wilderness, befriending the echoes of fallen creatures and fighting through three zones to reach and defeat the final guardian.

Modes (the owner asked for both versions of exploration) **[Owner: both]**
- **Expedition** (ships first): the node-map run described below.
- **Wander** (second milestone, designed now so the engine does not block it): a procedurally generated **tile-based world** per seed, explored one step at a time (turn-based movement, so a step is a deterministic tick). It has regions with different enemy pools, wandering creatures to meet and recruit, shrines and caches on the map, and a boss in each region. It reuses the battle system, species, moves, items, relics, codex, souls and share-code/daily mechanics unchanged. Differences: free route choice, a world map that fills in as you go, and a longer run (about 45–60 minutes). Same permadeath rules and the same save-on-every-step guarantee.
- Both modes share **one meta profile** (codex, unlocks, souls banked). A seed code says which mode it is for.
- Cost warning: Wander roughly doubles map art, generation, UI and tuning work. That is why it is a separate milestone, not part of v1 of Expedition.

Souls flavour **[Owner: both]**
- **Permanent loss**: a defeated echo is gone for the run and leaves a soul.
- **Pattern bosses**: bosses and elites have **telegraphed multi-turn attack patterns** (the next move is shown, or a charge-up is visible) that can be learned over attempts; they are designed to be beatable by reading the pattern, not by luck.

Run structure
- A run has a **seed**. The seed fixes the map, encounter contents, loot and every random roll.
- 3 zones. Each zone is a branching map of about 6–7 nodes with a boss at the end: ~20 nodes per run, 20–30 minutes.
- Node types: **wild encounter** (fight, may recruit), **elite** (harder, better reward), **shrine** (heal, evolve, swap or remove a move), **cache** (item or relic), **mystery** (a small choice with a risk), **boss**.
- The party holds up to **3 echoes**. A defeated echo is lost for the run and leaves a **soul** (a currency) the player can spend at shrines. If the whole party falls, the run ends. This is the "souls" flavour: losses hurt, dying teaches. **No** stamina bars or real-time dodging in v1.

Battles (turn-based)
- 1 active echo vs 1 enemy; the player may swap (costs the turn).
- Each echo: 5 stats (health, power, guard, speed, focus), 1–2 **elements**, up to 4 moves.
- 5 elements with a small cycle of strengths/weaknesses (original theme, e.g. ember, tide, thorn, gale, umbra — names provisional). A type chart is data, not code.
- Moves: damage, status (a short list of 6–8), heal, buff/debuff, and a **focus** resource that limits strong moves. Enemy intent is **shown one turn ahead** for elites and bosses (the "souls" telegraph): the player can read and answer it.
- Order by speed; ties broken by the seeded PRNG.
- Recruiting: after beating a wild echo you may recruit it into a free slot or replace a party member.
- Evolution: at shrines, spending souls; each species has 0–1 evolutions.

Content for v1 (a size cap, not a floor)
- ~24 species (+ their evolutions), ~60 moves, ~8 statuses, ~15 items, ~15 relics (passive run modifiers), 3 zones with distinct enemy pools, 3 bosses plus 1 final guardian.
- All content is **data files** (JSON/TS objects) validated by schema; the engine has no species-specific code.

Meta progression (local only)
- **Codex**: species seen/recruited, moves, relics, runs won; unlocks new starting parties and a few new species pools.
- No power creep that makes runs trivial: unlocks add **variety**, not raw strength.

Community without a server
- **Daily run**: seed = hash of the UTC date + game id. Same map and rolls for everyone, no backend needed.
- **Share code**: a short text that encodes (game version, seed, optional modifiers). Pasting it starts the same run. A longer code can also carry the move log for **replays**.
- **Result card**: a compact text/emoji summary of a finished run (zone reached, party, score) to paste anywhere.
- **Save export/import** as text or file.
- Scores are **not verifiable** without a server; the site says so and treats them as bragging, not ranking. Replays (seed + input log) let anyone re-simulate a claimed result locally to check it.

## 6. Engine design

Layers (each testable on its own)
1. **Sim core** (pure TypeScript, no DOM, no time, no Math.random): state, PRNG, fixed-step loop, event log, serialisation, rules for battle and run. Same code runs in tests and in the browser.
2. **Content**: schemas + data + validators.
3. **Presentation**: PixiJS scenes (map, battle, menus), tweened animations driven by the event log, never feeding back into the sim.
4. **Platform services**: input (keyboard/touch/gamepad mapped to actions), audio, storage, i18n, PWA/offline, share-code codec.

Determinism is enforced by tests: golden runs (fixed seed + input log → exact final state hash) run in CI and in at least two browsers' JS engines (Node/V8 plus a second engine).

Reuse for the next games: layers 1 (generic parts: PRNG, loop, serialisation, event log), 3 (scene/animation helpers) and 4 are game-agnostic; rules and content are per game.

## 7. Art and audio **[My call]**

- **Art**: original, generated in code so there are no third-party rights: a pixel-art style produced by a **parametric creature generator** (body templates × limbs × patterns × element palettes), fixed per species by data so each species always looks the same. Hand-tuned templates keep species distinct; a species may override with a hand-drawn sprite later. Backgrounds and UI use a small set of tiles/shapes and a limited palette.
- **Audio**: procedural chiptune and sound effects through WebAudio (own synth), no sampled assets. Mute/volume controls; audio off by default until the first interaction.
- Risk: generated art can look samey. Mitigation: keep the template set rich, review early with the owner, and keep the sprite format open so hand-made art can replace it.

## 8. Platform, UX and quality **[My call]**

- Responsive, playable one-handed on a phone in portrait; keyboard and gamepad on desktop.
- PWA: installable and offline after first load.
- Colour-blind-safe element icons (shape + colour), reduced-motion mode, text size setting.
- Light/dark UI chrome following the system; game art uses its own palette.
- Tests: unit tests for the sim, content validators, golden-run determinism tests, share-code round-trips; browser tests for the main flow (start run → battle → recruit → shrine → end), accessibility audit (axe) on the menus, es/en string parity, mobile viewport checks.

## 9. Suggested phases (the plan may refine) — **[My call]**

1. Engine core + one battle on screen (PRNG, loop, serialisation, battle rules, generated creatures, input, determinism tests).
2. Run loop: map, node types, recruit/evolve/shrines, win/lose, local saves.
3. Content pass to the v1 size cap and balance with simulated runs (bots playing thousands of seeds to find broken combos).
4. Community features: daily run, share codes, result cards, replays, export/import.
5. Polish: audio, accessibility, offline, performance, es/en review, a public build of **Expedition mode**. This is the first public release.
6. **Wander mode** (second milestone, after Expedition is released): tile world generation, step-based movement and exploration UI, region content, world map, balance with bots, then release it as an update. It needs its own short design pass before planning (map generation approach and art needs), but it reuses everything else.

## 10. Left to the builder

Project naming and branding (the name is open), exact stat formulas and balance numbers, the final element names and species roster, the share-code format and compression, folder layout and tooling, how the bots in phase 3 work, hosting provider choice (static hosting only), CI details.

## 11. Decisions added after the builder check — all **[My call]**

1. **Platform**: web only (desktop and mobile browsers, installable as a PWA). No store packaging or native wrappers in v1; revisit only if the owner asks.
2. **Determinism check**: golden-run tests run on Node/V8 and on Firefox (SpiderMonkey) and WebKit (JavaScriptCore) through Playwright in CI. A mismatch in any engine fails the build.
3. **Difficulty and score**: one difficulty level in v1, no modifiers or ascension levels (so share codes carry only game version + seed in v1; the field for modifiers is reserved). Balance target for the phase-3 bots: a competent bot wins 15–25% of seeds, a random bot almost never. Score = zones cleared, bosses beaten, remaining party health and souls banked, as one transparent formula shown on the result card.
4. **Runs and saves**: the run is **auto-saved at every node and every turn boundary** and resumes after an interruption. No undo. A seed can be restarted. The **daily run allows unlimited attempts**; the result card prints the attempt number so claims stay honest ("bragging, not ranking").
5. **Originality guardrails**: no 18-type chart or anything that maps one-to-one onto Pokémon's types; the element cycle and statuses are our own. The recruit-after-win loop and 3-slot party are common genre tools and stay, but creature design, names, move names, UI layout and the map screen must not mimic any specific game. A short originality checklist is part of the content review.
6. **Share-code versioning**: each code carries the game version. A code from another **major** version is rejected with a clear message (no old builds are kept); replays are valid only within the version that recorded them. Content and rules are versioned together.
7. **Name**: stays a placeholder (`webgames`, "echoes") until the owner decides; renaming is a find-and-replace on data, not code.

## 12. Owner's answers to the open questions **[Owner]**

1. Exploration: **both** the node-map expedition and a walkable world (resolved as two modes; Expedition first, Wander second; see sections 4 and 5).
2. "Souls" flavour: **both** permanent creature loss with souls, and telegraphed pattern bosses.
3. Art: **code-generated pixel art is acceptable at launch**, with a swappable sprite format so hand-made art can replace it later.

No open questions remain for the owner. Anything not listed in section 10 is decided in this document.
