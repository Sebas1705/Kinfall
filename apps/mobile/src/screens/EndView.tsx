// End screen of a run: the result, the score and the stats (buildEndModel and runScore, in
// @kinfall/core), like the web's screens/end.ts. "New run" starts again at once from a fresh seed
// (the save is cleared first); "Back to start" clears the save and returns to the title. The
// result is written out in text ("Run won" / "Run lost"); its colour only repeats it.
import { CONTENT } from '@kinfall/core/content';
import { buildEndModel } from '@kinfall/core/models/end';
import { t } from '@kinfall/core/platform/i18n';
import { useEffect, useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { useLang } from '../platform/LangContext';
import { useRunSession } from '../run/useRunSession';
import { useTheme } from '../theme';
import { Button } from '../ui/Button';
import { useLayout } from '../ui/windowSize';
import type { PhaseViewProps } from './RunScreen';

export function EndView({ run, onToTitle, log }: PhaseViewProps) {
  const theme = useTheme();
  const { twoPane } = useLayout();
  useLang();
  const { session } = useRunSession();
  const model = buildEndModel(run, CONTENT);
  const heading = useRef<ComponentRef<typeof Text>>(null);
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

  const result = (
    <>
      <Text
        ref={heading}
        style={[styles.heading, { color: won ? theme.good : theme.danger }]}
        accessibilityRole="header"
        testID="end-heading"
      >
        {model.title}
      </Text>
      <Text style={[styles.note, { color: theme.text }]}>{t('end.canRestart')}</Text>
      <View
        style={[styles.score, { borderColor: theme.border, backgroundColor: theme.surface }]}
        accessible
        accessibilityLabel={`${t('end.score')}: ${model.score}`}
        testID="end-score"
      >
        <Text style={[styles.scoreLabel, { color: theme.text }]}>{t('end.score')}</Text>
        <Text style={[styles.scoreValue, { color: theme.text }]} testID="end-score-value">
          {String(model.score)}
        </Text>
      </View>
    </>
  );
  const stats = (
      <View style={[styles.stats, { borderColor: theme.border, backgroundColor: theme.surface }]} testID="end-stats">
        {model.stats.map((s, i) => (
          <View key={i} style={styles.stat} accessible accessibilityLabel={`${s.label}: ${s.value}`} testID={`end-stat-${i}`}>
            <Text style={[styles.statLabel, { color: theme.muted }]}>{s.label}</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{String(s.value)}</Text>
          </View>
        ))}
      </View>
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
  score: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 10 },
  scoreLabel: { fontSize: 18, fontWeight: '700', flex: 1 },
  scoreValue: { fontSize: 28, fontWeight: '700' },
  stats: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  // The label wraps inside its own column at large text; the value stays on the right of its row.
  stat: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statLabel: { fontSize: 16, flex: 1 },
  statValue: { fontSize: 16, fontWeight: '700', textAlign: 'right' },
});
