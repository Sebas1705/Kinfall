// The Run route: one screen that draws the current run phase. The map is built (7a); battle, event
// and end phases show a marked placeholder until 7b/7c plug their screens into `PHASE_VIEWS`.
// Android back never leaves silently: it opens the abandon confirmation (and a second back closes it).
import { t } from '@webgames/core/platform/i18n';
import type { RunState } from '@webgames/core/sim/run/types';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { BackHandler, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { useLang } from '../platform/LangContext';
import { phaseHeading, type RunView } from '../run/session';
import { useRunSession } from '../run/useRunSession';
import { useTheme } from '../theme';
import { ConfirmPanel } from '../ui/ConfirmPanel';
import { RunLogPanel } from '../ui/RunLogPanel';
import { SaveBanner } from '../ui/SaveBanner';
import { Screen } from '../ui/Screen';
import { MapView } from './MapView';

/** Props every phase view gets. */
export interface PhaseViewProps {
  run: RunState;
}

/** A phase without its own screen yet: named after the node, with the run log; no back button (web T12). */
export function PhasePlaceholder({ run }: PhaseViewProps) {
  const theme = useTheme();
  return (
    <View style={[styles.placeholder, { borderColor: theme.border, backgroundColor: theme.surface }]} testID="phase-placeholder">
      <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header" testID="placeholder-heading">
        {phaseHeading(run)}
      </Text>
      <Text style={[styles.text, { color: theme.muted }]}>{t('run.placeholder')}</Text>
    </View>
  );
}

/** Screens of the non-map phases; 7b (battle) and 7c (event, end) replace these entries. */
export const PHASE_VIEWS: Record<Exclude<RunView, 'map'>, ComponentType<PhaseViewProps>> = {
  battle: PhasePlaceholder,
  event: PhasePlaceholder,
  end: PhasePlaceholder,
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

  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;

  const askAbandon = useCallback(() => setConfirming(true), []);

  // The confirmation sits at the end of the screen, next to where the Abandon button was. While it
  // is open every content size change (it appearing, its text wrapping at large font scales)
  // scrolls it fully into view.
  const onContentSizeChange = useCallback(() => {
    if (confirmingRef.current) scroll.current?.scrollToEnd({ animated: false });
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirmingRef.current) setConfirming(false);
      else askAbandon();
      return true; // handled: never pop the Run route silently
    });
    return () => sub.remove();
  }, [askAbandon]);

  const onAbandon = () => {
    setConfirming(false);
    void session.abandon();
    onExit();
  };

  if (!run || !view) return <Screen testID="run-screen-empty">{null}</Screen>;
  const Phase = view === 'map' ? null : PHASE_VIEWS[view];

  return (
    <Screen ref={scroll} testID={`run-${view}`} onContentSizeChange={onContentSizeChange}>
      <SaveBanner />
      {Phase ? (
        <Phase run={run} />
      ) : (
        <MapView run={run} trail={snapshot.trail} onPick={(id) => session.pickNode(id)} onAbandon={askAbandon} confirming={confirming} />
      )}
      <RunLogPanel />
      {confirming ? (
        <ConfirmPanel
          question={t('map.abandonConfirm')}
          yes={t('map.abandonYes')}
          no={t('map.abandonNo')}
          onYes={onAbandon}
          onNo={() => setConfirming(false)}
          testID="abandon-confirm"
        />
      ) : null}
      <Text style={[styles.seed, { color: theme.muted }]} testID="run-seed">
        {t('battle.seed', { seed: run.seed })}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 10, padding: 16, gap: 8 },
  heading: { fontSize: 24, fontWeight: '700' },
  text: { fontSize: 16 },
  seed: { fontSize: 14 },
});
