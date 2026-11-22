// The console layout's top bar: the zone and node (or the app title), the party as chips with an
// HP cue written out as text, and the Settings button (48dp). The sheet behind the button belongs
// to the caller (`onSettings`). In console mode it is exactly the contract's HUD height; in the
// fallback it grows with the text instead of clipping.
import type { PartyRow } from '@kinfall/core/models/party';
import type { ScreenId } from '@kinfall/core/layout/spec';
import { t } from '@kinfall/core/platform/i18n';
import { Pressable, StyleSheet, View } from 'react-native';

import { useLang } from '../platform/LangContext';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { useLayoutSpec } from './useLayoutSpec';

export interface HudProps {
  screen: ScreenId;
  onSettings: () => void;
  /** Party members of the run state, in order. */
  party?: PartyRow[];
  /** Zone and node, e.g. "Ashen Marsh 3/7"; the app title when omitted. */
  zoneLabel?: string;
}

export function Hud({ screen, onSettings, party, zoneLabel }: HudProps) {
  useLang();
  const theme = useTheme();
  const spec = useLayoutSpec(screen);
  const height = spec.regions.hud.height;
  const fixed = spec.mode === 'console';
  return (
    <View
      style={[styles.bar, fixed ? { height } : { minHeight: height }, { borderColor: theme.border, backgroundColor: theme.surface }]}
      testID="hud"
    >
      <AppText style={[styles.title, { color: theme.text }]} numberOfLines={fixed ? 1 : undefined} accessibilityRole="header" testID="hud-title">
        {zoneLabel ?? t('app.title')}
      </AppText>
      <View style={styles.party}>
        {(party ?? []).map((p, i) => (
          <View
            key={i}
            style={[styles.chip, { borderColor: p.hp <= 0 ? theme.danger : theme.border }]}
            accessible
            accessibilityLabel={t('map.partyMember', { species: p.name, hp: p.hp, max: p.maxHp })}
            testID={`hud-chip-${i}`}
          >
            <AppText style={[styles.chipText, { color: p.hp <= 0 ? theme.danger : theme.text }]} numberOfLines={1}>
              {`${p.name} ${p.hp}/${p.maxHp}`}
            </AppText>
          </View>
        ))}
      </View>
      <Pressable
        onPress={onSettings}
        accessibilityRole="button"
        accessibilityLabel={t('hud.settings')}
        style={({ pressed }) => [styles.settings, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
        testID="hud-settings"
      >
        <AppText style={[styles.settingsText, { color: theme.text }]} numberOfLines={1}>
          {t('hud.settings')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderBottomWidth: 2, width: '100%' },
  title: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  party: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' },
  chip: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 1 },
  chipText: { fontSize: 13 },
  settings: { minHeight: 48, minWidth: 48, paddingHorizontal: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontSize: 14, fontWeight: '600' },
});
