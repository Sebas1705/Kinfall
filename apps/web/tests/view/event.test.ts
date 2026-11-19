// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT } from '@kinfall/core/content';
import { setLang } from '@kinfall/core/platform/i18n';
import { legalRunActions, maxHpOf, startRun } from '@kinfall/core/sim/run/run';
import { runScore } from '@kinfall/core/sim/run/score';
import type { RunPhase, RunState } from '@kinfall/core/sim/run/types';
import { buildEndModel } from '@kinfall/core/models/end';
import { renderEnd } from '../../src/view/screens/end';
import { buildEventModel } from '@kinfall/core/models/event';
import { renderEvent } from '../../src/view/screens/event';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setLang('en');
});
afterEach(() => {
  vi.restoreAllMocks();
  setLang('en');
});

const max = (id: string) => maxHpOf(id, CONTENT);

function runIn(phase: RunPhase, edit: (r: RunState) => void = () => {}): RunState {
  const run = startRun('event-test', 'cindermite', CONTENT);
  run.phase = phase;
  edit(run);
  return run;
}

const labels = (run: RunState) => buildEventModel(run, CONTENT)!.choices.map((c) => [c.label, c.disabled]);

describe('buildEventModel', () => {
  it('returns null outside the event phases', () => {
    expect(buildEventModel(runIn({ kind: 'map' }), CONTENT)).toBeNull();
    expect(buildEventModel(runIn({ kind: 'ended', result: 'lost' }), CONTENT)).toBeNull();
  });

  it('recruit with a free slot: offer, Recruit then Let it go', () => {
    const run = runIn({ kind: 'recruit', speciesId: 'skirrow', hp: 7 });
    const m = buildEventModel(run, CONTENT)!;
    expect(m.kind).toBe('recruit');
    expect(m.title).toBe('A creature wants to join');
    expect(m.description).toBe('The Skirrow you defeated would join you with 7 HP.');
    expect(m.note).toBeUndefined();
    expect(m.offer).toMatchObject({ speciesId: 'skirrow', name: 'Skirrow', hp: 7, maxHp: max('skirrow') });
    expect(m.offer!.elements).toBe('Gale');
    expect(m.choices.map((c) => c.action)).toEqual([
      { type: 'recruit', take: true },
      { type: 'recruit', take: false },
    ]);
    expect(labels(run)).toEqual([
      ['Recruit', false],
      ['Let it go', false],
    ]);
    expect(m.party).toEqual([{ name: 'Cindermite', hp: max('cindermite'), maxHp: max('cindermite') }]);
  });

  it('recruit with a full party: one replace entry per member, then Let it go', () => {
    const run = runIn({ kind: 'recruit', speciesId: 'dusklurk', hp: 9 }, (r) => {
      r.party = [
        { speciesId: 'cindermite', hp: 5 },
        { speciesId: 'skirrow', hp: 6 },
        { speciesId: 'tidewisp', hp: 7 },
      ];
    });
    const m = buildEventModel(run, CONTENT)!;
    expect(m.note).toBe('Your party is full: choose who to replace, or let it go.');
    expect(labels(run)).toEqual([
      ['Replace Cindermite', false],
      ['Replace Skirrow', false],
      ['Replace Tidewisp', false],
      ['Let it go', false],
    ]);
    expect(m.choices.map((c) => c.action)).toEqual([
      { type: 'recruit', take: true, replaceIndex: 0 },
      { type: 'recruit', take: true, replaceIndex: 1 },
      { type: 'recruit', take: true, replaceIndex: 2 },
      { type: 'recruit', take: false },
    ]);
    expect(m.choices[1]!.detail).toBe(`Skirrow 6/${max('skirrow')}`);
  });

  it('shrine: Rest, an evolve entry per evolvable member (cost shown), Leave', () => {
    const run = runIn({ kind: 'shrine', nodeId: 'z0-l5-c0' }, (r) => {
      r.souls = 3;
      r.party = [
        { speciesId: 'cindermite', hp: 5 },
        { speciesId: 'skirrow', hp: 6 },
      ];
    });
    const m = buildEventModel(run, CONTENT)!;
    expect(m.title).toBe('A quiet shrine');
    expect(m.souls).toBe(3);
    expect(labels(run)).toEqual([
      ['Rest', false],
      ['Evolve Cindermite', false],
      ['Leave', false],
    ]);
    expect(m.choices[0]!.detail).toBe('Heal half of every member’s HP');
    expect(m.choices[1]!.detail).toBe('Costs 3 souls');
    expect(m.choices[1]!.action).toEqual({ type: 'evolve', memberIndex: 0 });
    // Every enabled entry is a legal run action and every legal action is listed.
    const enabled = m.choices.filter((c) => !c.disabled).map((c) => c.action);
    expect(enabled).toEqual(expect.arrayContaining(legalRunActions(run, CONTENT)));
    expect(enabled.length).toBe(legalRunActions(run, CONTENT).length);
  });

  it('shrine with too few souls: evolve is listed but disabled with the reason in text', () => {
    const run = runIn({ kind: 'shrine', nodeId: 'z0-l5-c0' }, (r) => {
      r.souls = 2;
      r.party = [
        { speciesId: 'cindermite', hp: 5 },
        { speciesId: 'tidewisp', hp: 6 },
      ];
    });
    const m = buildEventModel(run, CONTENT)!;
    expect(labels(run)).toEqual([
      ['Rest', false],
      ['Evolve Cindermite', true],
      ['Evolve Tidewisp', true],
      ['Leave', false],
    ]);
    expect(m.choices[1]!.detail).toBe('Costs 3 souls · Not enough souls');
  });

  it('cache: a single Take entry with the reward detail', () => {
    const run = runIn({ kind: 'cache', nodeId: 'z0-l2-c0' });
    const m = buildEventModel(run, CONTENT)!;
    expect(m.title).toBe('A hidden cache');
    expect(m.choices).toEqual([
      expect.objectContaining({ action: { type: 'cache' }, label: 'Take the cache', disabled: false, detail: '+2 souls, heal a quarter of every member’s HP' }),
    ]);
  });

  it('mystery: Open it, Leave it', () => {
    const run = runIn({ kind: 'mystery', nodeId: 'z0-l2-c0' });
    const m = buildEventModel(run, CONTENT)!;
    expect(m.title).toBe('A strange glow');
    expect(m.choices.map((c) => [c.action, c.label])).toEqual([
      [{ type: 'mystery', choice: 'open' }, 'Open it'],
      [{ type: 'mystery', choice: 'leave' }, 'Leave it'],
    ]);
  });

  it('Spanish labels', () => {
    setLang('es');
    const run = runIn({ kind: 'shrine', nodeId: 'z0-l5-c0' }, (r) => (r.souls = 0));
    expect(labels(run)).toEqual([
      ['Descansar', false],
      ['Evolucionar a Cenizón', true],
      ['Marcharse', false],
    ]);
  });
});

