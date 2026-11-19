// Battle menu (presentation side): DOM rendering of the pure menu model (buildMenu, in @kinfall/core).
import type { MenuModel } from '@kinfall/core/models/menu';
import { t } from '@kinfall/core/platform/i18n';
import type { Action } from '@kinfall/core/sim/state';

/**
 * Replaces `host`'s content with one real `<button>` per entry, grouped into moves and team.
 * The buttons carry no `data-action`: their own click performs the action. Returns them in order.
 */
export function renderMenu(
  host: HTMLElement,
  model: MenuModel,
  onPick: (action: Action) => void,
): HTMLButtonElement[] {
  const doc = host.ownerDocument;
  host.replaceChildren();
  const buttons: HTMLButtonElement[] = [];
  const groups: Array<{ key: 'menu.moves' | 'menu.team'; type: Action['type'] }> = [
    { key: 'menu.moves', type: 'move' },
    { key: 'menu.team', type: 'swap' },
  ];
  for (const g of groups) {
    const entries = model.entries.filter((e) => e.action.type === g.type);
    if (entries.length === 0) continue;
    const group = doc.createElement('div');
    group.className = `choice-group choice-group--${g.type}`;
    group.setAttribute('role', 'group');
    const heading = doc.createElement('h3');
    heading.className = 'choice-heading';
    heading.id = `choice-heading-${g.type}`;
    heading.textContent = t(g.key);
    group.setAttribute('aria-labelledby', heading.id);
    group.append(heading);
    const list = doc.createElement('div');
    list.className = 'choice-list';
    for (const entry of entries) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.disabled = entry.disabled;
      const label = doc.createElement('span');
      label.className = 'choice-label';
      label.textContent = entry.label;
      b.append(label);
      if (entry.detail) {
        const detail = doc.createElement('span');
        detail.className = 'choice-detail';
        detail.textContent = entry.detail;
        b.append(' ', detail);
      }
      b.addEventListener('click', () => {
        if (!b.disabled) onPick(entry.action);
      });
      list.append(b);
      buttons.push(b);
    }
    group.append(list);
    host.append(group);
  }
  return buttons;
}
