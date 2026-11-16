// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT } from '../../src/content';
import { setLang } from '../../src/platform/i18n';
import { createRunStorage, type StorageLike } from '../../src/platform/runStorage';
import { serializeRun } from '../../src/sim/run/codec';
import { startRun } from '../../src/sim/run/run';
import { createRouter } from '../../src/view/router';
import { createRunController } from '../../src/view/runController';
import { createRunUi } from '../../src/view/runUi';

const KEY = 'webgames.run.v1';

function fakeStorage(): StorageLike & { data: Map<string, string>; failing: boolean; sets: number } {
  const data = new Map<string, string>();
  const st = {
    data,
    failing: false,
    sets: 0,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      st.sets++;
      if (st.failing) throw new Error('quota exceeded');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
  return st;
}

function setup(st = fakeStorage()) {
  document.body.innerHTML = `
    <main id="screens">
      <div id="save-warning" role="status"><div class="save-warning" hidden><p></p><button type="button">x</button></div></div>
      <section data-screen="title"></section>
      <section data-screen="map"></section>
      <section data-screen="battle"><h2>Battle</h2></section>
      <section data-screen="event"></section>
      <section data-screen="end"></section>
    </main>`;
  const root = document.getElementById('screens')!;
  const screen = (id: string) => root.querySelector<HTMLElement>(`[data-screen="${id}"]`)!;
  const router = createRouter(root);
  const ui = createRunUi({
    title: screen('title'),
    map: screen('map'),
    event: screen('event'),
    warning: document.getElementById('save-warning')!,
  });
  const storage = createRunStorage(st, CONTENT);
  const controller = createRunController({ content: CONTENT, storage, router, ui, newSeed: () => 'SEEDSEED' });
  return { st, root, screen, router, controller };
}

const warningBox = () => document.querySelector<HTMLElement>('.save-warning')!;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setLang('en');
});
afterEach(() => vi.restoreAllMocks());

describe('createRunController', () => {
  it('showTitle renders the title with the new seed and no Continue when nothing is saved', () => {
    const { controller, router, screen } = setup();
    controller.showTitle();
    expect(router.current()).toBe('title');
    expect(screen('title').querySelector<HTMLInputElement>('input[name="seed"]')!.value).toBe('SEEDSEED');
    expect(screen('title').querySelector<HTMLButtonElement>('[data-action="continue"]')!.disabled).toBe(true);
  });

  it('start saves the new run and shows the map', () => {
    const { controller, router, st, screen } = setup();
    controller.start('seed-a', 'brambleback');
    expect(router.current()).toBe('map');
    const run = controller.getRun()!;
    expect(run.seed).toBe('seed-a');
    expect(run.party[0]!.speciesId).toBe('brambleback');
    expect(st.data.get(KEY)).toBe(serializeRun(run));
    expect(screen('map').querySelectorAll('button[data-node]:not([disabled])').length).toBe(run.maps[0]!.layers[0]!.length);
  });

  it('the title "New run" button goes through start', () => {
    const { controller, router, screen } = setup();
    controller.showTitle();
    screen('title').querySelector<HTMLButtonElement>('[data-action="new-run"]')!.click();
    expect(router.current()).toBe('map');
    expect(controller.getRun()!.seed).toBe('SEEDSEED');
    expect(controller.getRun()!.party[0]!.speciesId).toBe(CONTENT.starters[0]);
  });

  it('picking a combat node applies the node action, autosaves and shows the placeholder', () => {
    const { controller, router, st, screen } = setup();
    controller.start('seed-b', 'cindermite');
    const node = controller.getRun()!.maps[0]!.layers[0]![0]!;
    const before = st.sets;
    screen('map').querySelector<HTMLButtonElement>(`button[data-node="${node.id}"]`)!.click();
    const run = controller.getRun()!;
    expect(run.phase.kind).toBe('battle');
    expect(st.sets).toBe(before + 1);
    expect(st.data.get(KEY)).toBe(serializeRun(run));
    expect(router.current()).toBe('event');
    const ph = screen('event').querySelector('[data-placeholder]')!;
    expect(ph.textContent).toContain('Wild creature');
  });

  it('an illegal node pick changes nothing and does not save', () => {
    const { controller, st } = setup();
    controller.start('seed-c', 'cindermite');
    const before = controller.getRun();
    const sets = st.sets;
    controller.pickNode('z0-l4-c0');
    expect(controller.getRun()).toEqual(before);
    expect(st.sets).toBe(sets);
  });

  it('a failing save shows the warning once, keeps playing and retries later saves', () => {
    const { controller, st, router } = setup();
    st.failing = true;
    controller.start('seed-d', 'cindermite');
    expect(router.current()).toBe('map');
    expect(warningBox().hidden).toBe(false);
    expect(warningBox().textContent).toContain('Could not save your run: quota exceeded. You can keep playing.');
    // Dismiss, then a later failure in the same streak does not re-open it.
    warningBox().querySelector('button')!.click();
    expect(warningBox().hidden).toBe(true);
    const node = controller.getRun()!.maps[0]!.layers[0]![0]!;
    controller.pickNode(node.id);
    expect(controller.getRun()!.phase.kind).toBe('battle');
    expect(warningBox().hidden).toBe(true);
    expect(st.sets).toBe(2);
  });

  it('resume loads the saved run and shows the map', () => {
    const st = fakeStorage();
    const saved = startRun('seed-e', 'tidewisp', CONTENT);
    st.data.set(KEY, serializeRun(saved));
    const { controller, router } = setup(st);
    controller.showTitle();
    document.querySelector<HTMLButtonElement>('[data-action="continue"]')!.click();
    expect(router.current()).toBe('map');
    expect(controller.getRun()).toEqual(saved);
  });

  it('abandon clears the save and returns to the title', () => {
    const { controller, router, st, screen } = setup();
    controller.start('seed-f', 'cindermite');
    screen('map').querySelector<HTMLButtonElement>('[data-action="abandon"]')!.click();
    screen('map').querySelector<HTMLButtonElement>('[data-action="abandon-yes"]')!.click();
    expect(st.data.has(KEY)).toBe(false);
    expect(controller.getRun()).toBeNull();
    expect(router.current()).toBe('title');
    expect(screen('title').querySelector<HTMLButtonElement>('[data-action="continue"]')!.disabled).toBe(true);
  });

  it('a corrupt save shows the notice and "Discard save" clears it', () => {
    const st = fakeStorage();
    st.data.set(KEY, '{garbage');
    const { controller, screen } = setup(st);
    controller.showTitle();
    const title = screen('title');
    expect(title.textContent).toContain('Your saved run is damaged');
    title.querySelector<HTMLButtonElement>('[data-action="discard"]')!.click();
    title.querySelector<HTMLButtonElement>('[data-action="discard-yes"]')!.click();
    expect(st.data.has(KEY)).toBe(false);
    expect(title.textContent).not.toContain('Your saved run is damaged');
    expect(title.querySelector('[data-action="discard"]')).toBeNull();
  });

  it('refreshText re-renders the current screen in the new language', () => {
    const { controller, screen } = setup();
    controller.start('seed-g', 'cindermite');
    setLang('es');
    controller.refreshText();
    expect(screen('map').querySelector('h2')!.textContent).toBe('Zona 1: Marjal de Ceniza');
  });
});
