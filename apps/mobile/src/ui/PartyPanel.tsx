import type { PartyRow } from '@kinfall/core/models/party';
import { t } from '@kinfall/core/platform/i18n';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

import { CreatureSprite } from '../art/CreatureSprite';
import { PixelBar } from './PixelBar';
import { Plate, usePlateText } from './PixelFrame';

export interface PartyPanelProps {
  /** Rows of the screen model, in party order. */
  party: PartyRow[];
  /** Species id per row (same order), for the sprite. */
  speciesIds: string[];
  souls: number;
}

/** Party and souls on a plate: sprite, name and a pixel HP bar whose value is always written out as text too. */
export function PartyPanel({ party, speciesIds, souls }: PartyPanelProps) {
  const ink = usePlateText();
  return (
    <Plate style={styles.panel} testID="party">
      <AppText style={[styles.heading, { color: ink.text }]} accessibilityRole="header">
        {t('map.party')}
      </AppText>
      {party.map((p, i) => {
        const label = t('map.partyMember', { species: p.name, hp: p.hp, max: p.maxHp });
        const id = speciesIds[i];
        return (
          <View key={i} style={styles.member} accessible accessibilityLabel={label} testID={`party-member-${i}`}>
            {id ? <CreatureSprite species={id} scale={2} /> : null}
            <View style={styles.memberText}>
              <View style={styles.nameRow}>
                <AppText style={[styles.name, { color: ink.text }]}>{p.name}</AppText>
                <AppText style={[styles.hp, { color: ink.muted }]} testID={`party-hp-${i}`}>
                  {`${p.hp}/${p.maxHp}`}
                </AppText>
              </View>
              <PixelBar kind="hp" value={p.hp} max={p.maxHp} />
            </View>
          </View>
        );
      })}
      <AppText style={[styles.souls, { color: ink.text }]} testID="souls">
        {`${t('map.souls')}: `}
        <AppText style={styles.soulsValue}>{String(souls)}</AppText>
      </AppText>
    </Plate>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  heading: { fontSize: 18, fontWeight: '700' },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberText: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  hp: { fontSize: 15 },
  souls: { fontSize: 16 },
  soulsValue: { fontWeight: '700' },
});
