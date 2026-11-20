import { setLang, t, type Lang } from '@kinfall/core/platform/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { useLang } from '../platform/LangContext';
import { useTheme } from '../theme';
import { FramePressable } from './PixelFrame';

const LANGS: Array<{ code: Lang; name: string }> = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
];

/** ES/EN switch. The choice persists through installMobileI18n (AsyncStorage `webgames.lang`). */
export function LangToggle() {
  const lang = useLang();
  const theme = useTheme();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('settings.language')} testID="lang-toggle">
      <Text style={[styles.label, { color: theme.muted }]} importantForAccessibility="no">
        {t('settings.language')}
      </Text>
      {LANGS.map(({ code, name }) => {
        const on = code === lang;
        return (
          // The chosen language wears the plate (and its state is the radio's "checked").
          <FramePressable
            key={code}
            onPress={() => setLang(code)}
            kind={on ? 'plate' : 'button'}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={name}
            testID={`language-${code}`}
            padX={2}
            style={styles.option}
          >
            {({ textColor }) => <Text style={[styles.code, { color: textColor }, on && styles.on]}>{code.toUpperCase()}</Text>}
          </FramePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Never wraps inside: the whole toggle moves to its own line when the heading needs the room.
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15 },
  option: { alignItems: 'center' },
  code: { fontSize: 16, fontWeight: '600' },
  on: { fontWeight: '800', textDecorationLine: 'underline' },
});
