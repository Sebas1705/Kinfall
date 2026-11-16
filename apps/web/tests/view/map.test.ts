// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT } from '@webgames/core/content';
import { nodeTypeLabel, setLang } from '@webgames/core/platform/i18n';
import { maxHpOf, startRun } from '@webgames/core/sim/run/run';
import type { MapNode, RunState } from '@webgames/core/sim/run/types';
import { buildMapModel } from '@webgames/core/models/map';
import { renderMap } from '../../src/view/screens/map';
import type { MapModel } from '@webgames/core/models/map';

afterEach(() => setLang('en'));

const fresh = (seed = 'map-test') => startRun(seed, 'cindermite', CONTENT);
const flat = (m: MapModel) => m.layers.flatMap((l) => l.nodes);
const byId = (m: MapModel, id: string) => flat(m).find((n) => n.id === id)!;

/** A run standing on `b` (layer 1) after clearing `a` (layer 0). */
function afterTwo(seed = 'map-test'): { run: RunState; a: MapNode; b: MapNode } {
  const run = fresh(seed);
  const a = run.maps[0]!.layers[0]![0]!;
  const b = run.maps[0]!.layers[1]!.find((n) => n.id === a.next[0])!;
  run.at = b.id;
  run.stats.nodesCleared = 2;
  return { run, a, b };
}

describe('buildMapModel', () => {
  it('fresh run: layer 0 available, every other node locked, nothing cleared', () => {
    setLang('en');
    const run = fresh();
    const m = buildMapModel(run, CONTENT);
    expect(m.zoneName).toBe('Ashen Marsh');
    expect(m.layers.map((l) => l.layer)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const layer of m.layers) {
      for (const n of layer.nodes) {
        expect(n.state).toBe(layer.layer === 0 ? 'available' : 'locked');
        expect(n.current).toBe(false);
      }
    }
    expect(m.party).toEqual([{ name: 'Cindermite', hp: maxHpOf('cindermite', CONTENT), maxHp: maxHpOf('cindermite', CONTENT) }]);
    expect(m.souls).toBe(0);
  });

  it('labels and types match the zone map, the boss layer is last', () => {
    const run = fresh();
    const m = buildMapModel(run, CONTENT);
    const source = run.maps[0]!.layers.flat();
    expect(flat(m).map((n) => [n.id, n.type, n.label])).toEqual(source.map((n) => [n.id, n.type, nodeTypeLabel(n.type)]));
    const last = m.layers[m.layers.length - 1]!;
    expect(last.nodes.map((n) => n.type)).toEqual(['boss']);
    expect(last.nodes[0]!.label).toBe('Boss');
    expect(m.layers[0]!.nodes.every((n) => n.label === 'Wild creature')).toBe(true);
  });

  it('two cleared nodes: both flagged, current on the last, its successors available', () => {
    const { run, a, b } = afterTwo();
    const m = buildMapModel(run, CONTENT, [a.id, b.id]);
    expect(byId(m, a.id)).toMatchObject({ state: 'cleared', current: false });
    expect(byId(m, b.id)).toMatchObject({ state: 'cleared', current: true });
    for (const n of flat(m)) {
      if (n.id === a.id || n.id === b.id) continue;
      expect(n.state, n.id).toBe(b.next.includes(n.id) ? 'available' : 'locked');
      expect(n.current).toBe(false);
    }
    expect(flat(m).filter((n) => n.current)).toHaveLength(1);
  });

  it('without a trail, a predecessor is still cleared when it is the only way in', () => {
    // Find a seed whose layer-1 node has exactly one layer-0 predecessor.
    for (let i = 0; i < 200; i++) {
      const run = fresh(`trail-${i}`);
      const [l0, l1] = [run.maps[0]!.layers[0]!, run.maps[0]!.layers[1]!];
      const b = l1.find((n) => l0.filter((p) => p.next.includes(n.id)).length === 1);
      if (!b) continue;
      const a = l0.find((p) => p.next.includes(b.id))!;
      run.at = b.id;
      const m = buildMapModel(run, CONTENT);
      expect(byId(m, a.id).state).toBe('cleared');
      for (const p of l0) if (p.id !== a.id) expect(byId(m, p.id).state).toBe('locked');
      return;
    }
    throw new Error('no seed with a unique predecessor found');
  });

  it('ignores trail entries that are not on a path to the current node', () => {
    const { run, a, b } = afterTwo();
    const other = run.maps[0]!.layers[3]![0]!;
    const m = buildMapModel(run, CONTENT, [other.id, a.id, b.id]);
    expect(byId(m, other.id).state).toBe('locked');
  });

  it('uses the current zone only, with its localised name, party and souls', () => {
    setLang('es');
    const run = fresh();
    run.zone = 1;
    run.souls = 4;
    run.party = [
      { speciesId: 'cindermite', hp: 7 },
      { speciesId: 'tidewisp', hp: 3 },
    ];
    const m = buildMapModel(run, CONTENT);
    expect(m.zoneName).toBe('Hondonada Espinosa');
    expect(flat(m).every((n) => n.id.startsWith('z1-'))).toBe(true);
    expect(m.layers[0]!.nodes[0]!.label).toBe('Criatura salvaje');
    expect(m.party.map((p) => [p.name, p.hp])).toEqual([
      ['Cenizón', 7],
      ['Marejilla', 3],
    ]);
    expect(m.souls).toBe(4);
  });

  it('outside the map phase nothing is available', () => {
    const run = fresh();
    run.phase = { kind: 'shrine', nodeId: run.maps[0]!.layers[0]![0]!.id };
    expect(flat(buildMapModel(run, CONTENT)).some((n) => n.state === 'available')).toBe(false);
  });
});

