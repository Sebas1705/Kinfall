import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { TOUCH, useTheme } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/** A text button at least 48dp tall; the label wraps instead of clipping at large font scales. */
export function Button({ label, onPress, variant = 'secondary', disabled = false, testID, accessibilityLabel, accessibilityHint, style }: ButtonProps) {
  const theme = useTheme();
  const filled = variant === 'primary' || variant === 'danger';
  const bg = disabled ? theme.surface2 : variant === 'primary' ? theme.accent : variant === 'danger' ? theme.danger : theme.surface;
  const fg = disabled ? theme.disabledText : filled ? theme.accentText : theme.text;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: pressed && !disabled ? theme.focus : filled && !disabled ? bg : theme.border },
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  text: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
