// Title screen: continue a saved run, or start a new one from a seed and a starter. Mirrors the web
// title (apps/web/src/view/screens/title.ts) with the device wording of the save notes.
import { CONTENT } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import { speciesName, t, type StringKey } from '@kinfall/core/platform/i18n';
import { SEED_MAX, cleanSeed } from '@kinfall/core/platform/seed';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { AppText } from '../ui/AppText';

import { CreatureSprite } from '../art/CreatureSprite';
import { ElementIcon } from '../art/ElementIcon';
import { TitleHero } from '../art/TitleHero';
import { useLang } from '../platform/LangContext';
import { useReducedMotion } from '../platform/motionSetting';
import { randomSeed as defaultRandomSeed } from '../platform/random';
import { useRunSession } from '../run/useRunSession';
import { TOUCH, useTheme } from '../theme';
import { Button } from '../ui/Button';
import { ConfirmPanel } from '../ui/ConfirmPanel';
import { LangToggle } from '../ui/LangToggle';
import { MotionToggle } from '../ui/MotionToggle';
import { FramePressable } from '../ui/PixelFrame';
import { Screen } from '../ui/Screen';
import { useLayout } from '../ui/windowSize';

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

function StarterCard({ id, checked, onSelect }: { id: string; checked: boolean; onSelect: () => void }) {
  const sp = lookup(CONTENT).species(id);
  const name = speciesName(sp);
  const elements = sp.elements.map((e) => t(`element.${e}` as StringKey)).join(' / ');
  const key = hintKey(sp.elements[0]);
  const hint = key ? t(key) : '';
  return (
    // The chosen starter wears the ornate plate; the dot in the name says it in text too.
    <FramePressable
      onPress={onSelect}
      kind={checked ? 'plate' : 'button'}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={hint ? `${name}, ${elements}. ${hint}` : `${name}, ${elements}`}
      testID={`starter-${id}`}
      padY={6}
    >
      {({ textColor }) => (
        <View style={styles.card}>
          <CreatureSprite species={sp} scale={3} />
          <View style={styles.cardText}>
            <AppText style={[styles.cardName, { color: textColor }]}>
              {checked ? '● ' : '○ '}
              {name}
            </AppText>
            <View style={styles.elementRow}>
              {sp.elements.map((e) => (
                <ElementIcon key={e} element={e} scale={2} />
              ))}
              <AppText style={[styles.elementText, { color: textColor }]}>{elements}</AppText>
            </View>
            {hint ? <AppText style={[styles.hint, { color: textColor }]}>{hint}</AppText> : null}
          </View>
        </View>
      )}
    </FramePressable>
  );
}

