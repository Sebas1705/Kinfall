// The sheets every run screen (map, event, end) shares: the Settings sheet, whose extra content is
// the Abandon button (map) or the abandon confirmation (any run screen, when Android back asks), and
// the "Run details" sheet with what the screen moved out of the console (party, stats, run log).
// The flow is the battle's: the confirmation replaces the Abandon button inside the Settings sheet,
// Android back with no sheet open opens the sheet with the confirmation showing, answering "no" in a
// sheet nobody opened by hand closes it again, and closing the sheet with the confirmation open
// cancels it. Callers render both sheets as SIBLINGS of the Screen and spread `backdrop` on it (see
// Sheet.tsx).
import { t } from '@kinfall/core/platform/i18n';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';

import { useLang } from '../platform/LangContext';
import { Button } from './Button';
import { useSheetBackdropProps } from './Sheet';
import { useSettingsSheet, type SettingsSheetControls } from './useSettingsSheet';

export interface RunSheetsOptions {
  /** The abandon confirmation is open. */
  confirming: boolean;
  /** The confirmation, drawn where the Abandon button was (in the Settings sheet) while `confirming`. */
  confirmPanel?: ReactNode;
  /** In the Settings sheet, under the Abandon button (the seed line). */
  trailer?: ReactNode;
  /** First step of the two-step abandon; omit it on screens without an Abandon button. */
  onAbandon?: () => void;
  /** The Settings sheet closed while the confirmation was open: the Run screen drops it. */
  onCancelAbandon?: () => void;
}

export interface RunSheets {
  settings: SettingsSheetControls;
  detailsOpen: boolean;
  openDetails: () => void;
  closeDetails: () => void;
  /** Attach to the HUD button that opens the details: it gets the focus back on close. */
  detailsRef: RefObject<ComponentRef<typeof View> | null>;
  /** Spread on the Screen's `backdrop`. */
  backdrop: ReturnType<typeof useSheetBackdropProps>;
  /** A sheet is open (focus moves wait for it to close). */
  sheetOpen: boolean;
}

export function useRunSheets({ confirming, confirmPanel, trailer, onAbandon, onCancelAbandon }: RunSheetsOptions): RunSheets {
  const lang = useLang();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsRef = useRef<ComponentRef<typeof View>>(null);
  const autoOpened = useRef(false);
  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;
  const closeSettings = useRef<() => void>(() => {});

  // Memoised, so the Settings sheet's own memo holds between renders.
  const extra = useMemo(
    () => (
      <>
        {confirming ? (
          (confirmPanel ?? null)
        ) : onAbandon ? (
          <Button
            label={t('map.abandon')}
            onPress={() => {
              autoOpened.current = false;
              onAbandon();
            }}
            testID="abandon"
          />
        ) : null}
        {trailer}
      </>
    ),
    // `lang` rebuilds the Abandon label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirming, confirmPanel, trailer, onAbandon, lang],
  );
  const settings = useSettingsSheet({
    extra,
    // Closing the sheet with the confirmation open (Close, Back, a tap outside) cancels it.
    onClose: () => {
      autoOpened.current = false;
      if (confirmingRef.current) onCancelAbandon?.();
    },
  });
  closeSettings.current = settings.close;
  const backdrop = useSheetBackdropProps(settings.visible || detailsOpen);

  // Android back (or anything else) opened the confirmation with no sheet: show it where Abandon is.
  const wasConfirming = useRef(false);
  const openSettings = settings.open;
  const visibleRef = useRef(settings.visible);
  visibleRef.current = settings.visible;
  useEffect(() => {
    if (confirming && !wasConfirming.current && !visibleRef.current) {
      autoOpened.current = true;
      setDetailsOpen(false);
      openSettings();
    } else if (!confirming && wasConfirming.current && autoOpened.current) {
      // Answered "no" in a sheet nobody opened by hand: it goes away again.
      autoOpened.current = false;
      closeSettings.current();
    }
    wasConfirming.current = confirming;
  }, [confirming, openSettings]);

  return useMemo(
    () => ({
      settings,
      detailsOpen,
      openDetails: () => setDetailsOpen(true),
      closeDetails: () => setDetailsOpen(false),
      detailsRef,
      backdrop,
      sheetOpen: settings.visible || detailsOpen,
    }),
    [settings, detailsOpen, backdrop],
  );
}