describe('renderEvent', () => {
  it('renders the heading, the offer, the party and one button per choice; picks pass the action', () => {
    const host = document.createElement('section');
    const run = runIn({ kind: 'recruit', speciesId: 'skirrow', hp: 7 });
    const onPick = vi.fn();
    renderEvent(host, buildEventModel(run, CONTENT)!, onPick);
    expect(host.querySelector('h2')!.textContent).toBe('A creature wants to join');
    expect(host.querySelector('.offer')!.textContent).toContain('Skirrow');
    expect(host.querySelector('.offer canvas')!.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.run-status')!.textContent).toContain('Cindermite');
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[data-choice]')];
    expect(buttons.map((b) => b.querySelector('.choice-label')!.textContent)).toEqual(['Recruit', 'Let it go']);
    buttons[0]!.click();
    expect(onPick).toHaveBeenCalledWith({ type: 'recruit', take: true });
  });

  it('a disabled choice is a disabled button that never picks', () => {
    const host = document.createElement('section');
    const run = runIn({ kind: 'shrine', nodeId: 'z0-l5-c0' });
    const onPick = vi.fn();
    renderEvent(host, buildEventModel(run, CONTENT)!, onPick);
    const evolve = [...host.querySelectorAll<HTMLButtonElement>('button[data-choice]')][1]!;
    expect(evolve.disabled).toBe(true);
    expect(evolve.textContent).toContain('Not enough souls');
    evolve.click();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('ids are unique per screen (the map may still hold its own panel)', () => {
    const host = document.createElement('section');
    renderEvent(host, buildEventModel(runIn({ kind: 'cache', nodeId: 'x' }), CONTENT)!, () => {});
    const ids = [...host.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.every((id) => id.startsWith('event-'))).toBe(true);
  });
});

describe('buildEndModel / renderEnd', () => {
  it('lost run: title, stats and the score from runScore', () => {
    const run = runIn({ kind: 'ended', result: 'lost' }, (r) => {
      r.zone = 1;
      r.souls = 4;
      r.party = [];
      r.stats = { nodesCleared: 9, elitesBeaten: 1, bossesBeaten: 1, creaturesLost: 3 };
    });
    const m = buildEndModel(run, CONTENT)!;
    expect(m.result).toBe('lost');
    expect(m.title).toBe('Run lost');
    expect(m.score).toBe(runScore(run, CONTENT));
    expect(m.stats).toEqual([
      { label: 'Zones cleared', value: 1 },
      { label: 'Nodes cleared', value: 9 },
      { label: 'Elites beaten', value: 1 },
      { label: 'Bosses beaten', value: 1 },
      { label: 'Creatures lost', value: 3 },
      { label: 'Souls', value: 4 },
    ]);
  });

  it('won run counts all three zones', () => {
    const run = runIn({ kind: 'ended', result: 'won' }, (r) => (r.zone = 2));
    const m = buildEndModel(run, CONTENT)!;
    expect(m.title).toBe('Run won');
    expect(m.stats[0]).toEqual({ label: 'Zones cleared', value: 3 });
  });

  it('null before the end', () => {
    expect(buildEndModel(runIn({ kind: 'map' }), CONTENT)).toBeNull();
  });

  it('renders the result as text (not colour only) and New run calls back', () => {
    const host = document.createElement('section');
    const run = runIn({ kind: 'ended', result: 'lost' });
    const onNew = vi.fn();
    renderEnd(host, buildEndModel(run, CONTENT)!, onNew);
    expect(host.querySelector('h2')!.textContent).toContain('Run lost');
    expect(host.querySelector('.end-score')!.textContent).toContain(String(runScore(run, CONTENT)));
    expect(host.querySelectorAll('.end-stats dt').length).toBe(6);
    host.querySelector<HTMLButtonElement>('[data-choice="new-run"]')!.click();
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});

describe('initial focus', () => {
  const full = (r: RunState) => {
    r.party = [
      { speciesId: 'cindermite', hp: 5 },
      { speciesId: 'skirrow', hp: 6 },
      { speciesId: 'tidewisp', hp: 7 },
    ];
  };

  it('a full-party recruit focuses "Let it go", never a Replace entry', () => {
    const m = buildEventModel(runIn({ kind: 'recruit', speciesId: 'dusklurk', hp: 9 }, full), CONTENT)!;
    expect(m.choices[m.focusIndex]!.action).toEqual({ type: 'recruit', take: false });
    const host = document.createElement('section');
    renderEvent(host, m, () => {});
    const initial = host.querySelectorAll('[data-initial]');
    expect(initial.length).toBe(1);
    expect(initial[0]!.textContent).toBe('Let it go');
  });

  it('otherwise the first enabled choice', () => {
    const free = buildEventModel(runIn({ kind: 'recruit', speciesId: 'skirrow', hp: 7 }), CONTENT)!;
    expect(free.focusIndex).toBe(0);
    const shrine = buildEventModel(runIn({ kind: 'shrine', nodeId: 'x' }), CONTENT)!;
    expect(shrine.choices[shrine.focusIndex]!.label).toBe('Rest');
  });
});
