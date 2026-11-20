import { t } from '@kinfall/core/platform/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { useAnnounce } from '../platform/announce';
import { useLang } from '../platform/LangContext';
import { useRunSession } from '../run/useRunSession';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Plate, usePlateText } from './PixelFrame';

/** Non-blocking "could not save" warning: once per failure streak, dismissible, gone after a good save. */
export function SaveBanner() {
  const { session, snapshot } = useRunSession();
  const theme = useTheme();
  const ink = usePlateText();
  useLang();
  const warning = snapshot.saveWarning;
  const text = warning ? t('save.failed', { reason: warning.error.replace(/[.\s]+$/, '') }) : '';
  useAnnounce(warning, text);
  if (!warning) return null;
  return (
    <Plate style={styles.box} testID="save-warning">
      {/* Warning stripe; the words say what happened. */}
      <View style={[styles.stripe, { backgroundColor: theme.danger }]} />
      <Text style={[styles.text, { color: ink.text }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
        {text}
      </Text>
      <Button label={t('save.dismiss')} onPress={() => session.dismissSaveWarning()} testID="save-warning-dismiss" />
    </Plate>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, paddingLeft: 22 },
  stripe: { position: 'absolute', left: 12, top: 12, bottom: 12, width: 5 },
  text: { fontSize: 16 },
});
