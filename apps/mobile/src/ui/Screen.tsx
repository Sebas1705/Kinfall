import type { ReactNode, Ref } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

/**
 * A scrolling screen inside the safe area. Content grows downwards only: rows wrap instead of
 * scrolling sideways, so nothing is clipped at 360dp wide or at 200% font scale.
 */
export interface ScreenProps {
  children: ReactNode;
  testID?: string;
  ref?: Ref<ScrollViewInstance>;
  /** Called after the content changed size (e.g. to scroll a newly shown panel into view). */
  onContentSizeChange?: (width: number, height: number) => void;
}

export function Screen({ children, testID, ref, onContentSizeChange }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    // The status bar area stays clear (content scrolls below it, never under the clock).
    <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <ScrollView
        ref={ref}
        style={styles.screen}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
        }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={onContentSizeChange}
        testID={testID}
      >
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
