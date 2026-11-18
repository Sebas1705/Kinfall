import { describe, expect, it, jest } from '@jest/globals';
import { CONTENT } from '@webgames/core/content';
import { setLang } from '@webgames/core/platform/i18n';
import { hashRun, serializeRun } from '@webgames/core/sim/run/codec';
import { availableNodes, legalRunActions } from '@webgames/core/sim/run/run';
import type { RunPhase, RunState } from '@webgames/core/sim/run/types';

import { createRunSession, phaseHeading, RUN_LOG_MAX, runLogContext, runLogLines, runViewOf } from '../../src/run/session';
import { firstNode, freshRun, makeSession, memoryStorage, RUN_KEY, STARTER } from '../../test-support/runFixtures';

const SEED = 'TESTSEED';

/** A locked node of the current map (not available), for a guaranteed rejection. */
function lockedNode(run: RunState): string {
  const open = new Set(availableNodes(run).map((n) => n.id));
  const node = run.maps[run.zone]!.layers.flat().find((n) => !open.has(n.id));
  if (!node) throw new Error('no locked node');
  return node.id;
}

describe('run session: start and autosave', () => {
  it('starts on the map, keeps the seed for the title and saves exactly once', async () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    expect(session.getSnapshot().titleSeed).toBe('FRESH1');
    session.start(SEED, STARTER);
    const snap = session.getSnapshot();
    expect(snap.view).toBe('map');
    expect(snap.run?.seed).toBe(SEED);
    expect(snap.titleSeed).toBe(SEED);
    expect(hashRun(snap.run!)).toBe(hashRun(freshRun(SEED)));
    await session.whenIdle();
    expect(storage.writes).toHaveLength(1);
    expect(storage.data.get(RUN_KEY)).toBe(serializeRun(freshRun(SEED)));
  });

  it('saves after every applied action, the stored run being the latest state', async () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    const node = firstNode(session.getSnapshot().run!);
    expect(session.pickNode(node).ok).toBe(true);
    expect(session.getSnapshot().trail).toEqual([node]);
    expect(session.getSnapshot().view).not.toBe('map');
    let applied = 1;
    // Keep playing with the first legal action until the run returns to the map or ends.
    for (let i = 0; i < 200 && session.getSnapshot().view !== 'map' && session.getSnapshot().view !== 'end'; i++) {
      const action = legalRunActions(session.getSnapshot().run!, CONTENT)[0]!;
      expect(session.act(action).ok).toBe(true);
      applied++;
    }
    await session.whenIdle();
    expect(applied).toBeGreaterThan(1);
    expect(storage.writes).toHaveLength(1 + applied);
    expect(storage.data.get(RUN_KEY)).toBe(serializeRun(session.getSnapshot().run!));
  });

  it('logs the lines of each action, marks only the new ones fresh and caps the log', () => {
    setLang('en');
    const session = makeSession(memoryStorage());
    session.start(SEED, STARTER);
    expect(session.getSnapshot().log).toEqual([]);
    session.pickNode(firstNode(session.getSnapshot().run!));
    const snap = session.getSnapshot();
    const lines = runLogLines(snap.log, runLogContext(CONTENT, snap.run));
    expect(lines[0]).toMatch(/^You head to: .+\.$/);
    expect(snap.logFresh).toBe(lines.length);
    expect(RUN_LOG_MAX).toBe(60);
  });

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const session = makeSession(memoryStorage());
    const listener = jest.fn();
    const off = session.subscribe(listener);
    session.start(SEED, STARTER);
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    off();
    session.pickNode(firstNode(session.getSnapshot().run!));
    expect(listener.mock.calls.length).toBe(calls);
  });
});

