// State for the settings sheet: screens call `open` from their Hud's `onSettings`, render `sheet`
// as a SIBLING of the screen root (see Sheet.tsx for the caller requirements), and attach
// `openerRef` to the button so the focus returns there when the sheet closes.
import { useCallback, useMemo, useRef, useState, type ReactElement, type RefObject } from 'react';

import { SettingsSheet } from './SettingsSheet';

export interface SettingsSheetControls {
  open: () => void;
  sheet: ReactElement;
  /** Attach to the control that calls `open`. */
  openerRef: RefObject<unknown>;
  visible: boolean;
}

export function useSettingsSheet(): SettingsSheetControls {
  const [visible, setVisible] = useState(false);
  const openerRef = useRef<unknown>(null);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const sheet = useMemo(() => <SettingsSheet visible={visible} onClose={close} openerRef={openerRef} />, [visible, close]);
  return { open, sheet, openerRef, visible };
}
