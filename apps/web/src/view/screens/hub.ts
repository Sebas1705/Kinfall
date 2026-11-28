// Game hub: one radio-like card per registered game and a Play button for the focused one.
// Arrow keys move the roving focus (updated in place, so DOM focus survives), Enter or Space plays,
// and a "soon" game is aria-disabled: selecting it announces instead of playing.
import { GAMES, findGame } from '@kinfall/core/games/registry';
import type { GameId } from '@kinfall/core/games/registry';
import { t } from '@kinfall/core/platform/i18n';
import { el } from './dom';

export interface HubProps {
  focused: GameId;
  onPlay(id: GameId): void;
  onFocus(id: GameId): void;
  /** A game that is not playable yet was selected; `name` is its localized name. */
  onSoon(name: string): void;
}

export function renderHub(root: HTMLElement, props: HubProps): void {
  let focused = props.focused;
  const cards = GAMES.map((game) => {
    const soon = game.status === 'soon';
    return el(
      'div',
      {
        class: soon ? 'hub-card hub-card--soon' : 'hub-card',
        role: 'radio',
        'data-game': game.id,
        'aria-disabled': soon ? 'true' : undefined,
      },
      el('span', { class: 'hub-card__name' }, t(game.nameKey)),
      // A soon game says so once, in its badge (its tagline is the same words): the card's name reads it once.
      soon ? el('span', { class: 'hub-card__badge' }, t('hub.soon')) : el('span', { class: 'hub-card__tagline' }, t(game.taglineKey)),
    );
  });

  const sync = () => {
    cards.forEach((card, i) => {
      const on = GAMES[i]!.id === focused;
      card.setAttribute('aria-checked', String(on));
      card.tabIndex = on ? 0 : -1;
    });
  };
  const move = (id: GameId) => {
    focused = id;
    sync();
    cards[GAMES.findIndex((g) => g.id === id)]!.focus();
    props.onFocus(id);
  };
  const activate = (id: GameId) => {
    const game = findGame(id);
    if (game.status === 'playable') props.onPlay(id);
    else props.onSoon(t(game.nameKey));
  };

  cards.forEach((card, i) => {
    const id = GAMES[i]!.id;
    card.addEventListener('click', () => {
      move(id);
      if (GAMES[i]!.status === 'soon') props.onSoon(t(GAMES[i]!.nameKey));
    });
    card.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (step !== 0) {
        e.preventDefault();
        move(GAMES[(i + step + GAMES.length) % GAMES.length]!.id);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(id);
      }
    });
  });

  const play = el('button', { type: 'button', class: 'primary', id: 'hub-play' }, t('hub.play'));
  play.addEventListener('click', () => activate(focused));

  sync();
  root.replaceChildren(
    el(
      'div',
      { class: 'screen-primary' },
      el('h2', { class: 'screen-heading', 'data-screen-heading': true, tabindex: '-1' }, t('hub.title')),
      el('div', { class: 'hub-list', role: 'radiogroup', 'aria-label': t('hub.games') }, ...cards),
    ),
    el('div', { class: 'screen-rail' }, play),
  );
}