describe('run session: rejected actions', () => {
  it('keeps the previous state, saves nothing and warns', async () => {
    const storage = memoryStorage();
    const warn = jest.fn();
    const session = makeSession(storage, { warn });
    session.start(SEED, STARTER);
    await session.whenIdle();
    const before = session.getSnapshot();
    const result = session.pickNode(lockedNode(before.run!));
    expect(result).toEqual({ ok: false, reason: 'illegal' });
    expect(session.getSnapshot()).toBe(before);
    await session.whenIdle();
    expect(storage.writes).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a phase-wrong action without touching the state', () => {
    const session = makeSession(memoryStorage());
    session.start(SEED, STARTER);
    const before = session.getSnapshot();
    expect(session.act({ type: 'cache' }).ok).toBe(false);
    expect(session.getSnapshot()).toBe(before);
  });

  it('does nothing without a run', () => {
    const session = makeSession(memoryStorage());
    expect(session.pickNode('z0-l0-c0')).toEqual({ ok: false, reason: 'no run' });
  });
});

describe('run session: save failures', () => {
  it('warns once per failure streak, hides after a good save and warns again on a new streak', async () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    storage.failNext = [new Error('disk full.'), new Error('disk full')];
    session.start(SEED, STARTER); // fails
    await session.whenIdle();
    expect(session.getSnapshot().saveWarning).toEqual({ error: 'disk full.' });
    const shown = session.getSnapshot().saveWarning;

    session.dismissSaveWarning();
    expect(session.getSnapshot().saveWarning).toBeNull();
    const run = session.getSnapshot().run!;
    session.pickNode(firstNode(run)); // fails again: same streak, stays hidden
    await session.whenIdle();
    expect(session.getSnapshot().saveWarning).toBeNull();
    expect(session.getSnapshot().run).not.toBe(run); // play went on

    session.act(legalRunActions(session.getSnapshot().run!, CONTENT)[0]!); // succeeds: streak over
    await session.whenIdle();
    expect(session.getSnapshot().saveWarning).toBeNull();
    expect(shown).not.toBeNull();

    storage.failNext = [new Error('quota')];
    session.act(legalRunActions(session.getSnapshot().run!, CONTENT)[0]!);
    await session.whenIdle();
    expect(session.getSnapshot().saveWarning).toEqual({ error: 'quota' });
  });

  it('hides a shown warning after the next successful save', async () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    storage.failNext = [new Error('busy')];
    session.start(SEED, STARTER);
    await session.whenIdle();
    expect(session.getSnapshot().saveWarning).not.toBeNull();
    session.pickNode(firstNode(session.getSnapshot().run!));
    await session.whenIdle();
    expect(session.getSnapshot().saveWarning).toBeNull();
  });

  it('reports a missing storage as a failed save but keeps playing', async () => {
    const session = makeSession(null);
    session.start(SEED, STARTER);
    await session.whenIdle();
    expect(session.getSnapshot().saveWarning?.error).toBe('Storage is not available.');
    expect(session.pickNode(firstNode(session.getSnapshot().run!)).ok).toBe(true);
  });
});

