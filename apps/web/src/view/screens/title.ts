// Title screen: continue a saved run, or start a new one from a seed and a starter.
// The random seed uses crypto.getRandomValues here, in the UI layer only; the sim never sees entropy.
import type { Content } from '@webgames/core/content';
import { lookup } from '@webgames/core/content/lookup';
import { speciesName, t } from '@webgames/core/platform/i18n';
import type { LoadResult } from '@webgames/core/platform/runStorage';
import { creatureCanvas } from './art';
import { confirmInline, el } from './dom';

/** No 0/O, 1/I/L: easy to read aloud and to type back. */
export const SEED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SEED_MAX = 32;
const SEED_LENGTH = 8;

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
  const n = SEED_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  const bytes = new Uint8Array(16);
  while (out.length < SEED_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) if (b < limit && out.length < SEED_LENGTH) out += SEED_ALPHABET[b % n];
  }
  return out;
}

function cleanSeed(raw: string | null | undefined): string {
  return (raw ?? '').trim().slice(0, SEED_MAX);
}

/** The `?seed=` value (trimmed, at most 32 characters) or, when missing or blank, a random code. */
export function initialSeed(search: string, random: () => string = randomSeed): string {
  return cleanSeed(new URLSearchParams(search).get('seed')) || random();
}

function starterCard(content: Content, id: string, checked: boolean): HTMLElement {
  const sp = lookup(content).species(id);
  const element = sp.elements[0];
  const canvas = creatureCanvas(sp, 'starter-art');
  const input = el('input', { type: 'radio', name: 'starter', value: id, id: `starter-${id}`, checked });
  input.checked = checked;
  const hintKey = element === 'ember' || element === 'thorn' || element === 'tide' ? (`title.starterHint.${element}` as const) : null;
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
      hintKey ? el('span', { class: 'starter-hint' }, t(hintKey)) : null,
    ),
  );
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
  const chosen = keep && prevStarter && starters.includes(prevStarter) ? prevStarter : starters[0];

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

  const form = el(
    'form',
    { class: 'title-form', novalidate: true },
    el(
      'div',
      { class: 'field' },
      el('label', { for: seed.id }, t('title.seed')),
      seed,
      el('p', { class: 'field-hint', id: 'title-seed-hint' }, t('title.seedHint')),
    ),
    el(
      'fieldset',
      { class: 'starters' },
      el('legend', {}, t('title.starter')),
      el('div', { class: 'starter-list' }, ...starters.map((id) => starterCard(props.content, id, id === chosen))),
    ),
    el('button', { type: 'submit', class: 'primary', 'data-action': 'new-run' }, t('title.newRun')),
  );
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

  host.replaceChildren(
    el('h2', { class: 'screen-heading', 'data-screen-heading': true, tabindex: '-1' }, t('screen.title')),
    ...saveNotices(props),
    el('div', { class: 'button-row' }, cont),
    form,
    el('p', { class: 'saves-note' }, t('title.savesNote')),
  );
}
