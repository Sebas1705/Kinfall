import type { PartyRow } from '@kinfall/core/models/party';
import { t } from '@kinfall/core/platform/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { CreatureSprite } from '../art/CreatureSprite';
import { useTheme } from '../theme';

export interface PartyPanelProps {
  /** Rows of the screen model, in party order. */
  party: PartyRow[];
  /** Species id per row (same order), for the sprite. */
  speciesIds: string[];
  souls: number;
}

/** Party and souls: sprite, name and an HP bar whose value is always written out as text too. */
export function PartyPanel({ party, speciesIds, souls }: PartyPanelProps) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]} testID="party">
      <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
        {t('map.party')}
      </Text>
      {party.map((p, i) => {
        const label = t('map.partyMember', { species: p.name, hp: p.hp, max: p.maxHp });
        const ratio = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
        const id = speciesIds[i];
        return (
          <View key={i} style={styles.member} accessible accessibilityLabel={label} testID={`party-member-${i}`}>
            {id ? <CreatureSprite species={id} scale={2} /> : null}
            <View style={styles.memberText}>
              <Text style={[styles.name, { color: theme.text }]}>{p.name}</Text>
              <View style={[styles.track, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
                <View style={[styles.fill, { backgroundColor: theme.good, width: `${Math.round(ratio * 100)}%` }]} />
              </View>
              <Text style={[styles.hp, { color: theme.muted }]} testID={`party-hp-${i}`}>
                {`${p.hp}/${p.maxHp}`}
              </Text>
            </View>
          </View>
        );
      })}
      <Text style={[styles.souls, { color: theme.text }]} testID="souls">
        {`${t('map.souls')}: `}
        <Text style={styles.soulsValue}>{String(souls)}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  heading: { fontSize: 18, fontWeight: '700' },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberText: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  track: { height: 10, borderRadius: 5, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%' },
  hp: { fontSize: 15 },
  souls: { fontSize: 16 },
  soulsValue: { fontWeight: '700' },
});
