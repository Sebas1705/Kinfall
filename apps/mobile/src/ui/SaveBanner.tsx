import { t } from '@kinfall/core/platform/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { useAnnounce } from '../platform/announce';
import { useLang } from '../platform/LangContext';
import { useRunSession } from '../run/useRunSession';
import { useTheme } from '../theme';
import { Button } from './Button';

/** Non-blocking "could not save" warning: once per failure streak, dismissible, gone after a good save. */
export function SaveBanner() {
  const { session, snapshot } = useRunSession();
  const theme = useTheme();
  useLang();
  const warning = snapshot.saveWarning;
  const text = warning ? t('save.failed', { reason: warning.error.replace(/[.\s]+$/, '') }) : '';
  useAnnounce(warning, text);
  if (!warning) return null;
  return (
    <View style={[styles.box, { borderColor: theme.danger, backgroundColor: theme.surface }]} testID="save-warning">
      <Text style={[styles.text, { color: theme.text }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
        {text}
      </Text>
      <Button label={t('save.dismiss')} onPress={() => session.dismissSaveWarning()} testID="save-warning-dismiss" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 2, borderRadius: 10, padding: 12, gap: 8 },
  text: { fontSize: 16 },
});
