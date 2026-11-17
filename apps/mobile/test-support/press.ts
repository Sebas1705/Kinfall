// A fast double tap: two presses of the same button before React re-renders, as a quick second
// tap can land on a device. fireEvent.press re-renders between presses and skips an unmounted
// button, so it cannot reproduce this; the host's click handler (Pressability's onClick, which
// calls onPress) is called twice inside one act instead.
import { act } from '@testing-library/react-native';

interface Clickable {
  props: { onClick?: (event: unknown) => void };
}

export async function doubleTap(element: Clickable): Promise<void> {
  const onClick = element.props.onClick;
  if (!onClick) throw new Error('element has no click handler');
  const event = { nativeEvent: {}, persist() {}, preventDefault() {}, stopPropagation() {} };
  await act(async () => {
    onClick(event);
    onClick(event);
  });
}
