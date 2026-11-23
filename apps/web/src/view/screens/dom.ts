// Tiny DOM builder shared by the screen modules. Text goes through textContent only.

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === 'class') node.className = String(value);
    else node.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/**
 * Inline two-step confirmation: replaces `trigger` with a question and two buttons, focusing the
 * safe one. Cancel (or Escape) restores the trigger and focuses it again.
 */
export function confirmInline(
  trigger: HTMLButtonElement,
  opts: { question: string; yes: string; no: string; yesAction: string; noAction: string; onYes: () => void },
): void {
  const yes = el('button', { type: 'button', class: 'danger', 'data-action': opts.yesAction }, opts.yes);
  const no = el('button', { type: 'button', class: 'secondary', 'data-action': opts.noAction }, opts.no);
  const box = el('div', { class: 'confirm', role: 'group' }, el('p', { class: 'confirm-question' }, opts.question), el('div', { class: 'button-row' }, yes, no));
  const question = box.firstElementChild as HTMLElement;
  question.id = `confirm-${opts.yesAction}`;
  box.setAttribute('aria-labelledby', question.id);
  const cancel = () => {
    box.replaceWith(trigger);
    trigger.focus();
  };
  yes.addEventListener('click', opts.onYes);
  no.addEventListener('click', cancel);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  trigger.replaceWith(box);
  no.focus();
}

/**
 * What a run screen keeps out of the console's primary area and rail: details that open in a sheet
 * (the HUD button shows `button` and lends this node to a sheet titled `title`, see screenSheets.ts).
 * In the fallback layout it is shown inline instead. Hidden by CSS, not by `hidden`, so the lending
 * code never has to undo it.
 */
export function sheetStore(title: string, button: string, ...children: Child[]): HTMLElement {
  return el('div', { class: 'sheet-store', 'data-sheet-title': title, 'data-sheet-button': button }, ...children);
}
