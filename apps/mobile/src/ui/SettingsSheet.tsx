// The settings sheet of the console layout: language, reduce motion, text size (80 to 150 in steps
// of 10) and, on Android only, the immersive switch (on iOS immersive is a no-op, so the row is hidden).
// Caller requirements are those of Sheet (backdrop props on a sibling root).
import { t } from '@kinfall/core/platform/i18n';
import type { RefObject } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { needsExplicitAnnouncements } from '../platform/announce';
import { immersiveSetting, useImmersive } from '../platform/immersiveSetting';
import { useLang } from '../platform/LangContext';
import { TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_SIZE_STEP, textSizeSetting, useTextSize } from '../platform/textSizeSetting';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { LangToggle } from './LangToggle';
import { MotionToggle } from './MotionToggle';
import { FramePressable } from './PixelFrame';
import { Sheet } from './Sheet';

export interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  openerRef?: RefObject<unknown>;
}

function TextSizeStepper() {
  const size = useTextSize();
  const theme = useTheme();
  const step = (delta: number) => {
    const next = size + delta;
    if (next < TEXT_SIZE_MIN || next > TEXT_SIZE_MAX) return;
    void textSizeSetting.set(next);
    // Android reads the live region by itself; iOS has none.
    if (needsExplicitAnnouncements()) AccessibilityInfo.announceForAccessibility(`${t('settings.textSize')} ${next}%`);
  };
  return (
    <View style={styles.stepper} testID="text-size">
      <AppText style={[styles.label, { color: theme.muted }]}>{t('settings.textSize')}</AppText>
      <View style={styles.stepRow}>
        <FramePressable
          onPress={() => step(-TEXT_SIZE_STEP)}
          disabled={size <= TEXT_SIZE_MIN}
          accessibilityLabel={t('settings.textSmaller')}
          testID="text-smaller"
          style={styles.stepButton}
        >
          {({ textColor }) => (
            <AppText style={[styles.stepGlyph, { color: textColor }]} importantForAccessibility="no">
              -
            </AppText>
          )}
        </FramePressable>
        <AppText style={[styles.value, { color: theme.text }]} accessibilityLiveRegion="polite" testID="text-size-value">
          {`${size}%`}
        </AppText>
        <FramePressable
          onPress={() => step(TEXT_SIZE_STEP)}
          disabled={size >= TEXT_SIZE_MAX}
          accessibilityLabel={t('settings.textLarger')}
          testID="text-larger"
          style={styles.stepButton}
        >
          {({ textColor }) => (
            <AppText style={[styles.stepGlyph, { color: textColor }]} importantForAccessibility="no">
              +
            </AppText>
          )}
        </FramePressable>
      </View>
    </View>
  );
}

function ImmersiveSwitch() {
  const on = useImmersive();
  return (
    <FramePressable
      onPress={() => void immersiveSetting.set(!on)}
      accessibilityRole="switch"
      accessibilityLabel={t('settings.immersive')}
      accessibilityState={{ checked: on }}
      testID="immersive-switch"
      padX={4}
    >
      {({ textColor }) => (
        <View style={styles.switchRow}>
          <View style={[styles.box, { borderColor: textColor }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {on ? <View style={[styles.tick, { backgroundColor: textColor }]} /> : null}
          </View>
          <AppText style={[styles.switchLabel, { color: textColor }]}>{t('settings.immersive')}</AppText>
        </View>
      )}
    </FramePressable>
  );
}

export function SettingsSheet({ visible, onClose, openerRef }: SettingsSheetProps) {
  useLang();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('settings.title')} screen="title" openerRef={openerRef} testID="settings-sheet">
      <LangToggle />
      <MotionToggle />
      <TextSizeStepper />
      {Platform.OS === 'android' ? <ImmersiveSwitch /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stepper: { gap: 6 },
  label: { fontSize: 15 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepButton: { alignItems: 'center', minWidth: 48, minHeight: 48 },
  stepGlyph: { fontSize: 22, fontWeight: '700' },
  value: { fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 18, height: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 8, height: 8 },
  switchLabel: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
