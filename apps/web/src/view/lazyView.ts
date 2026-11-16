// A BattleView that loads the real (PixiJS) scene on first use, so the run page does not download it
// before the first battle. Until it is ready, plays resolve at once and the latest state is drawn as
// soon as the scene exists; the controller's sim state is never affected.
import type { BattleState } from '@webgames/core/sim/state';
import type { BattleView } from './battleView';

export function lazyBattleView(load: () => Promise<BattleView>, onUnavailable: (err: unknown) => void): BattleView {
  let real: BattleView | null = null;
  let started = false;
  let last: BattleState | null = null;

  const ensure = () => {
    if (started) return;
    started = true;
    load().then(
      (view) => {
        real = view;
        if (last) view.render(last);
      },
      (err: unknown) => onUnavailable(err),
    );
  };

  return {
    render(state) {
      last = state;
      if (real) real.render(state);
      else ensure();
    },
    play(events, opts) {
      return real ? real.play(events, opts) : Promise.resolve();
    },
    destroy() {
      real?.destroy();
    },
  };
}
