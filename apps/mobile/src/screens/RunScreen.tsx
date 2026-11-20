// The Run route: one screen that draws the current run phase: the map, a battle, an event
// (recruit, shrine, cache, mystery) or the end of the run (`PHASE_VIEWS`). Android back never
// leaves a run silently: it opens the abandon confirmation (and a second back closes it). On the
// end screen the run is already over, so back goes straight to the title, like "Back to start".
//
// A battle's final turn moves the run on at once (it is applied and saved before its animation), so
// the battle screen stays up until that turn has played; then the next phase shows, with the run log
// lines of the battle's end (souls, losses) as its fresh lines.
import { zoneIdOf } from '@kinfall/core/art/scene';
import { t } from '@kinfall/core/platform/i18n';
import type { RunState } from '@kinfall/core/sim/run/types';
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { BackHandler, StyleSheet, Text, type ScrollViewInstance } from 'react-native';

import { useLang } from '../platform/LangContext';
import type { RunView } from '../run/session';
import { useRunSession } from '../run/useRunSession';
import { useTheme } from '../theme';
import { ConfirmPanel } from '../ui/ConfirmPanel';
import { ArtZoneContext } from '../ui/frames';
import { RunLogPanel } from '../ui/RunLogPanel';
import { SaveBanner } from '../ui/SaveBanner';
import { Screen } from '../ui/Screen';
import { BattleView } from './BattleView';
import { EndView } from './EndView';
import { EventView } from './EventView';
import { MapView } from './MapView';

/** Props every phase view gets. */
export interface PhaseViewProps {
  run: RunState;
  /** The abandon confirmation is open (views then leave screen-reader focus alone). */
  confirming: boolean;
  /** Clears the save and leaves for the title (the end screen's "Back to start"). */
  onToTitle: () => void;
  /** The abandon confirmation while `confirming` (null otherwise); event views show it by their choices. */
  confirmPanel?: ReactNode;
  /** The run log panel, placed by the view (below the content, or in the side pane of two panes). */
  log?: ReactNode;
}

/** Screens of the event and end phases. Like the web, they have no abandon button (Android back still asks). */
export const PHASE_VIEWS: Record<Exclude<RunView, 'map' | 'battle'>, ComponentType<PhaseViewProps>> = {
  event: EventView,
  end: EndView,
};

export interface RunScreenProps {
  /** Leaves the Run route (after an abandon). */
  onExit: () => void;
}

export function RunScreen({ onExit }: RunScreenProps) {
  const { session, snapshot } = useRunSession();
  useLang();
  const theme = useTheme();
  const [confirming, setConfirming] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const { run, view } = snapshot;
  /** The run as the battle screen opened it; kept until the battle's last turn has played. */
  const [battleRun, setBattleRun] = useState<RunState | null>(null);
  if (view === 'battle' && run && battleRun === null) setBattleRun(run);
  else if (battleRun !== null && (!run || run.seed !== battleRun.seed)) setBattleRun(null);
  const onBattleEnd = useCallback(() => setBattleRun(null), []);

  const inBattle = battleRun !== null;
  const shownView: RunView | null = inBattle ? 'battle' : view;

  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;
  const viewRef = useRef(shownView);
  viewRef.current = shownView;

  const askAbandon = useCallback(() => setConfirming(true), []);

  /** Drops the run and its save, then leaves for the title. */
  const onAbandon = useCallback(() => {
    setConfirming(false);
    void session.abandon();
    onExit();
  }, [session, onExit]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirmingRef.current) setConfirming(false);
      else if (viewRef.current === 'end') onAbandon();
      else askAbandon();
      return true; // handled: never pop the Run route silently
    });
    return () => sub.remove();
  }, [askAbandon, onAbandon]);

  // A new phase starts at the top of the screen (its heading), not where the last one was scrolled.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [shownView]);

  if (!run || !shownView) return <Screen testID="run-screen-empty">{null}</Screen>;

  // The confirmation shows where its trigger was: in place of the Abandon button (map, battle), or
  // by the choices of an event; it scrolls itself into view (ConfirmPanel).
  const confirmPanel = confirming ? (
    <ConfirmPanel
      question={t('map.abandonConfirm')}
      yes={t('map.abandonYes')}
      no={t('map.abandonNo')}
      onYes={onAbandon}
      onNo={() => setConfirming(false)}
      testID="abandon-confirm"
    />
  ) : null;
  const seedLine = (
    <Text style={[styles.seed, { color: theme.muted }]} testID="run-seed">
      {t('battle.seed', { seed: run.seed })}
    </Text>
  );

  // The battle draws its own screen (its layout may pin the choices at the bottom) and its own
  // log; the run log comes back with the next phase.
  // The frames' gems take the accent of the run's zone.
  const zone = zoneIdOf(run.zone);
  if (battleRun) {
    return (
      <ArtZoneContext.Provider value={zone}>
        <BattleView
          run={battleRun}
          onEnd={onBattleEnd}
          onAbandon={askAbandon}
          confirming={confirming}
          confirmPanel={confirmPanel}
          header={<SaveBanner />}
          trailer={seedLine}
          scrollRef={scroll}
          testID="run-battle"
        />
      </ArtZoneContext.Provider>
    );
  }

  const log = <RunLogPanel />;
  let body: ReactNode;
  if (shownView === 'map') {
    body = (
      <MapView
        run={run}
        trail={snapshot.trail}
        onPick={(id) => session.pickNode(id)}
        onAbandon={askAbandon}
        confirming={confirming}
        confirmPanel={confirmPanel}
        log={log}
      />
    );
  } else if (shownView !== 'battle') {
    const Phase = PHASE_VIEWS[shownView];
    body = <Phase run={run} confirming={confirming} onToTitle={onAbandon} confirmPanel={confirmPanel} log={log} />;
  }

  return (
    <ArtZoneContext.Provider value={zone}>
      <Screen ref={scroll} testID={`run-${shownView}`}>
        <SaveBanner />
        {body}
        {seedLine}
      </Screen>
    </ArtZoneContext.Provider>
  );
}

const styles = StyleSheet.create({
  seed: { fontSize: 14 },
});
