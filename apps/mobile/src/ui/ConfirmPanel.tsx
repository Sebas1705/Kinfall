import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useTheme } from '../theme';
import { Button } from './Button';

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
 * when it appears, then the safe choice first and the destructive one second.
 */
export function ConfirmPanel({ question, yes, no, onYes, onNo, testID }: ConfirmPanelProps) {
  const theme = useTheme();
  // Side by side at default text size; stacked when large text would squeeze them.
  const basis = { flexBasis: 140 * Math.max(1, useWindowDimensions().fontScale) };
  return (
    <View style={[styles.panel, { borderColor: theme.danger, backgroundColor: theme.surface }]} testID={testID}>
      <Text style={[styles.question, { color: theme.text }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        {question}
      </Text>
      <View style={styles.row}>
        <Button label={no} onPress={onNo} testID={`${testID}-no`} style={[styles.choice, basis]} />
        <Button label={yes} onPress={onYes} variant="danger" testID={`${testID}-yes`} style={[styles.choice, basis]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 2, borderRadius: 10, padding: 12, gap: 12 },
  question: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  choice: { flexGrow: 1 },
});
