// Run log: the localised lines of run events (souls, losses, recruits, evolutions...) shown on the
// map, event and end screens. Events are kept, not lines, so a language change can rebuild it.
import type { Content } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import { runEventLine, speciesName } from '@kinfall/core/platform/i18n';
import type { RunEvent } from '@kinfall/core/sim/run/types';
import { RUN_LOG_MAX } from './runUi';
import type { RunUi } from './runUi';

export interface RunLog {
  /** Appends the lines of `events` (events without text are skipped). */
  add(events: RunEvent[]): void;
  /** Empties the log (new run, resume). */
  reset(): void;
  /** Rebuilds every line in the current language without announcing them. */
  refresh(): void;
  /** Shows the panel on screens that want it; an empty log stays hidden. */
  show(wanted: boolean): void;
}

export function createRunLog(content: Content, ui: Pick<RunUi, 'setRunLog' | 'appendRunLog' | 'showRunLog'>): RunLog {
  let events: RunEvent[] = [];
  let wanted = false;
  const ctx = {
    species: (id: string) => speciesName(lookup(content).species(id)),
    // The node type label is all a log line needs (runEventLine falls back to it).
    node: () => null,
  };
  const lines = (list: RunEvent[]) => list.map((e) => runEventLine(e, ctx)).filter((l): l is string => l !== null);
  const sync = () => ui.showRunLog(wanted && events.length > 0);

  return {
    add(list) {
      const shown = list.filter((e) => runEventLine(e, ctx) !== null);
      if (shown.length === 0) return;
      events = [...events, ...shown].slice(-RUN_LOG_MAX);
      sync();
      ui.appendRunLog(lines(shown));
    },
    reset() {
      events = [];
      ui.setRunLog([]);
      sync();
    },
    refresh() {
      ui.setRunLog(lines(events));
    },
    show(on) {
      wanted = on;
      sync();
    },
  };
}