describe('renderMap', () => {
  function rendered(run = afterTwo().run, trail: string[] = []) {
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    const onPick = vi.fn();
    const onAbandon = vi.fn();
    const model = buildMapModel(run, CONTENT, trail);
    renderMap(host, model, onPick, onAbandon);
    return { host, model, onPick, onAbandon };
  }

  it('renders one ordered list item per layer with an ordered list of node buttons', () => {
    const { host, model } = rendered(fresh());
    const layers = host.querySelectorAll('ol.map-layers > li');
    expect(layers).toHaveLength(7);
    layers.forEach((li, i) => {
      expect(li.querySelector('.map-step')!.textContent).toBe(`Step ${i + 1}`);
      expect(li.querySelectorAll('ol > li > button')).toHaveLength(model.layers[i]!.nodes.length);
    });
    expect(host.querySelector('h2')!.textContent).toBe('Zone 1: Ashen Marsh');
  });

  it('available nodes are enabled buttons; locked and cleared ones are disabled with state text', () => {
    const { run, a, b } = afterTwo();
    const { host, onPick } = rendered(run, [a.id, b.id]);
    const btn = (id: string) => host.querySelector<HTMLButtonElement>(`button[data-node="${id}"]`)!;
    for (const id of b.next) {
      expect(btn(id).disabled).toBe(false);
      expect(btn(id).getAttribute('aria-label')).toMatch(/: available$/);
    }
    expect(btn(a.id).disabled).toBe(true);
    expect(btn(a.id).getAttribute('aria-label')).toBe('Wild creature: cleared');
    expect(btn(a.id).textContent).toContain('cleared');
    const locked = run.maps[0]!.layers[4]![0]!;
    expect(btn(locked.id).disabled).toBe(true);
    expect(btn(locked.id).getAttribute('aria-label')).toBe(`${nodeTypeLabel(locked.type)}: locked`);
    expect(btn(locked.id).textContent).toContain('locked');

    btn(b.next[0]!).click();
    expect(onPick).toHaveBeenCalledWith(b.next[0]);
    btn(locked.id).click();
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('marks the current node with aria-current and the "you are here" text', () => {
    const { run, a, b } = afterTwo();
    const { host } = rendered(run, [a.id, b.id]);
    const cur = host.querySelector<HTMLButtonElement>(`button[data-node="${b.id}"]`)!;
    expect(cur.getAttribute('aria-current')).toBe('location');
    expect(cur.textContent).toContain('you are here');
    expect(cur.getAttribute('aria-label')).toBe(`${nodeTypeLabel(b.type)}: cleared, you are here`);
    expect(host.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('shows the type as an aria-hidden icon glyph plus the label text', () => {
    const { host } = rendered(fresh());
    for (const button of host.querySelectorAll<HTMLButtonElement>('button[data-node]')) {
      const icon = button.querySelector('.map-node-icon')!;
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.textContent!.trim().length).toBeGreaterThan(0);
      expect(button.querySelector('.map-node-label')!.textContent!.length).toBeGreaterThan(0);
      expect(button.getAttribute('aria-label')!.startsWith(button.querySelector('.map-node-label')!.textContent!)).toBe(true);
    }
    const glyphs = new Set([...host.querySelectorAll('button[data-type="boss"] .map-node-icon')].map((e) => e.textContent));
    const wild = new Set([...host.querySelectorAll('button[data-type="wild"] .map-node-icon')].map((e) => e.textContent));
    expect([...glyphs][0]).not.toBe([...wild][0]);
  });

  it('shows the party with HP and the souls count above the map', () => {
    const run = fresh();
    run.souls = 3;
    const { host } = rendered(run);
    const status = host.querySelector('.run-status')!;
    const max = maxHpOf('cindermite', CONTENT);
    expect(status.textContent).toContain(`Cindermite ${max}/${max}`);
    expect(status.textContent).toContain('Souls');
    expect(status.querySelector('.run-souls-value')!.textContent).toBe('3');
    expect(status.compareDocumentPosition(host.querySelector('.map-layers')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders Spanish labels', () => {
    setLang('es');
    const { host } = rendered(fresh());
    const first = host.querySelector<HTMLButtonElement>('button[data-node]')!;
    expect(first.getAttribute('aria-label')).toBe('Criatura salvaje: disponible');
    expect(host.querySelector('.map-step')!.textContent).toBe('Paso 1');
  });

  it('abandon asks for an inline confirmation; "keep playing" and Escape cancel', () => {
    const { host, onAbandon } = rendered(fresh());
    const abandon = () => host.querySelector<HTMLButtonElement>('[data-action="abandon"]')!;
    abandon().click();
    expect(onAbandon).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Abandon this run? Your save will be deleted.');
    const no = host.querySelector<HTMLButtonElement>('[data-action="abandon-no"]')!;
    expect(document.activeElement).toBe(no);
    no.click();
    expect(host.querySelector('[data-action="abandon-no"]')).toBeNull();
    expect(document.activeElement).toBe(abandon());

    abandon().click();
    host.querySelector('[data-action="abandon-no"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.querySelector('[data-action="abandon-yes"]')).toBeNull();
    expect(onAbandon).not.toHaveBeenCalled();

    abandon().click();
    host.querySelector<HTMLButtonElement>('[data-action="abandon-yes"]')!.click();
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });
});
