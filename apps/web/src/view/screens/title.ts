// Title screen: continue a saved run, or start a new one from a seed and a starter.
// The random seed uses crypto.getRandomValues here, in the UI layer only; the sim never sees entropy.
import type { Content } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import { speciesName, t } from '@kinfall/core/platform/i18n';
import type { LoadResult } from '@kinfall/core/platform/runStorage';
import { creatureCanvas } from './art';
import { SEED_MAX, cleanSeed, seedFromRandom } from '@kinfall/core/platform/seed';
import { confirmInline, el, sheetStore } from './dom';

export { SEED_ALPHABET, SEED_MAX } from '@kinfall/core/platform/seed';

export interface TitleProps {
  content: Content;
  seed: string;
  save: LoadResult;
  onStart(seed: string, starterId: string): void;
  onContinue(): void;
  onDiscard(): void;
  /** Keep the seed and starter already typed or chosen (re-render after a language change). */
  preserveInput?: boolean;
}

/** An 8-character code from SEED_ALPHABET, without modulo bias. */
export function randomSeed(): string {
  return seedFromRandom((bytes) => crypto.getRandomValues(bytes));
}

/** The `?seed=` value (trimmed, at most 32 characters) or, when missing or blank, a random code. */
export function initialSeed(search: string, random: () => string = randomSeed): string {
  return cleanSeed(new URLSearchParams(search).get('seed')) || random();
}

function hintKeyOf(element: string | undefined) {
  return element === 'ember' || element === 'thorn' || element === 'tide' ? (`title.starterHint.${element}` as const) : null;
}

function starterCard(content: Content, id: string, checked: boolean): HTMLElement {
  const sp = lookup(content).species(id);
  const canvas = creatureCanvas(sp, 'starter-art');
  const hintKey = hintKeyOf(sp.elements[0]);
  const hintId = `starter-hint-${id}`;
  const input = el('input', {
    type: 'radio',
    name: 'starter',
    value: id,
    id: `starter-${id}`,
    checked,
    'aria-describedby': hintKey ? hintId : undefined,
  });
  input.checked = checked;
  return el(
    'label',
    { class: 'starter-card', for: input.id },
    input,
    canvas,
    el(
      'span',
      { class: 'starter-text' },
      el('span', { class: 'starter-name' }, speciesName(sp)),
      el('span', { class: 'starter-element' }, sp.elements.map((e) => t(`element.${e}`)).join(' / ')),
      hintKey ? el('span', { class: 'starter-hint', id: hintId }, t(hintKey)) : null,
    ),
  );
}

/** The one-line hint under the starter strip (the console hides the hint inside each card). */
function hintLine(content: Content, chosen: string): HTMLElement {
  const line = el('p', { class: 'starter-hint-line' });
  const set = (id: string) => {
    const key = hintKeyOf(lookup(content).species(id).elements[0]);
    line.textContent = key ? t(key) : '';
  };
  set(chosen);
  line.addEventListener('kinfall:starter', (e) => set((e as CustomEvent<string>).detail));
  return line;
}

function saveNotices(props: TitleProps): HTMLElement[] {
  const { save } = props;
  if (save.kind === 'unavailable') return [el('p', { class: 'notice' }, t('title.savesUnavailable'))];
  if (save.kind !== 'corrupt') return [];
  const discard = el('button', { type: 'button', class: 'secondary', 'data-action': 'discard' }, t('title.discard'));
  discard.addEventListener('click', () =>
    confirmInline(discard, {
      question: t('title.discardConfirm'),
      yes: t('title.discard'),
      no: t('title.discardCancel'),
      yesAction: 'discard-yes',
      noAction: 'discard-cancel',
      onYes: props.onDiscard,
    }),
  );
  return [el('div', { class: 'notice notice--warn' }, el('p', {}, t('title.corrupt', { reason: save.error })), discard)];
}

export function renderTitle(host: HTMLElement, props: TitleProps): void {
  const prevSeed = host.querySelector<HTMLInputElement>('input[name="seed"]')?.value;
  const prevStarter = host.querySelector<HTMLInputElement>('input[name="starter"]:checked')?.value;
  const keep = props.preserveInput === true;
  const starters = props.content.starters;
  const chosen = keep && prevStarter && starters.includes(prevStarter) ? prevStarter : starters[0]!;

  const cont = el('button', { type: 'button', class: 'primary', 'data-action': 'continue', disabled: props.save.kind !== 'ok' }, t('title.continue'));
  cont.addEventListener('click', () => props.onContinue());

  const seed = el('input', {
    type: 'text',
    name: 'seed',
    id: 'title-seed',
    maxlength: String(SEED_MAX),
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-describedby': 'title-seed-hint',
  });
  seed.value = keep && prevSeed !== undefined ? prevSeed : cleanSeed(props.seed);

  const line = hintLine(props.content, chosen);
  // One form around the whole screen: the starters (primary region), the buttons (rail) and the seed
  // field (inside the options sheet while it is open) all belong to it, wherever they sit.
  const form = el(
    'form',
    { class: 'title-form', novalidate: true },
    el(
      'div',
      { class: 'screen-primary' },
      el('h2', { class: 'screen-heading', 'data-screen-heading': true, tabindex: '-1' }, t('screen.title')),
      // The lazy scene art puts the hero (zone scene, starter and wordmark) after the heading.
      el(
        'fieldset',
        { class: 'starters' },
        el('legend', {}, t('title.starter')),
        el('div', { class: 'starter-list' }, ...starters.map((id) => starterCard(props.content, id, id === chosen))),
        line,
      ),
    ),
    el(
      'div',
      { class: 'screen-rail' },
      ...saveNotices(props),
      cont,
      el('button', { type: 'submit', class: 'primary', 'data-action': 'new-run' }, t('title.newRun')),
    ),
    sheetStore(
      t('title.options'),
      t('title.optionsOpen'),
      el(
        'div',
        { class: 'field' },
        el('label', { for: seed.id }, t('title.seed')),
        seed,
        el('p', { class: 'field-hint', id: 'title-seed-hint' }, t('title.seedHint')),
      ),
      el('p', { class: 'saves-note' }, t('title.savesNote')),
    ),
  );
  form.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.name === 'starter') line.dispatchEvent(new CustomEvent('kinfall:starter', { detail: input.value }));
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let value = cleanSeed(seed.value);
    if (!value) {
      value = randomSeed();
      seed.value = value;
    }
    const starter = form.querySelector<HTMLInputElement>('input[name="starter"]:checked')?.value ?? starters[0]!;
    props.onStart(value, starter);
  });

  host.replaceChildren(form);
}
