// End screen of a run: the result, the score and the stats (buildEndModel and runScore, in
// @kinfall/core), like the web's screens/end.ts. "New run" starts again at once from a fresh seed
// (the save is cleared first); "Back to start" clears the save and returns to the title. The
// result is written out in text ("Run won" / "Run lost"); its colour only repeats it.
import { CONTENT } from '@kinfall/core/content';
import { buildEndModel } from '@kinfall/core/models/end';
import { t } from '@kinfall/core/platform/i18n';
import { useEffect, useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '../ui/AppText';

import { EndScene } from '../art/EndScene';

import { useLang } from '../platform/LangContext';
import { useReducedMotion } from '../platform/motionSetting';
import { useRunSession } from '../run/useRunSession';
import { useTheme } from '../theme';
import { Button } from '../ui/Button';
import { Plate, usePlateText } from '../ui/PixelFrame';
import { useLayout } from '../ui/windowSize';
import type { PhaseViewProps } from './RunScreen';

export function EndView({ run, onToTitle, log }: PhaseViewProps) {
  const theme = useTheme();
  const { twoPane, width: widthClass } = useLayout();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const ink = usePlateText();
  useLang();
  const { session } = useRunSession();
  const model = buildEndModel(run, CONTENT);
  const heading = useRef<ComponentRef<typeof AppText>>(null);
  /** One way out per end screen: a double tap never starts two runs. */
  const left = useRef(false);

  // Arrival (also after a resume): the screen reader starts at the result.
  useEffect(() => {
    if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
  }, []);

  if (!model) return null;
  const won = model.result === 'won';

  const once = (fn: () => void) => () => {
    if (left.current) return;
    left.current = true;
    fn();
  };

  const scene = (
    <EndScene
      zone={run.zone}
      seed={run.seed}
      won={won}
      title={t(won ? 'result.victory' : 'result.defeat')}
      lead={run.party[0]?.speciesId ?? null}
      reducedMotion={reduceMotion}
      maxHeight={Math.max(140, height * 0.32)}
      initialWidth={twoPane ? width / 2 - 40 : width}
      style={!twoPane && widthClass === 'compact' ? styles.bleed : null}
    />
  );
  const result = (
    <>
      <AppText
        ref={heading}
        style={[styles.heading, { color: won ? theme.good : theme.danger }]}
        accessibilityRole="header"
        testID="end-heading"
      >
        {model.title}
      </AppText>
      <AppText style={[styles.note, { color: theme.text }]}>{t('end.canRestart')}</AppText>
      <Plate accessible accessibilityLabel={`${t('end.score')}: ${model.score}`} testID="end-score">
        <View style={styles.score}>
          <AppText style={[styles.scoreLabel, { color: ink.text }]}>{t('end.score')}</AppText>
          <AppText style={[styles.scoreValue, { color: ink.text }]} testID="end-score-value">
            {String(model.score)}
          </AppText>
        </View>
      </Plate>
    </>
  );
  const stats = (
      <Plate style={styles.stats} testID="end-stats">
        {model.stats.map((s, i) => (
          <View key={i} style={styles.stat} accessible accessibilityLabel={`${s.label}: ${s.value}`} testID={`end-stat-${i}`}>
            <AppText style={[styles.statLabel, { color: ink.muted }]}>{s.label}</AppText>
            <AppText style={[styles.statValue, { color: ink.text }]}>{String(s.value)}</AppText>
          </View>
        ))}
      </Plate>
  );
  const buttons = (
    <>
      <Button label={t('end.newRun')} variant="primary" onPress={once(() => session.newRun())} testID="end-new-run" />
      <Button label={t('end.toTitle')} onPress={once(onToTitle)} testID="end-to-title" />
    </>
  );

  if (twoPane) {
    return (
      <View style={[styles.end, styles.panes]} testID="end-screen">
        <View style={[styles.pane, styles.paneMain]}>
          {scene}
          {result}
          {buttons}
        </View>
        <View style={[styles.pane, styles.paneSide]}>
          {stats}
          {log}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.end} testID="end-screen">
      {scene}
      {result}
      {stats}
      {buttons}
      {log}
    </View>
  );
}

const styles = StyleSheet.create({
  end: { gap: 16 },
  panes: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  pane: { gap: 16, minWidth: 0 },
  paneMain: { flex: 1 },
  paneSide: { flex: 1 },
  heading: { fontSize: 28, fontWeight: '700' },
  note: { fontSize: 16 },
  bleed: { marginHorizontal: -16 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreLabel: { fontSize: 18, fontWeight: '700', flex: 1 },
  scoreValue: { fontSize: 28, fontWeight: '700' },
  stats: { gap: 8 },
  // The label wraps inside its own column at large text; the value stays on the right of its row.
  stat: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statLabel: { fontSize: 16, flex: 1 },
  statValue: { fontSize: 16, fontWeight: '700', textAlign: 'right' },
});
