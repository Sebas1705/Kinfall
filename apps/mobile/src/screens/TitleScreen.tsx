// Title screen: continue a saved run, or start a new one from a seed and a starter. Mirrors the web
// title (apps/web/src/view/screens/title.ts) with the device wording of the save notes.
import { CONTENT } from '@webgames/core/content';
import { lookup } from '@webgames/core/content/lookup';
import { speciesName, t, type StringKey } from '@webgames/core/platform/i18n';
import { SEED_MAX, cleanSeed } from '@webgames/core/platform/seed';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CreatureSprite } from '../art/CreatureSprite';
import { ElementIcon } from '../art/ElementIcon';
import { useLang } from '../platform/LangContext';
import { randomSeed as defaultRandomSeed } from '../platform/random';
import { useRunSession } from '../run/useRunSession';
import { TOUCH, useTheme, type Theme } from '../theme';
import { Button } from '../ui/Button';
import { ConfirmPanel } from '../ui/ConfirmPanel';
import { LangToggle } from '../ui/LangToggle';
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

function StarterCard({ id, checked, onSelect, theme }: { id: string; checked: boolean; onSelect: () => void; theme: Theme }) {
  const sp = lookup(CONTENT).species(id);
  const name = speciesName(sp);
  const elements = sp.elements.map((e) => t(`element.${e}` as StringKey)).join(' / ');
  const key = hintKey(sp.elements[0]);
  const hint = key ? t(key) : '';
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={hint ? `${name}, ${elements}. ${hint}` : `${name}, ${elements}`}
      testID={`starter-${id}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: checked ? theme.accent : pressed ? theme.focus : theme.outline,
          borderWidth: checked ? 3 : 2,
        },
      ]}
    >
      <CreatureSprite species={sp} scale={3} />
      <View style={styles.cardText}>
        <Text style={[styles.cardName, { color: theme.text }]}>
          {checked ? '● ' : '○ '}
          {name}
        </Text>
        <View style={styles.elementRow}>
          {sp.elements.map((e) => (
            <ElementIcon key={e} element={e} scale={2} />
          ))}
          <Text style={[styles.elementText, { color: theme.muted }]}>{elements}</Text>
        </View>
        {hint ? <Text style={[styles.hint, { color: theme.muted }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function TitleScreen({ onRunReady, onOpenDevTools, randomSeed = defaultRandomSeed }: TitleScreenProps) {
  const { session, snapshot } = useRunSession();
  const theme = useTheme();
  const { twoPane } = useLayout();
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

  const intro = (
    <>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.appName, { color: theme.text }]} testID="app-name">
            {t('app.title')}
          </Text>
          <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
            {t('screen.title')}
          </Text>
        </View>
        <LangToggle />
      </View>

      {saved?.kind === 'unavailable' ? (
        <Text style={[styles.notice, { color: theme.text, borderColor: theme.border }]} testID="saves-unavailable">
          {t('title.savesUnavailableDevice')}
        </Text>
      ) : null}
      {saved?.kind === 'corrupt' ? (
        <View style={[styles.warn, { borderColor: theme.danger, backgroundColor: theme.surface }]} testID="corrupt-notice">
          <Text style={[styles.noticeText, { color: theme.text }]}>{t('title.corrupt', { reason: saved.error })}</Text>
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
        <Text style={[styles.label, { color: theme.text }]} nativeID="title-seed-label">
          {t('title.seed')}
        </Text>
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
          style={[styles.input, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.surface }]}
        />
        {/* Read once, as the field's hint; hidden here so screen readers do not repeat it. */}
        <Text style={[styles.hint, { color: theme.muted }]} importantForAccessibility="no" accessibilityElementsHidden>
          {t('title.seedHint')}
        </Text>
      </View>
    </>
  );
  const pickAndStart = (
    <>
      <View style={styles.starters} accessibilityRole="radiogroup" accessibilityLabel={t('title.starter')} testID="starters">
        <Text style={[styles.label, { color: theme.text }]} accessibilityRole="header">
          {t('title.starter')}
        </Text>
        {starters.map((id) => (
          <StarterCard key={id} id={id} checked={id === starter} onSelect={() => setStarter(id)} theme={theme} />
        ))}
      </View>

      <Button label={t('title.newRun')} variant="primary" onPress={onNewRun} testID="new-run" />
    </>
  );
  const notes = (
    <>
      <Text style={[styles.hint, { color: theme.muted }]} testID="saves-note">
        {t('title.savesNoteDevice')}
      </Text>

      {onOpenDevTools ? (
        <Pressable onPress={onOpenDevTools} accessibilityRole="link" testID="dev-tools" style={styles.devLink}>
          <Text style={[styles.devText, { color: theme.accent }]}>Dev tools</Text>
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
  titleBlock: { gap: 2 },
  appName: { fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  heading: { fontSize: 28, fontWeight: '700' },
  notice: { fontSize: 16, borderWidth: 1, borderRadius: 10, padding: 12 },
  warn: { borderWidth: 2, borderRadius: 10, padding: 12, gap: 12 },
  noticeText: { fontSize: 16 },
  field: { gap: 6 },
  label: { fontSize: 18, fontWeight: '700' },
  input: { minHeight: TOUCH, borderWidth: 2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 18 },
  hint: { fontSize: 15 },
  starters: { gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, minHeight: TOUCH },
  cardText: { flex: 1, gap: 4 },
  cardName: { fontSize: 18, fontWeight: '700' },
  elementRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  elementText: { fontSize: 15 },
  devLink: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  devText: { fontSize: 15, textDecorationLine: 'underline' },
});