describe('run session: write ordering', () => {
  it('never overlaps writes and lands them in action order', async () => {
    const storage = memoryStorage();
    storage.hold = true;
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    const states = [session.getSnapshot().run!];
    session.pickNode(firstNode(states[0]!));
    states.push(session.getSnapshot().run!);
    session.act(legalRunActions(session.getSnapshot().run!, CONTENT)[0]!);
    states.push(session.getSnapshot().run!);
    // Release the writes one by one; each release lets exactly the next one start.
    for (let i = 0; i < 10 && storage.writes.length < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      storage.release();
    }
    storage.hold = false;
    storage.release();
    await session.whenIdle();
    expect(storage.maxInFlight).toBe(1);
    expect(storage.writes).toEqual(states.map(serializeRun));
    expect(storage.data.get(RUN_KEY)).toBe(serializeRun(states[2]!));
  });

  it('an abandon right after an action still ends with no save (clear runs last)', async () => {
    const storage = memoryStorage();
    storage.hold = true;
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    session.pickNode(firstNode(session.getSnapshot().run!));
    const done = session.abandon();
    storage.hold = false;
    for (let i = 0; i < 10; i++) {
      storage.release();
      await new Promise((r) => setTimeout(r, 0));
    }
    await done;
    expect(storage.writes).toHaveLength(2);
    expect(storage.data.has(RUN_KEY)).toBe(false);
    expect(storage.maxInFlight).toBe(1);
  });

  it('keeps the write queue alive when a custom storage rejects instead of reporting', async () => {
    const saved: RunState[] = [];
    let calls = 0;
    const warn = jest.fn();
    const session = createRunSession({
      content: CONTENT,
      storage: {
        // Breaks the AsyncRunStorage contract (it must never reject) on the first save only.
        save: async (run) => {
          if (calls++ === 0) throw new Error('broken storage');
          saved.push(run);
          return { ok: true };
        },
        load: async () => ({ kind: 'none' }),
        clear: async () => {},
      },
      randomSeed: () => 'FRESH1',
      logger: { warn },
    });
    session.start(SEED, STARTER);
    session.pickNode(firstNode(session.getSnapshot().run!));
    await session.whenIdle();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe('run save failed unexpectedly');
    // The next write still ran, with the latest state.
    expect(saved).toEqual([session.getSnapshot().run]);
  });

  it('ignores the outcome of saves of an abandoned run (no stale warning)', async () => {
    const storage = memoryStorage();
    storage.hold = true;
    const session = makeSession(storage);
    storage.failNext = [new Error('late failure')];
    session.start(SEED, STARTER);
    const done = session.abandon();
    storage.hold = false;
    storage.release();
    await done;
    expect(session.getSnapshot().saveWarning).toBeNull();
  });
});

describe('run session: abandon, discard and resume', () => {
  it('abandon drops the run, deletes the save and gives the title a fresh seed', async () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    session.pickNode(firstNode(session.getSnapshot().run!));
    await session.abandon();
    const snap = session.getSnapshot();
    expect(snap.run).toBeNull();
    expect(snap.view).toBeNull();
    expect(snap.trail).toEqual([]);
    expect(snap.log).toEqual([]);
    expect(snap.titleSeed).toBe('FRESH2');
    expect(snap.saved).toEqual({ kind: 'none' });
    expect(storage.removes).toBe(1);
    expect(storage.data.has(RUN_KEY)).toBe(false);
  });

  it('resumes an ok save into the same state and phase, with an empty trail and log', async () => {
    const storage = memoryStorage();
    const first = makeSession(storage);
    first.start(SEED, STARTER);
    first.pickNode(firstNode(first.getSnapshot().run!));
    await first.whenIdle();
    const saved = first.getSnapshot().run!;

    const second = makeSession(storage);
    expect(await second.resume()).toBe(true);
    const snap = second.getSnapshot();
    expect(hashRun(snap.run!)).toBe(hashRun(saved));
    expect(snap.view).toBe(runViewOf(saved.phase));
    expect(snap.view).not.toBe('map');
    expect(snap.trail).toEqual([]);
    expect(snap.log).toEqual([]);
    expect(snap.saved?.kind).toBe('ok');
    await second.whenIdle();
    expect(storage.writes).toHaveLength(2); // resuming writes nothing
  });

  it('does not resume a corrupt save, reports it and never deletes it', async () => {
    const damaged = serializeRun(freshRun()).replace('"zone":', '"zone":9');
    const storage = memoryStorage({ [RUN_KEY]: damaged });
    const session = makeSession(storage);
    expect(await session.resume()).toBe(false);
    expect(session.getSnapshot().run).toBeNull();
    expect(session.getSnapshot().saved?.kind).toBe('corrupt');
    expect(storage.data.get(RUN_KEY)).toBe(damaged);
  });

  it('discards a corrupt save on request', async () => {
    const storage = memoryStorage({ [RUN_KEY]: '{"broken":' });
    const session = makeSession(storage);
    expect((await session.refreshSaved()).kind).toBe('corrupt');
    await session.discardSave();
    expect(storage.data.has(RUN_KEY)).toBe(false);
    expect(session.getSnapshot().saved).toEqual({ kind: 'none' });
  });

  it('reports none and unavailable without a run', async () => {
    const none = makeSession(memoryStorage());
    expect(await none.resume()).toBe(false);
    expect(none.getSnapshot().saved).toEqual({ kind: 'none' });

    const unavailable = makeSession(null);
    expect(await unavailable.resume()).toBe(false);
    expect(unavailable.getSnapshot().saved?.kind).toBe('unavailable');

    const throwing = makeSession({
      getItem: () => Promise.reject(new Error('locked')),
      setItem: () => Promise.reject(new Error('locked')),
      removeItem: () => Promise.reject(new Error('locked')),
    });
    expect(await throwing.resume()).toBe(false);
    expect(throwing.getSnapshot().saved).toEqual({ kind: 'unavailable', error: 'locked' });
  });
});

