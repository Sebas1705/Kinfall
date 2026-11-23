// Title screen in the console layout (no page scroll): the hero (the zone scene, the chosen starter
// and the wordmark) fills the primary region above a strip of the three starters, each a 48 dp radio
// card, and the hint of the chosen one; the rail (a band in portrait) holds Continue, New run and,
// for a damaged save, its notice and Discard (the confirmation opens in a sheet: it needs more room
// than the rail has). The seed field, the saves note and the dev link live in the "New run options"
// sheet (HUD button); language, motion and text size in the Settings sheet (HUD button). Mirrors the
// web title (apps/web/src/view/screens/title.ts) with the device wording of the save notes.
// Sizes are in titleMetrics, which the fit tests prove.
import { CONTENT } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import { effectiveTextScale } from '@kinfall/core/layout/spec';
import { speciesName, t, type StringKey } from '@kinfall/core/platform/i18n';
import { SEED_MAX, cleanSeed } from '@kinfall/core/platform/seed';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { CreatureSprite } from '../art/CreatureSprite';
import { TitleHero } from '../art/TitleHero';
import { useLang } from '../platform/LangContext';
import { useReducedMotion } from '../platform/motionSetting';
import { randomSeed as defaultRandomSeed } from '../platform/random';
import { MAX_FONT_SIZE_MULTIPLIER, useTextSize } from '../platform/textSizeSetting';
import { useRunSession } from '../run/useRunSession';
import { TOUCH, useTheme } from '../theme';
import { AppText, scaleTextStyle } from '../ui/AppText';
import { Button } from '../ui/Button';
import { ConfirmPanel } from '../ui/ConfirmPanel';
import { fitText } from '../ui/fitText';
import { Hud } from '../ui/Hud';
import { FramePressable } from '../ui/PixelFrame';
import { Screen } from '../ui/Screen';
import { Sheet, useSheetBackdropProps } from '../ui/Sheet';
import { useLayoutSpec } from '../ui/useLayoutSpec';
import { useSettingsSheet } from '../ui/useSettingsSheet';
import { RAIL_GAP } from './battleMetrics';
import {
  HINT_LINES,
  HINT_SIZE,
  MAIN_GAP,
  MAIN_PAD,
  NAME_SIZE,
  noticeLinesCap,
  NOTICE_SIZE,
  RAIL_PAD,
  SPRITE_DP,
  buttonHeight,
  cardHeight,
  heroHeight,
  HERO_MIN,
} from './titleMetrics';

export interface TitleScreenProps {
  /** Called once a run is ready to show (new run started, or a save resumed). */
  onRunReady: () => void;
  /** Dev builds only: opens the dev tools (hello core, gallery, self test). */
  onOpenDevTools?: () => void;
  /** Seed for a blank field on "New run" (tests inject a fixed one). */
  randomSeed?: () => string;
}

function hintKey(element: string | undefined): StringKey | null {
  return element === 'ember' || element === 'thorn' || element === 'tide' ? `title.starterHint.${element}` : null;
}

function starterHint(id: string): string {
  const key = hintKey(lookup(CONTENT).species(id).elements[0]);
  return key ? t(key) : '';
}

function StarterCard({ id, checked, onSelect, scale, fixed }: { id: string; checked: boolean; onSelect: () => void; scale: number; fixed: boolean }) {
  const sp = lookup(CONTENT).species(id);
  const name = speciesName(sp);
  const elements = sp.elements.map((e) => t(`element.${e}` as StringKey)).join(' / ');
  const hint = starterHint(id);
  return (
    // The chosen starter wears the ornate plate; the dot in the name says it in text too.
    <FramePressable
      onPress={onSelect}
      kind={checked ? 'plate' : 'button'}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={hint ? `${name}, ${elements}. ${hint}` : `${name}, ${elements}`}
      testID={`starter-${id}`}
      style={[styles.card, fixed ? { height: cardHeight(scale) } : { minHeight: cardHeight(scale) }]}
      padX={2}
      padY={0}
    >
      {({ textColor }) => (
        <View style={styles.cardBody}>
          <CreatureSprite species={sp} scale={SPRITE_DP / 24} />
          <AppText style={[styles.cardName, { color: textColor }]} {...fitText(fixed, 1, 0.7)}>
            {checked ? '● ' : '○ '}
            {name}
          </AppText>
        </View>
      )}
    </FramePressable>
  );
}

