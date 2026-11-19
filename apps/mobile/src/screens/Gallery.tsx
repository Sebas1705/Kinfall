import { CONTENT } from '@kinfall/core/content';
import { speciesName, t, type StringKey } from '@kinfall/core/platform/i18n';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CreatureSprite } from '../art/CreatureSprite';
import { ElementIcon } from '../art/ElementIcon';
import { useLang } from '../platform/LangContext';
import { useTheme } from '../theme';

const SCALES = [2, 3, 4] as const;

/**
 * Dev gallery: every species with its elements and its sprite at scales 2, 3 and 4, to check that
 * the pixels are crisp and the colours match the web art. Strings outside the core tables are
 * throwaway; names come from core's i18n.
 */
export default function Gallery({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  useLang(); // names follow the language
  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} testID="gallery">
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          Gallery
        </Text>
        <Pressable
          style={[styles.back, { borderColor: theme.border }]}
          onPress={onBack}
          accessibilityRole="button"
          testID="gallery-back"
        >
          <Text style={[styles.backText, { color: theme.text }]}>Back</Text>
        </Pressable>
        {CONTENT.species.map((sp) => (
          <View key={sp.id} style={[styles.card, { borderColor: theme.border }]} testID={`gallery-${sp.id}`}>
            <Text style={[styles.name, { color: theme.text }]}>{speciesName(sp)}</Text>
            <View style={styles.elements}>
              {sp.elements.map((el) => (
                <View key={el} style={styles.element}>
                  <ElementIcon element={el} scale={3} />
                  <Text style={[styles.elementText, { color: theme.muted }]}>{t(`element.${el}` as StringKey)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.sprites}>
              {SCALES.map((scale) => (
                <CreatureSprite key={scale} species={sp} scale={scale} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: 16, paddingTop: 56, paddingBottom: 48, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  back: {
    minHeight: 48,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 6,
  },
  backText: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  name: { fontSize: 18, fontWeight: '600' },
  elements: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  element: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  elementText: { fontSize: 16, flexShrink: 1 },
  sprites: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 },
});
