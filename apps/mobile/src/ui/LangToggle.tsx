import { setLang, t, type Lang } from '@kinfall/core/platform/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLang } from '../platform/LangContext';
import { TOUCH, useTheme } from '../theme';

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
          <Pressable
            key={code}
            onPress={() => setLang(code)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={name}
            testID={`language-${code}`}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: on ? theme.accent : theme.surface,
                borderColor: pressed ? theme.focus : on ? theme.accent : theme.outline,
              },
            ]}
          >
            <Text style={[styles.code, { color: on ? theme.accentText : theme.text }]}>{code.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Never wraps inside: the whole toggle moves to its own line when the heading needs the room.
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15 },
  option: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: { fontSize: 16, fontWeight: '700' },
});