describe('run session: new run from the end screen', () => {
  it('clears the save first, then starts a fresh seed with the last starter and saves it once', async () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.start(SEED, 'brambleback');
    await session.whenIdle();
    storage.hold = true;
    const seed = session.newRun();
    expect(seed).toBe('FRESH2');
    const snap = session.getSnapshot();
    expect(snap.run!.seed).toBe('FRESH2');
    expect(snap.run!.party.map((m) => m.speciesId)).toEqual(['brambleback']);
    expect(snap.view).toBe('map');
    expect(snap.titleSeed).toBe('FRESH2');
    expect(snap.trail).toEqual([]);
    expect(snap.log).toEqual([]);
    storage.hold = false;
    storage.release();
    await session.whenIdle();
    storage.release();
    await session.whenIdle();
    expect(storage.removes).toBe(1);
    expect(storage.writes).toHaveLength(2);
    expect(storage.data.get(RUN_KEY)).toBe(serializeRun(snap.run!));
    expect(storage.maxInFlight).toBe(1);
  });

  it('takes an explicit starter, and the first starter when the session never started a run', () => {
    const session = makeSession(memoryStorage());
    session.newRun();
    expect(session.getSnapshot().run!.party[0]!.speciesId).toBe(STARTER);
    session.newRun('tidewisp');
    expect(session.getSnapshot().run!.party[0]!.speciesId).toBe('tidewisp');
    // The starter of that run is now the remembered one.
    session.newRun();
    expect(session.getSnapshot().run!.party[0]!.speciesId).toBe('tidewisp');
  });
});

describe('phase routing', () => {
  it('maps every phase to the screen that draws it', () => {
    const battle = freshRun().phase; // only the kind matters below
    const cases: Array<[RunPhase['kind'], string]> = [
      ['map', 'map'],
      ['battle', 'battle'],
      ['recruit', 'event'],
      ['shrine', 'event'],
      ['cache', 'event'],
      ['mystery', 'event'],
      ['ended', 'end'],
    ];
    for (const [kind, view] of cases) expect(runViewOf({ ...battle, kind } as RunPhase)).toBe(view);
  });

  it('names a phase after the node being played, in the current language', () => {
    const session = makeSession(memoryStorage());
    session.start(SEED, STARTER);
    session.pickNode(firstNode(session.getSnapshot().run!));
    const run = session.getSnapshot().run!;
    const phase = run.phase;
    if (phase.kind === 'map' || phase.kind === 'ended' || phase.kind === 'recruit') throw new Error('unexpected phase');
    const type = run.maps[0]!.layers[0]!.find((n) => n.id === phase.nodeId)!.type;
    setLang('en');
    const en = phaseHeading(run);
    setLang('es');
    const es = phaseHeading(run);
    setLang('en');
    expect(en).toBe({ wild: 'Wild creature', elite: 'Elite foe', shrine: 'Shrine', cache: 'Cache', mystery: 'Mystery', boss: 'Boss' }[type]);
    expect(es).not.toBe(en);
    expect(phaseHeading({ ...run, phase: { kind: 'ended', result: 'lost' } })).toBe('Run over');
  });
});
