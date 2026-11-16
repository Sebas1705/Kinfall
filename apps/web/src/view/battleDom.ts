// DOM facade of the battle screen (summary, log, prompt, intent, choices, result panel), shared by the
// demo battle page and the run page. The turn controller drives it through the BattleUi interface.
import type { Content } from '@webgames/core/content';
import { lookup } from '@webgames/core/content/lookup';
import { speciesName, t } from '@webgames/core/platform/i18n';
import type { GameAction } from '../platform/input';
import type { BattleState, Side } from '@webgames/core/sim/state';
import type { BattleUi } from './controller';
import { renderMenu } from './menu';
import { byId } from './settings';

export interface BattleDom {
  ui: BattleUi;
  /** No scene (no WebGL or canvas): hide it and show the text summary instead. */
  sceneUnavailable(): void;
}

export function createBattleDom(content: Content, bindInput: (onAction: (a: GameAction) => void) => void): BattleDom {
  const scene = byId<HTMLDivElement>('scene');
  const summary = byId<HTMLParagraphElement>('summary');
  const log = byId<HTMLDivElement>('log');
  const prompt = byId<HTMLHeadingElement>('prompt');
  const intent = byId<HTMLParagraphElement>('intent');
  const choices = byId<HTMLDivElement>('choices');
  const result = byId<HTMLDivElement>('result');
  const resultTitle = byId<HTMLHeadingElement>('result-title');
  const resultNote = byId<HTMLParagraphElement>('result-note');
  const newBattle = byId<HTMLButtonElement>('new-battle');
  const dpad = byId<HTMLElement>('dpad');

  let buttons: HTMLButtonElement[] = [];
  let selected = 0;
  const enabledButtons = () => buttons.filter((b) => !b.disabled && b.isConnected);

  const select = (index: number, focus: boolean) => {
    const enabled = enabledButtons();
    if (enabled.length === 0) return;
    selected = ((index % enabled.length) + enabled.length) % enabled.length;
    for (const b of buttons) b.classList.toggle('selected', b === enabled[selected]);
    if (focus) enabled[selected]!.focus();
  };

  const turnNode = (lines: string[]): HTMLElement => {
    const turn = document.createElement('div');
    turn.className = 'log-turn';
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      turn.append(p);
    }
    return turn;
  };

  const sideSummary = (state: BattleState, side: Side): string => {
    const c = state.teams[side][state.active[side]];
    if (!c) return '';
    const sp = lookup(content).species(c.speciesId);
    const line = t('hud.summary', {
      side: t(side === 'player' ? 'hud.player' : 'hud.enemy'),
      species: speciesName(sp),
      elements: sp.elements.map((el) => t(`element.${el}`)).join(' / '),
      hp: c.hp,
      maxHp: c.maxHp,
      focus: c.focus,
      maxFocus: c.maxFocus,
    });
    return c.status ? `${line} ${t(`status.${c.status.id}`)}.` : line;
  };

  const ui: BattleUi = {
    bindInput,
    setBusy(busy) {
      choices.classList.toggle('busy', busy);
      if (busy) choices.setAttribute('aria-busy', 'true');
      else choices.removeAttribute('aria-busy');
    },
    appendLog(lines) {
      log.append(turnNode(lines));
      log.scrollTop = log.scrollHeight;
    },
    replaceLog(turns) {
      // A rebuild (new battle or language change) must not make screen readers reread everything.
      log.setAttribute('aria-live', 'off');
      log.replaceChildren(...turns.filter((l) => l.length > 0).map(turnNode));
      log.scrollTop = log.scrollHeight;
      requestAnimationFrame(() => log.setAttribute('aria-live', 'polite'));
    },
    showChoices(state, model, onPick, focusFirst) {
      const hadFocus = choices.contains(document.activeElement);
      const lines = [sideSummary(state, 'player'), sideSummary(state, 'enemy'), model.intent ?? ''];
      summary.textContent = lines.filter(Boolean).join('\n');
      prompt.textContent = model.prompt;
      intent.textContent = model.intent ?? '';
      buttons = renderMenu(choices, model, onPick);
      select(focusFirst ? 0 : selected, focusFirst || hadFocus);
    },
    showResult(res, focus) {
      result.hidden = res === null;
      if (!res) return;
      const win = res.winner === 'player';
      resultTitle.textContent = t(win ? 'result.victory' : 'result.defeat');
      resultTitle.className = `result-title ${win ? 'win' : 'lose'}`;
      resultNote.textContent = res.lossNote ? t('battle.lossReminder') : '';
      if (focus) newBattle.focus();
    },
    navigate(a: GameAction) {
      const enabled = enabledButtons();
      if (enabled.length === 0) return;
      const focused = enabled.indexOf(document.activeElement as HTMLButtonElement);
      const current = focused >= 0 ? focused : selected;
      if (a === 'up' || a === 'left') select(current - 1, true);
      else if (a === 'down' || a === 'right') select(current + 1, true);
      else if (a === 'confirm') {
        select(current, true);
        enabled[selected]?.click();
      } else if (a === 'back') select(0, true);
      else if (a === 'swap') {
        const firstSwap = enabled.findIndex((b) => b.closest('.choice-group--swap') !== null);
        if (firstSwap >= 0) select(firstSwap, true);
      }
    },
  };

  // Track the selection when focus moves by Tab or pointer.
  choices.addEventListener('focusin', (e) => {
    const i = enabledButtons().indexOf(e.target as HTMLButtonElement);
    if (i >= 0) select(i, false);
  });
  // On-screen pad buttons must not steal focus from the selected choice.
  dpad.addEventListener('pointerdown', (e) => e.preventDefault());
  dpad.addEventListener('mousedown', (e) => e.preventDefault());

  return {
    ui,
    sceneUnavailable() {
      scene.hidden = true;
      summary.classList.remove('sr-only');
    },
  };
}
