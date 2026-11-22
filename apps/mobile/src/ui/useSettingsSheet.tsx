// State for the settings sheet: screens call `open` from their Hud's `onSettings`, render `sheet`
// as a SIBLING of the screen root (see Sheet.tsx for the caller requirements), and attach
// `openerRef` to the button so the focus returns there when the sheet closes. `extra` adds content
// under the settings (the battle's Abandon), `onClose` runs when the sheet closes.
import { useCallback, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';

import { SettingsSheet } from './SettingsSheet';

export interface SettingsSheetOptions {
  extra?: ReactNode;
  onClose?: () => void;
}

export interface SettingsSheetControls {
  open: () => void;
  close: () => void;
  sheet: ReactElement;
  /** Attach to the control that calls `open`. */
  openerRef: RefObject<unknown>;
  visible: boolean;
}

export function useSettingsSheet({ extra, onClose }: SettingsSheetOptions = {}): SettingsSheetControls {
  const [visible, setVisible] = useState(false);
  const openerRef = useRef<unknown>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => {
    setVisible(false);
    onCloseRef.current?.();
  }, []);
  const sheet = useMemo(() => <SettingsSheet visible={visible} onClose={close} openerRef={openerRef} extra={extra} />, [visible, close, extra]);
  return { open, close, sheet, openerRef, visible };
}
