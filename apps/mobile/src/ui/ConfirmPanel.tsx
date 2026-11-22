import { useRef, type ComponentRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from './AppText';

import { useAnnounce } from '../platform/announce';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Plate, usePlateText } from './PixelFrame';
import { useReveal } from './Screen';

export interface ConfirmPanelProps {
  question: string;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
  /** Prefix of the testIDs: `${testID}`, `${testID}-yes`, `${testID}-no`. */
  testID: string;
}

/**
 * The second step of an inline two-step confirmation (no system Alert): the question, announced
 * when it appears, then the safe choice first and the destructive one second. Screens show it in
 * place of the button that opened it, and it scrolls itself fully into view whenever it appears or
 * changes size (text wrapping at large font scales), also when Android back opened it with that
 * button scrolled away.
 */
export function ConfirmPanel({ question, yes, no, onYes, onNo, testID }: ConfirmPanelProps) {
  const theme = useTheme();
  const ink = usePlateText();
  const reveal = useReveal();
  const panel = useRef<ComponentRef<typeof View>>(null);
  // iOS has no live regions: the question is announced once when the panel opens.
  const opened = useRef({});
  useAnnounce(opened.current, question);
  // Side by side at default text size; stacked when large text would squeeze them.
  const basis = { flexBasis: 140 * Math.max(1, useWindowDimensions().fontScale) };
  return (
    <Plate ref={panel} style={styles.panel} onLayout={() => reveal(panel.current)} testID={testID}>
      {/* Warning stripe; the question says what is at stake. */}
      <View style={[styles.stripe, { backgroundColor: theme.danger }]} />
      <AppText style={[styles.question, { color: ink.text }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        {question}
      </AppText>
      <View style={styles.row}>
        <Button label={no} onPress={onNo} testID={`${testID}-no`} style={[styles.choice, basis]} />
        <Button label={yes} onPress={onYes} variant="danger" testID={`${testID}-yes`} style={[styles.choice, basis]} />
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, paddingLeft: 22 },
  stripe: { position: 'absolute', left: 12, top: 12, bottom: 12, width: 5 },
  question: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  choice: { flexGrow: 1 },
});
