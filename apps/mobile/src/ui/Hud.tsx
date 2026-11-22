// The console layout's top bar: the heading (zone, screen title or the app title), the party as chips
// with an HP cue written out as text, an optional extra button (the battle's Log, a run screen's
// Run details, the title's Options) and the Settings button (48dp). The sheets behind the buttons
// belong to the caller. In console mode the bar is exactly the contract's HUD height, so what it
// holds is planned by hudMetrics.hudPlan (proved by arithmetic): full chips when they fit, else one
// compact chip with a low-HP cue, else none (the Run sheet always lists the party), and a heading
// of one or two lines. In the fallback it grows with the text instead of clipping.
import type { PartyRow } from '@kinfall/core/models/party';
import type { ScreenId } from '@kinfall/core/layout/spec';
import { effectiveTextScale } from '@kinfall/core/layout/spec';
import { t } from '@kinfall/core/platform/i18n';
import type { ComponentRef, Ref } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useLang } from '../platform/LangContext';
import { useTextSize } from '../platform/textSizeSetting';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { BUTTON_SIZE, CHIP_SIZE, HUD_GAP, HUD_PAD, TITLE_MIN_WIDTH, hudPlan } from './hudMetrics';
import { useLayoutSpec } from './useLayoutSpec';

type ViewRef = Ref<ComponentRef<typeof View>>;

export interface HudProps {
  screen: ScreenId;
  onSettings: () => void;
  /** Party members of the run state, in order. */
  party?: PartyRow[];
  /** Zone and node, e.g. "Ashen Marsh 3/7"; the app title when omitted. */
  zoneLabel?: string;
  /** Shows an extra button before Settings (the battle's Log, a run screen's details, the title's options). */
  onExtra?: () => void;
  /** Refs of the two buttons: the sheets they open give them the focus back on close. */
  extraRef?: ViewRef;
  settingsRef?: ViewRef;
  /** Text and name of the extra button (the battle's Log by default). */
  extraLabel?: string;
  /** testID of the extra button ('hud-log' by default). */
  extraTestID?: string;
  /** Focus handle and testID of the heading: a run screen's heading is focused on arrival. */
  titleRef?: Ref<ComponentRef<typeof AppText>>;
  titleTestID?: string;
}

/** The compact chip's text: a heart, the party size and a "!" when a member is at a quarter of its HP or less. */
export function compactChip(party: PartyRow[]): string {
  const low = party.some((p) => p.hp * 4 <= p.maxHp);
  return `♥ ${party.length}${low ? ' !' : ''}`;
}

export function Hud({ screen, onSettings, party = [], zoneLabel, onExtra, extraRef, settingsRef, extraLabel, extraTestID = 'hud-log', titleRef, titleTestID = 'hud-title' }: HudProps) {
  useLang();
  const theme = useTheme();
  const spec = useLayoutSpec(screen);
  const { fontScale } = useWindowDimensions();
  const appSize = useTextSize();
  const scale = effectiveTextScale(fontScale, appSize / 100);
  const height = spec.regions.hud.height;
  const fixed = spec.mode === 'console';
  const title = zoneLabel ?? t('app.title');
  const extra = extraLabel ?? t('battle.openLog');
  const compact = compactChip(party);
  const plan = hudPlan({
    width: spec.regions.content.width,
    ...(fixed ? { height } : {}),
    scale,
    title,
    chips: party.map((p) => `${p.name} ${p.hp}/${p.maxHp}`),
    compact,
    buttons: [...(onExtra ? [extra] : []), t('hud.settings')],
  });
  // The fallback bar grows with the text but follows the same plan (compact chip when the party does not
  // fit), so its row stays short enough for the capped strip the Screen gives it.
  const mode = plan.chips;
  const lines = plan.titleLines;
  const chip = (key: string, text: string, label: string, bad: boolean, testID: string) => (
    <View key={key} style={[styles.chip, { borderColor: bad ? theme.danger : theme.border }]} accessible accessibilityRole="text" accessibilityLabel={label} testID={testID}>
      <AppText style={[styles.chipText, { color: bad ? theme.danger : theme.text }]} numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );
  return (
    <View
      style={[styles.bar, fixed ? { height } : { minHeight: height, alignItems: 'flex-start' }, { borderColor: theme.border, backgroundColor: theme.surface }]}
      testID="hud"
    >
      <AppText
        ref={titleRef}
        style={[styles.title, fixed ? null : styles.titleFallback, { color: theme.text, fontSize: plan.titleSize }]}
        numberOfLines={lines}
        accessibilityRole="header"
        testID={titleTestID}
      >
        {title}
      </AppText>
      <View style={[styles.party, mode === 'full' && !fixed ? styles.partyWrap : null]}>
        {mode === 'full'
          ? party.map((p, i) =>
              chip(String(i), `${p.name} ${p.hp}/${p.maxHp}`, t('map.partyMember', { species: p.name, hp: p.hp, max: p.maxHp }), p.hp <= 0, `hud-chip-${i}`),
            )
          : mode === 'compact'
            ? chip(
                'all',
                compact,
                party.map((p) => t('map.partyMember', { species: p.name, hp: p.hp, max: p.maxHp })).join(', '),
                party.some((p) => p.hp <= 0),
                'hud-chip-all',
              )
            : null}
      </View>
      {onExtra ? (
        <Pressable
          ref={extraRef}
          onPress={onExtra}
          accessibilityRole="button"
          accessibilityLabel={extra}
          style={({ pressed }) => [styles.settings, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
          testID={extraTestID}
        >
          <AppText style={[styles.settingsText, { color: theme.text }]} numberOfLines={1}>
            {extra}
          </AppText>
        </Pressable>
      ) : null}
      <Pressable
        ref={settingsRef}
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
  // The bar's row is centred in the console (a fixed height) and pinned to the top in the fallback, where the
  // Screen caps the strip and scrolls it: the buttons are then always in its first 48 dp, never mid-row.
  bar: { flexDirection: 'row', alignItems: 'center', gap: HUD_GAP, paddingHorizontal: HUD_PAD, borderBottomWidth: 2, width: '100%' },
  title: { fontWeight: '700', flexShrink: 1 },
  titleFallback: { minWidth: TITLE_MIN_WIDTH },
  party: { flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'flex-end' },
  partyWrap: { flexWrap: 'wrap' },
  chip: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 1 },
  chipText: { fontSize: CHIP_SIZE },
  settings: { minHeight: 48, minWidth: 48, paddingHorizontal: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontSize: BUTTON_SIZE, fontWeight: '600' },
});
