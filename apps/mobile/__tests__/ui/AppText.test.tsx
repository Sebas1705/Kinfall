import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { createRef, type ComponentRef } from 'react';
import { StyleSheet, Text } from 'react-native';

import { resetTextSizeSettingForTests, textSizeSetting } from '../../src/platform/textSizeSetting';
import { AppText } from '../../src/ui/AppText';

beforeEach(() => resetTextSizeSettingForTests());
afterEach(() => resetTextSizeSettingForTests());

async function sized(percent: number) {
  await act(async () => {
    await textSizeSetting.set(percent);
  });
  await render(
    <AppText testID="t" accessibilityRole="header" style={[{ color: 'red' }, { fontSize: 20, lineHeight: 30 }]}>
      hi
    </AppText>,
  );
  return StyleSheet.flatten(screen.getByTestId('t').props.style);
}

describe('AppText', () => {
  it('multiplies fontSize and lineHeight by the setting', async () => {
    expect(await sized(100)).toMatchObject({ fontSize: 20, lineHeight: 30, color: 'red' });
  });
  it('scales up at 150', async () => {
    expect(await sized(150)).toMatchObject({ fontSize: 30, lineHeight: 45, color: 'red' });
  });
  it('scales down at 80', async () => {
    expect(await sized(80)).toMatchObject({ fontSize: 16, lineHeight: 24 });
  });

  it('passes maxFontSizeMultiplier 2 by default and lets the caller override', async () => {
    await render(
      <>
        <AppText testID="a">a</AppText>
        <AppText testID="b" maxFontSizeMultiplier={1.2}>
          b
        </AppText>
      </>,
    );
    expect(screen.getByTestId('a').props.maxFontSizeMultiplier).toBe(2);
    expect(screen.getByTestId('b').props.maxFontSizeMultiplier).toBe(1.2);
    expect(screen.getByTestId('a').props.accessibilityRole).toBeUndefined();
  });

  it('forwards accessibilityRole and a ref to a Text instance', async () => {
    const ref = createRef<ComponentRef<typeof Text>>();
    await render(
      <AppText ref={ref} testID="r" accessibilityRole="header">
        r
      </AppText>,
    );
    expect(ref.current).not.toBeNull();
    expect(screen.getByTestId('r').props.accessibilityRole).toBe('header');
  });
});
