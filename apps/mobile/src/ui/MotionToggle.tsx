import { t } from '@kinfall/core/platform/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { setAppReduceMotion, useAppReduceMotion } from '../platform/motionSetting';
import { FramePressable } from './PixelFrame';

/**
 * The app's own "Reduce motion" switch (next to the language). It adds to the system setting: with
 * the system's reduce motion on, the app is still whatever this says, the motion stays off anyway.
 */
export function MotionToggle() {
  const on = useAppReduceMotion();
  return (
    <FramePressable
      onPress={() => setAppReduceMotion(!on)}
      accessibilityRole="switch"
      accessibilityLabel={t('settings.reduceMotion')}
      accessibilityState={{ checked: on }}
      testID="reduce-motion"
      padX={4}
    >
      {({ textColor }) => (
        <View style={styles.row}>
          {/* The box repeats the state the switch role already gives screen readers. */}
          <View style={[styles.box, { borderColor: textColor }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {on ? <View style={[styles.tick, { backgroundColor: textColor }]} /> : null}
          </View>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.reduceMotion')}</Text>
        </View>
      )}
    </FramePressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 18, height: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 8, height: 8 },
  label: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