export function TitleScreen({ onRunReady, onOpenDevTools, randomSeed = defaultRandomSeed }: TitleScreenProps) {
  const { session, snapshot } = useRunSession();
  const theme = useTheme();
  const spec = useLayoutSpec('title');
  const { fontScale } = useWindowDimensions();
  const appSize = useTextSize();
  const scale = effectiveTextScale(fontScale, appSize / 100);
  const landscape = spec.orientation === 'landscape';
  const consoleMode = spec.mode === 'console';
  const reduceMotion = useReducedMotion();
  useLang();
  const starters = CONTENT.starters;
  const [seed, setSeed] = useState(snapshot.titleSeed);
  const [starter, setStarter] = useState(starters[0] ?? '');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<ComponentRef<typeof View>>(null);
  const discardRef = useRef<ComponentRef<typeof View>>(null);
  const busy = useRef(false);

  const settings = useSettingsSheet();
  const backdrop = useSheetBackdropProps(settings.visible || optionsOpen || confirmDiscard);

  // A new title seed (after an abandon) replaces whatever was typed.
  useEffect(() => setSeed(snapshot.titleSeed), [snapshot.titleSeed]);
  useEffect(() => {
    void session.refreshSaved();
  }, [session]);

  const saved = snapshot.saved;
  const canContinue = saved?.kind === 'ok';

  const onNewRun = () => {
    if (busy.current) return;
    let value = cleanSeed(seed);
    if (!value) {
      value = randomSeed();
      setSeed(value);
    }
    session.start(value, starter);
    onRunReady();
  };

  const onContinue = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (await session.resume()) onRunReady();
    } finally {
      busy.current = false;
    }
  };

  const onDiscard = async () => {
    setConfirmDiscard(false);
    await session.discardSave();
  };

  // The hero fills what the strip and the hint leave of the primary region: measured once laid out,
  // planned from the contract's primary rect before that (and in the fallback, where it scrolls).
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const planned = heroHeight(spec.regions.primary.height, scale);
  const heroH = consoleMode ? Math.max(HERO_MIN, Math.round(box?.height ?? planned)) : 160;
  const heroW = box?.width ?? spec.regions.primary.width;

  const hero = (
    <View
      style={consoleMode ? styles.heroBox : null}
      onLayout={
        consoleMode
          ? (e) => {
              const { width, height } = e.nativeEvent.layout;
              setBox((prev) => (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
            }
          : undefined
      }
    >
      <TitleHero starter={starter} reducedMotion={reduceMotion} initialWidth={heroW} maxHeight={heroH} />
    </View>
  );
  const main = (
    <View style={consoleMode ? styles.mainFill : styles.main} testID="title-main">
      {hero}
      <View style={styles.strip} accessibilityRole="radiogroup" accessibilityLabel={t('title.starter')} testID="starters">
        {starters.map((id) => (
          <StarterCard key={id} id={id} checked={id === starter} onSelect={() => setStarter(id)} scale={scale} fixed={consoleMode} />
        ))}
      </View>
      {/* The hint of the chosen starter (each card's accessible name has its own). */}
      <AppText
        style={[styles.hint, { color: theme.muted }]}
        numberOfLines={consoleMode ? HINT_LINES : undefined}
        importantForAccessibility="no"
        accessibilityElementsHidden
        testID="starter-hint"
      >
        {starterHint(starter)}
      </AppText>
    </View>
  );

  const buttonStyle = consoleMode ? { height: buttonHeight(scale) } : { minHeight: buttonHeight(scale) };
  const noticeLines = (kind: 'unavailable' | 'corrupt') => (consoleMode ? noticeLinesCap(kind, landscape) : undefined);
  const actions = (
    <View style={styles.rail} testID="title-actions">
      {saved?.kind === 'unavailable' ? (
        <AppText style={[styles.notice, { color: theme.text, borderColor: theme.border }]} numberOfLines={noticeLines('unavailable')} testID="saves-unavailable">
          {t('title.savesUnavailableDevice')}
        </AppText>
      ) : null}
      {saved?.kind === 'corrupt' ? (
        <View style={styles.warn} testID="corrupt-notice">
          <AppText style={[styles.notice, { color: theme.text, borderColor: theme.danger }]} numberOfLines={noticeLines('corrupt')}>
            {t('title.corrupt', { reason: saved.error })}
          </AppText>
          <Button ref={discardRef} label={t('title.discard')} onPress={() => setConfirmDiscard(true)} testID="discard" style={buttonStyle} fit={consoleMode} />
        </View>
      ) : null}
      <Button label={t('title.continue')} variant="primary" disabled={!canContinue} onPress={() => void onContinue()} testID="continue" style={buttonStyle} fit={consoleMode} />
      <Button label={t('title.newRun')} variant="primary" onPress={onNewRun} testID="new-run" style={buttonStyle} fit={consoleMode} />
    </View>
  );

  const hud = (
    <Hud
      screen="title"
      zoneLabel={t('screen.title')}
      onExtra={() => setOptionsOpen(true)}
      extraRef={optionsRef}
      extraLabel={t('title.optionsOpen')}
      extraTestID="hud-options"
      onSettings={settings.open}
      settingsRef={settings.openerRef}
    />
  );

  return (
    <View style={styles.root}>
      <Screen screen="title" testID="title-screen" hud={hud} primary={main} actions={actions} backdrop={backdrop} />
      {settings.sheet}
      <Sheet visible={optionsOpen} onClose={() => setOptionsOpen(false)} title={t('title.options')} openerRef={optionsRef} testID="options-sheet">
        <View style={styles.field}>
          <AppText style={[styles.label, { color: theme.text }]} nativeID="title-seed-label">
            {t('title.seed')}
          </AppText>
          <TextInput
            value={seed}
            onChangeText={setSeed}
            maxLength={SEED_MAX}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            accessibilityLabel={t('title.seed')}
            accessibilityLabelledBy="title-seed-label"
            accessibilityHint={t('title.seedHint')}
            testID="seed-input"
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER / (appSize / 100)}
            style={scaleTextStyle([styles.input, { color: theme.text, borderTopColor: theme.text, borderLeftColor: theme.text, borderRightColor: theme.outline, borderBottomColor: theme.outline, backgroundColor: theme.surface }], appSize)}
          />
          {/* Read once, as the field's hint; hidden here so screen readers do not repeat it. */}
          <AppText style={[styles.sheetHint, { color: theme.muted }]} importantForAccessibility="no" accessibilityElementsHidden>
            {t('title.seedHint')}
          </AppText>
        </View>
        <AppText style={[styles.sheetHint, { color: theme.muted }]} testID="saves-note">
          {t('title.savesNoteDevice')}
        </AppText>
        {onOpenDevTools ? (
          <Pressable
            onPress={() => {
              // The dev tools are another route: the sheet is closed when the title comes back.
              setOptionsOpen(false);
              onOpenDevTools();
            }}
            accessibilityRole="link" testID="dev-tools" style={styles.devLink}>
            <AppText style={[styles.devText, { color: theme.accent }]}>Dev tools</AppText>
          </Pressable>
        ) : null}
      </Sheet>
      <Sheet visible={confirmDiscard} onClose={() => setConfirmDiscard(false)} title={t('title.discard')} openerRef={discardRef} testID="discard-sheet">
        {/* The notice is cut to a few lines in the rail: its full text is here. */}
        {saved?.kind === 'corrupt' ? <AppText style={[styles.sheetHint, { color: theme.text }]}>{t('title.corrupt', { reason: saved.error })}</AppText> : null}
        <ConfirmPanel
          question={t('title.discardConfirm')}
          yes={t('title.discard')}
          no={t('title.discardCancel')}
          onYes={() => void onDiscard()}
          onNo={() => setConfirmDiscard(false)}
          testID="discard-confirm"
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  main: { gap: MAIN_GAP },
  mainFill: { flex: 1, minHeight: 0, gap: MAIN_GAP, padding: MAIN_PAD },
  heroBox: { flex: 1, minHeight: 0, justifyContent: 'center', overflow: 'hidden' },
  strip: { flexDirection: 'row', gap: 4 },
  card: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardBody: { alignItems: 'center', gap: 2 },
  cardName: { fontSize: NAME_SIZE, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: HINT_SIZE, textAlign: 'center' },
  rail: { padding: RAIL_PAD, gap: RAIL_GAP, flexShrink: 1 },
  warn: { gap: RAIL_GAP },
  notice: { fontSize: NOTICE_SIZE, borderLeftWidth: 4, paddingLeft: 8 },
  field: { gap: 6 },
  label: { fontSize: 18, fontWeight: '700' },
  // A sunken pixel well: dark top-left edge, light bottom-right edge.
  input: { minHeight: TOUCH, borderWidth: 3, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 8, fontSize: 18 },
  sheetHint: { fontSize: 15 },
  devLink: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  devText: { fontSize: 15, textDecorationLine: 'underline' },
});
