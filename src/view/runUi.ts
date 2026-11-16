// DOM side of the run controller: renders the screens into their host sections and shows the
// non-blocking save warning. Kept apart from the controller so tests can swap either side.
import { t } from '../platform/i18n';
import { el } from './screens/dom';
import { renderMap } from './screens/map';
import type { MapModel } from './screens/map';
import { renderTitle } from './screens/title';
import type { TitleProps } from './screens/title';

export interface RunUi {
  renderTitle(props: TitleProps): void;
  renderMap(model: MapModel, onPick: (nodeId: string) => void, onAbandon: () => void): void;
  /** Temporary stand-in for the battle and event screens (replaced in Task 13). */
  renderPlaceholder(label: string): void;
  showSaveWarning(error: string): void;
}

export interface RunUiHosts {
  title: HTMLElement;
  map: HTMLElement;
  event: HTMLElement;
  /** `role="status"` region holding a `.save-warning` box with a `<p>` and a dismiss `<button>`. */
  warning: HTMLElement;
}

export function createRunUi(hosts: RunUiHosts): RunUi {
  const box = hosts.warning.querySelector<HTMLElement>('.save-warning');
  const text = box?.querySelector('p');
  const dismiss = box?.querySelector('button');
  dismiss?.addEventListener('click', () => {
    if (box) box.hidden = true;
  });

  return {
    renderTitle: (props) => renderTitle(hosts.title, props),
    renderMap: (model, onPick, onAbandon) => renderMap(hosts.map, model, onPick, onAbandon),
    renderPlaceholder(label) {
      hosts.event.replaceChildren(
        el(
          'div',
          { class: 'placeholder', 'data-placeholder': 'true' },
          el('h2', { class: 'screen-heading', 'data-screen-heading': true, tabindex: '-1' }, label),
        ),
      );
    },
    showSaveWarning(error) {
      if (!box || !text) return;
      text.textContent = t('save.failed', { reason: error.replace(/[.\s]+$/, '') });
      if (dismiss) dismiss.textContent = t('save.dismiss');
      box.hidden = false;
    },
  };
}