export function TitleScreen({ onRunReady, onOpenDevTools, randomSeed = defaultRandomSeed }: TitleScreenProps) {
  const { session, snapshot } = useRunSession();
  const theme = useTheme();
  const { twoPane } = useLayout();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  useLang();
  const starters = CONTENT.starters;
  const [seed, setSeed] = useState(snapshot.titleSeed);
  const [starter, setStarter] = useState(starters[0] ?? '');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busy = useRef(false);

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

  const hero = (
    <TitleHero
      starter={starter}
      reducedMotion={reduceMotion}
      initialWidth={twoPane ? width / 2 - 40 : width}
      style={twoPane ? null : styles.bleed}
    />
  );
  const intro = (
    <>
      <View style={styles.topRow}>
        <AppText style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
          {t('screen.title')}
        </AppText>
        <View style={styles.settings}>
          <LangToggle />
          <MotionToggle />
        </View>
      </View>

      {saved?.kind === 'unavailable' ? (
        <AppText style={[styles.notice, { color: theme.text, borderColor: theme.border }]} testID="saves-unavailable">
          {t('title.savesUnavailableDevice')}
        </AppText>
      ) : null}
      {saved?.kind === 'corrupt' ? (
        <View style={[styles.warn, { borderColor: theme.danger, backgroundColor: theme.surface }]} testID="corrupt-notice">
          <AppText style={[styles.noticeText, { color: theme.text }]}>{t('title.corrupt', { reason: saved.error })}</AppText>
          {confirmDiscard ? (
            <ConfirmPanel
              question={t('title.discardConfirm')}
              yes={t('title.discard')}
              no={t('title.discardCancel')}
              onYes={() => void onDiscard()}
              onNo={() => setConfirmDiscard(false)}
              testID="discard-confirm"
            />
          ) : (
            <Button label={t('title.discard')} onPress={() => setConfirmDiscard(true)} testID="discard" />
          )}
        </View>
      ) : null}

      <Button label={t('title.continue')} variant="primary" disabled={!canContinue} onPress={() => void onContinue()} testID="continue" />

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
          style={[styles.input, { color: theme.text, borderTopColor: theme.text, borderLeftColor: theme.text, borderRightColor: theme.outline, borderBottomColor: theme.outline, backgroundColor: theme.surface }]}
        />
        {/* Read once, as the field's hint; hidden here so screen readers do not repeat it. */}
        <AppText style={[styles.hint, { color: theme.muted }]} importantForAccessibility="no" accessibilityElementsHidden>
          {t('title.seedHint')}
        </AppText>
      </View>
    </>
  );
  const pickAndStart = (
    <>
      <View style={styles.starters} accessibilityRole="radiogroup" accessibilityLabel={t('title.starter')} testID="starters">
        <AppText style={[styles.label, { color: theme.text }]} accessibilityRole="header">
          {t('title.starter')}
        </AppText>
        {starters.map((id) => (
          <StarterCard key={id} id={id} checked={id === starter} onSelect={() => setStarter(id)} />
        ))}
      </View>

      <Button label={t('title.newRun')} variant="primary" onPress={onNewRun} testID="new-run" />
    </>
  );
  const notes = (
    <>
      <AppText style={[styles.hint, { color: theme.muted }]} testID="saves-note">
        {t('title.savesNoteDevice')}
      </AppText>

      {onOpenDevTools ? (
        <Pressable onPress={onOpenDevTools} accessibilityRole="link" testID="dev-tools" style={styles.devLink}>
          <AppText style={[styles.devText, { color: theme.accent }]}>Dev tools</AppText>
        </Pressable>
      ) : null}
    </>
  );

  // Two panes (tablets, foldables, landscape): continue and the seed on the left, the starters and
  // "New run" on the right, so the start button is on the first screen even on a landscape phone.
  if (twoPane) {
    return (
      <Screen testID="title-screen">
        <View style={styles.panes} testID="title-two-pane">
          <View style={styles.pane}>
            {hero}
            {intro}
            {notes}
          </View>
          <View style={styles.pane}>{pickAndStart}</View>
        </View>
      </Screen>
    );
  }
  return (
    <Screen testID="title-screen">
      {hero}
      {intro}
      {pickAndStart}
      {notes}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panes: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  pane: { flex: 1, gap: 16, minWidth: 0 },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settings: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  bleed: { marginHorizontal: -16, marginTop: -16 },
  heading: { fontSize: 28, fontWeight: '700' },
  notice: { fontSize: 16, borderWidth: 2, padding: 12 },
  warn: { borderWidth: 2, borderLeftWidth: 6, padding: 12, gap: 12 },
  noticeText: { fontSize: 16 },
  field: { gap: 6 },
  label: { fontSize: 18, fontWeight: '700' },
  // A sunken pixel well: dark top-left edge, light bottom-right edge.
  input: { minHeight: TOUCH, borderWidth: 3, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 8, fontSize: 18 },
  hint: { fontSize: 15 },
  starters: { gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { flex: 1, gap: 4 },
  cardName: { fontSize: 18, fontWeight: '700' },
  elementRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  elementText: { fontSize: 15 },
  devLink: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  devText: { fontSize: 15, textDecorationLine: 'underline' },
});
