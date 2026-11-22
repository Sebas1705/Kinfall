// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTENT } from '@kinfall/core/content';
import { buildMenu } from '@kinfall/core/models/menu';
import { createBattle } from '@kinfall/core/sim/battle';
import { createBattleDom } from '../../src/view/battleDom';
import { demoTeams } from '../../src/view/demo';

const PAGE = `<div class="app" id="app" data-orientation="portrait">
  <header><button id="hud-log" type="button" hidden>Log</button></header>
  <main id="screens">
    <section id="screen-battle" data-screen="battle">
      <section class="stage"><div id="scene"></div><p id="summary" class="sr-only"></p></section>
      <section id="log-panel"><h2 id="log-title"></h2><div id="log" role="log"></div></section>
      <section id="menu-panel"><h2 id="prompt"></h2><p id="intent"></p><div id="choices"></div>
        <div id="result" hidden><h2 id="result-title"></h2><p id="result-note"></p><button id="new-battle" type="button"></button></div>
      </section>
      <nav id="dpad"></nav>
    </section>
  </main>
</div>`;

function setup() {
  const dom = createBattleDom(CONTENT, () => {});
  const { player, enemy } = demoTeams('demo', CONTENT);
  const state = createBattle('demo', player, enemy, CONTENT, { telegraph: true });
  return { dom, state, model: buildMenu(state, CONTENT) };
}

beforeEach(() => {
  document.body.innerHTML = PAGE;
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('battle log sheet', () => {
  it('keeps the newest line in view in the sheet body while the log is lent to it', () => {
    const { dom } = setup();
    const hudLog = document.getElementById('hud-log')!;
    expect(hudLog.hidden).toBe(false);
    hudLog.click();
    const body = document.querySelector<HTMLElement>('.sheet__body')!;
    expect(body.contains(document.getElementById('log'))).toBe(true);
    const sets: number[] = [];
    Object.defineProperty(body, 'scrollHeight', { value: 777, configurable: true });
    Object.defineProperty(body, 'scrollTop', { set: (v: number) => sets.push(v), get: () => 0, configurable: true });
    dom.ui.appendLog(['A line']);
    expect(sets.at(-1)).toBe(777);
    // The log itself is not the scroller there.
    const log = document.getElementById('log')!;
    Object.defineProperty(log, 'scrollHeight', { value: 99, configurable: true });
    dom.ui.appendLog(['Another']);
    expect(log.scrollTop).not.toBe(99);
  });

  it('puts the log back on close and returns the focus to the choices when a turn settled meanwhile', () => {
    const { dom, state, model } = setup();
    dom.ui.showChoices(state, model, () => {}, false);
    const hudLog = document.getElementById('hud-log')!;
    hudLog.click();
    // A turn settles while the sheet is open: the controller asks for the focus on the first choice.
    dom.ui.showChoices(state, model, () => {}, true);
    document.querySelector<HTMLElement>('[data-sheet-close]')!.click();
    expect(document.getElementById('log')!.parentElement!.id).toBe('log-panel');
    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(hudLog);
    expect(document.getElementById('choices')!.contains(active)).toBe(true);
  });

  it('returns the focus to the Log button when nothing settled while the sheet was open', () => {
    const { dom, state, model } = setup();
    dom.ui.showChoices(state, model, () => {}, false);
    const hudLog = document.getElementById('hud-log')!;
    hudLog.click();
    document.querySelector<HTMLElement>('[data-sheet-close]')!.click();
    expect(document.activeElement).toBe(hudLog);
  });
});
