// DOM side of the run controller: renders the screens into their host sections, keeps the run log
// and shows the non-blocking save warning. Kept apart from the controller so tests can swap either side.
import { t } from '../platform/i18n';
import type { StringKey } from '../platform/i18n';
import type { RunAction } from '../sim/run/types';
import { confirmInline, el } from './screens/dom';
import { renderEnd } from './screens/end';
import type { EndModel } from './screens/end';
import { renderEvent } from './screens/event';
import type { EventModel } from './screens/event';
import { renderMap } from './screens/map';
import type { MapModel } from './screens/map';
import { renderTitle } from './screens/title';
import type { TitleProps } from './screens/title';

/** Lines kept in the run log; older ones are dropped. */
export const RUN_LOG_MAX = 60;

export interface RunUi {
  renderTitle(props: TitleProps): void;
  renderMap(model: MapModel, onPick: (nodeId: string) => void, onAbandon: () => void): void;
  renderEvent(model: EventModel, onPick: (action: RunAction) => void): void;
  renderEnd(model: EndModel, onNewRun: () => void): void;
  /** The battle screen's secondary "Abandon run" control (two-step confirm); run mode only. */
  renderBattleFooter(onAbandon: () => void): void;
  showSaveWarning(error: string): void;
  /** Deleting the save failed (abandon or discard). */
  showClearWarning(error: string): void;
  hideSaveWarning(): void;
  /** Replaces the run log without announcing it (new run, resume, language change). */
  setRunLog(lines: string[]): void;
  /** Appends lines; the log region announces them politely. */
  appendRunLog(lines: string[]): void;
  showRunLog(visible: boolean): void;
  /** Footer seed line; null clears it. */
  showSeed(seed: string | null): void;
}

export interface RunUiHosts {
  title: HTMLElement;
  map: HTMLElement;
  event: HTMLElement;
  end: HTMLElement;
  /** Footer of the battle screen; stays empty (and hidden) in the demo battle page. */
  battleFooter?: HTMLElement;
  /** `role="status"` region holding a `.save-warning` box with a `<p>` and a dismiss `<button>`. */
  warning: HTMLElement;
  /** Run log panel holding a `[role="log"]` region. */
  log: HTMLElement;
  seed?: HTMLElement;
}

export function createRunUi(hosts: RunUiHosts): RunUi {
  const box = hosts.warning.querySelector<HTMLElement>('.save-warning');
  const text = box?.querySelector('p');
  const dismiss = box?.querySelector('button');
  dismiss?.addEventListener('click', () => {
    if (box) box.hidden = true;
  });
  const logRegion = hosts.log.querySelector<HTMLElement>('[role="log"]') ?? hosts.log;

  const warn = (key: StringKey, error: string) => {
    if (!box || !text) return;
    text.textContent = t(key, { reason: error.replace(/[.\s]+$/, '') });
    if (dismiss) dismiss.textContent = t('save.dismiss');
    box.hidden = false;
  };
  const line = (s: string) => el('p', {}, s);
  const trim = () => {
    while (logRegion.childElementCount > RUN_LOG_MAX) logRegion.firstElementChild?.remove();
  };
  const scroll = () => {
    logRegion.scrollTop = logRegion.scrollHeight;
  };

  return {
    renderTitle: (props) => renderTitle(hosts.title, props),
    renderMap: (model, onPick, onAbandon) => renderMap(hosts.map, model, onPick, onAbandon),
    renderEvent: (model, onPick) => renderEvent(hosts.event, model, onPick),
    renderEnd: (model, onNewRun) => renderEnd(hosts.end, model, onNewRun),
    renderBattleFooter(onAbandon) {
      const footer = hosts.battleFooter;
      if (!footer) return;
      const abandon = el('button', { type: 'button', class: 'secondary', 'data-action': 'abandon' }, t('map.abandon'));
      abandon.addEventListener('click', () =>
        confirmInline(abandon, {
          question: t('map.abandonConfirm'),
          yes: t('map.abandonYes'),
          no: t('map.abandonNo'),
          yesAction: 'abandon-yes',
          noAction: 'abandon-no',
          onYes: onAbandon,
        }),
      );
      footer.replaceChildren(abandon);
      footer.hidden = false;
    },
    showSaveWarning: (error) => warn('save.failed', error),
    showClearWarning: (error) => warn('save.clearFailed', error),
    hideSaveWarning() {
      if (box) box.hidden = true;
    },
    setRunLog(lines) {
      // A rebuild must not make screen readers reread the whole log.
      logRegion.setAttribute('aria-live', 'off');
      logRegion.replaceChildren(...lines.map(line));
      trim();
      scroll();
      const restore = () => logRegion.setAttribute('aria-live', 'polite');
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
      else restore();
    },
    appendRunLog(lines) {
      if (lines.length === 0) return;
      logRegion.append(...lines.map(line));
      trim();
      scroll();
    },
    showRunLog(visible) {
      hosts.log.hidden = !visible;
    },
    showSeed(seed) {
      if (hosts.seed) hosts.seed.textContent = seed === null ? '' : t('battle.seed', { seed });
    },
  };
}
