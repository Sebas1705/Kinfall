import { CONTENT } from '@kinfall/core/content';
import { t } from '@kinfall/core/platform/i18n';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

import { useAnnounce } from '../platform/announce';
import { useLang } from '../platform/LangContext';
import { runLogContext, runLogLines } from '../run/session';
import { useRunSession } from '../run/useRunSession';
import { MESSAGE_BORDER, MESSAGE_SIZE } from '../screens/battleMetrics';
import { useTheme } from '../theme';
import { Plate, usePlateText } from './PixelFrame';

/** Lines shown on screen; the session keeps up to RUN_LOG_MAX. */
export const RUN_LOG_VISIBLE = 8;

/** The run log as text lines, oldest first: the last RUN_LOG_VISIBLE, and how many of them are fresh. */
function useRunLogLines(): { lines: string[]; fresh: number; log: unknown } {
  const { snapshot } = useRunSession();
  useLang();
  // The session keeps only events that have a line, so lines and events line up one to one.
  const lines = runLogLines(snapshot.log, runLogContext(CONTENT, snapshot.run));
  return { lines, fresh: Math.min(snapshot.logFresh, lines.length), log: snapshot.log };
}

/**
 * The newest lines of the run log as one message line of the console layout: a polite live region
 * that only holds the lines of the latest action, so a screen reader announces what is new and never
 * rereads the log (after a resume or a language change nothing is fresh, so nothing is announced and
 * the last line shows muted). It sits in Screen's `overlay`, OUTSIDE the part a sheet hides; its text is
 * capped at `landscape`: one line, else two (battleMetrics.messageHeight is its height).
 */
export function RunLogMessage({ landscape }: { landscape: boolean }) {
  const theme = useTheme();
  const { lines, fresh, log } = useRunLogLines();
  const latest = lines.slice(lines.length - fresh).join(' ');
  // iOS: the fresh lines once per action (the log array is new only when an action added lines).
  useAnnounce(fresh > 0 ? log : null, latest);
  const last = lines.length > 0 ? lines[lines.length - 1]! : '';
  const shown = latest || last;
  const count = landscape ? 1 : 2;
  return (
    <View
      style={[styles.message, shown ? { backgroundColor: theme.surface, borderColor: theme.border, borderTopWidth: MESSAGE_BORDER } : null]}
      testID="run-log-message"
    >
      <View accessibilityLiveRegion="polite" testID="run-log-fresh">
        {latest ? (
          <AppText style={[styles.messageText, { color: theme.text }]} numberOfLines={count} testID="run-log-message-text">
            {latest}
          </AppText>
        ) : null}
      </View>
      {!latest && last ? (
        <AppText style={[styles.messageText, { color: theme.muted }]} numberOfLines={count} testID="run-log-message-text">
          {last}
        </AppText>
      ) : null}
    </View>
  );
}

/** The run log in a sheet: the last lines, oldest first (the live announcement is RunLogMessage's job). */
export function RunLogPanel() {
  const ink = usePlateText();
  const { lines } = useRunLogLines();
  if (lines.length === 0) return null;
  return (
    <Plate style={styles.panel} testID="run-log">
      <AppText style={[styles.heading, { color: ink.text }]} accessibilityRole="header">
        {t('map.log')}
      </AppText>
      {lines.slice(-RUN_LOG_VISIBLE).map((line, i) => (
        <AppText key={i} style={[styles.line, { color: ink.text }]} testID="run-log-line">
          {line}
        </AppText>
      ))}
    </Plate>
  );
}

const styles = StyleSheet.create({
  message: { paddingHorizontal: 8, overflow: 'hidden' },
  messageText: { fontSize: MESSAGE_SIZE },
  panel: { gap: 4 },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  line: { fontSize: 15 },
});
