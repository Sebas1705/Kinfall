import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';

import { useTheme } from '../theme';
import { FramePressable } from './PixelFrame';

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
  /** One line that shrinks to fit instead of wrapping (rails and bands of the console layout have a fixed height). */
  fit?: boolean;
}

/**
 * A text button in a pixel frame, at least 48dp tall; the label wraps instead of clipping at large
 * font scales. The main action ('primary') wears the ornate plate, the others the raised button;
 * a destructive one ('danger') writes its label in the danger colour (the words say it too).
 */
export function Button({ label, onPress, variant = 'secondary', disabled = false, testID, accessibilityLabel, accessibilityHint, style, fit = false }: ButtonProps) {
  const theme = useTheme();
  return (
    <FramePressable
      onPress={onPress}
      disabled={disabled}
      kind={variant === 'primary' ? 'plate' : 'button'}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.button, style]}
      padX={8}
    >
      {({ pressed, textColor }) => (
        <AppText
          style={[
            styles.text,
            variant === 'primary' && styles.primary,
            { color: variant === 'danger' && !disabled && !pressed ? theme.danger : textColor },
          ]}
          {...(fit ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 } : {})}
        >
          {label}
        </AppText>
      )}
    </FramePressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center' },
  text: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  primary: { fontSize: 17, fontWeight: '700' },
});
