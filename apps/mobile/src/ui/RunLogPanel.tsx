import { CONTENT } from '@webgames/core/content';
import { t } from '@webgames/core/platform/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { useAnnounce } from '../platform/announce';
import { useLang } from '../platform/LangContext';
import { runLogContext, runLogLines } from '../run/session';
import { useRunSession } from '../run/useRunSession';
import { useTheme } from '../theme';

/** Lines shown on screen; the session keeps up to RUN_LOG_MAX. */
export const RUN_LOG_VISIBLE = 8;

/**
 * The run log: the last lines, oldest first. Only the lines of the latest action sit in the polite
 * live region, so a screen reader announces what is new and never rereads the whole log (after a
 * resume or a language change nothing is fresh, so nothing is announced).
 */
export function RunLogPanel() {
  const { snapshot } = useRunSession();
  const theme = useTheme();
  useLang();
  // The session keeps only events that have a line, so lines and events line up one to one.
  const lines = runLogLines(snapshot.log, runLogContext(CONTENT, snapshot.run));
  const fresh = Math.min(snapshot.logFresh, lines.length);
  const older = lines.slice(0, lines.length - fresh).slice(-Math.max(0, RUN_LOG_VISIBLE - fresh));
  const latest = lines.slice(lines.length - fresh);
  // iOS: the fresh lines once per action (the log array is new only when an action added lines).
  useAnnounce(fresh > 0 ? snapshot.log : null, latest.join(' '));
  if (lines.length === 0) return null;
  const lineStyle = [styles.line, { color: theme.text }];
  return (
    <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]} testID="run-log">
      <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
        {t('map.log')}
      </Text>
      {older.map((line, i) => (
        <Text key={`o${i}`} style={[lineStyle, { color: theme.muted }]} testID="run-log-line">
          {line}
        </Text>
      ))}
      <View accessibilityLiveRegion="polite" testID="run-log-fresh">
        {latest.map((line, i) => (
          <Text key={`n${i}`} style={lineStyle} testID="run-log-line">
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  line: { fontSize: 15 },
});
