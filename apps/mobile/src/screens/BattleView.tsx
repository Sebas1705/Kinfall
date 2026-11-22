// Battle screen of a run in the console layout (no page scroll): a HUD bar with the party chips, a
// Log button and Settings; the primary region holds the rival's plate, the battle stage (the run's
// zone scene with both creatures on their platforms, effects and floating numbers; Skia, hidden from
// screen readers) and the player's plate; the actions region holds the choices, one tap each, as a
// two-column grid: a right rail in landscape, a bottom band in portrait. Turns run through core's
// turn controller (useBattleTurns) and the Animated scene (useBattleScene), whose events also start
// the stage's effects. HP, focus and status are always written out as text, never colour alone.
//
// The log is a one-line message over the stage (the newest turn, a polite live region that sits
// OUTSIDE the part hidden behind a sheet, see Screen's `overlay` and `backdrop`); the full log opens
// in a sheet from the HUD's Log button. Abandon lives in the Settings sheet (the menu of this
// screen): its confirmation replaces the button there, and Android back opens the sheet with the
// confirmation showing. When the window does not fit the contract (200% text, tiny windows) the
// Screen falls back to a pinned HUD and actions with the stage scrolling in between.
//
// Rotation re-lays the same view out: nothing here is keyed on the orientation, so the battle, its
// log and the animation survive it.
import { CONTENT, type ElementId } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import type { MenuEntry } from '@kinfall/core/models/menu';
import type { PartyRow } from '@kinfall/core/models/party';
import { speciesName, t } from '@kinfall/core/platform/i18n';
import type { RunState } from '@kinfall/core/sim/run/types';
import type { BattleState, Side } from '@kinfall/core/sim/state';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';

import { BattleStage, STAGE_SPRITE_SIZE } from '../art/BattleStage';
import { ElementIcon } from '../art/ElementIcon';
import { elementGrid } from '../art/sceneCache';
import { createStageDirector, startEventEffects } from '../art/stageDirector';
import { sceneKeyOf } from '../art/stageLayout';
import { useBattleTurns, type BattleLog } from '../battle/useBattleController';
import { useBattleScene, type SideMotion } from '../battle/useBattleScene';
import type { ShownCreature } from '../battle/sceneModel';
import { useAnnounce } from '../platform/announce';
import { useLang } from '../platform/LangContext';
import { useReducedMotion } from '../platform/motionSetting';
import { phaseHeading } from '../run/session';
import { useRunSession } from '../run/useRunSession';
import { useTheme, type Theme } from '../theme';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Hud as TopBar } from '../ui/Hud';
import { FramePressable, Plate, usePlateText } from '../ui/PixelFrame';
import { PixelBar } from '../ui/PixelBar';
import { Screen } from '../ui/Screen';
import { Sheet, useSheetBackdropProps } from '../ui/Sheet';
import { useLayoutSpec } from '../ui/useLayoutSpec';
import { useSettingsSheet } from '../ui/useSettingsSheet';

/** Sky rows the short stage crops (the band keeps both creatures and their platforms). */
export const COMPACT_CROP_TOP = 50;

/** Below this stage height (dp) the stage crops more sky. */
const SHORT_STAGE_DP = 160;

/** Columns of the choice grid (a rail is too narrow and a band too short for one). */
export const CHOICE_COLUMNS = 2;

export interface BattleViewProps {
  /** The run as it was when the battle screen opened (its phase is this battle). */
  run: RunState;
  /** The battle is over and its last turn has played: the Run screen shows the next phase. */
  onEnd: () => void;
  /** First step of the two-step abandon (the Run screen shows the confirmation). */
  onAbandon: () => void;
  /** The Settings sheet closed while the confirmation was open: the Run screen drops it. */
  onCancelAbandon?: () => void;
  /** The abandon confirmation is open (focus is then left alone). */
  confirming: boolean;
  /** The abandon confirmation, drawn where the Abandon button was (in the Settings sheet) while `confirming`. */
  confirmPanel?: ReactNode;
  /** Above the battle (the save warning). */
  header?: ReactNode;
  /** In the Settings sheet, under the Abandon button (the seed line). */
  trailer?: ReactNode;
  /** The scroll area of the fallback layout (the Run screen scrolls it to the top on a phase change). */
  scrollRef?: Ref<ScrollViewInstance>;
  testID?: string;
}

const speciesLabel = (id: string) => speciesName(lookup(CONTENT).species(id));

/** The screen-reader summary of one side (the web's hud.summary text, plus the status). */
export function hudLabel(side: Side, c: ShownCreature): string {
  const sp = lookup(CONTENT).species(c.speciesId);
  const line = t('hud.summary', {
    side: t(side === 'player' ? 'hud.player' : 'hud.enemy'),
    species: speciesName(sp),
    elements: sp.elements.map((el) => t(`element.${el}`)).join(' / '),
    hp: c.hp,
    maxHp: c.maxHp,
    focus: c.focus,
    maxFocus: c.maxFocus,
  });
  return c.status ? `${line} ${t(`status.${c.status}`)}.` : line;
}

/** Visible detail of a choice: element, power and focus cost for a move; HP for a swap. */
export function choiceDetail(entry: MenuEntry, state: BattleState): string {
  if (entry.action.type !== 'move') return entry.detail ?? '';
  const active = state.teams.player[state.active.player];
  const id = active ? lookup(CONTENT).species(active.speciesId).moves[entry.action.moveIndex] : undefined;
  if (id === undefined) return entry.detail ?? '';
  const m = lookup(CONTENT).move(id);
  const parts = [t(`element.${m.element}`)];
  if (m.kind === 'damage' && m.power > 0) parts.push(t('battle.power', { power: m.power }));
  parts.push(t('menu.focusCost', { cost: m.focusCost }));
  return parts.join(' · ');
}

function CreaturePlate({ side, c, motion, intent, theme }: { side: Side; c: ShownCreature; motion: SideMotion; intent: string | null; theme: Theme }) {
  const ink = usePlateText();
  const sideName = t(side === 'player' ? 'hud.player' : 'hud.enemy');
  const hp = `${t('hud.hp')} ${c.hp}/${c.maxHp}`;
  const focus = `${t('hud.focus')} ${c.focus}/${c.maxFocus}`;
  const elements = lookup(CONTENT).species(c.speciesId).elements;
  return (
    <Plate
      style={styles.hud}
      accessible
      accessibilityLabel={intent ? `${hudLabel(side, c)} ${intent}` : hudLabel(side, c)}
      testID={`hud-${side}`}
      pad={2}
    >
      <View style={styles.hudTop}>
        <AppText style={[styles.hudName, { color: ink.text }]} testID={`hud-${side}-name`}>
          {speciesLabel(c.speciesId)}
        </AppText>
        <View style={styles.hudElements}>
          {elements.map((el) => (
            <ElementIcon key={el} element={el} scale={2} />
          ))}
          <AppText style={[styles.hudSide, { color: ink.muted }]}>{elements.map((el) => t(`element.${el}`)).join(' / ')}</AppText>
        </View>
        <AppText style={[styles.hudSide, styles.hudSideName, { color: ink.muted }]}>{sideName}</AppText>
      </View>
      <AppText style={[styles.hudValue, { color: ink.text }]}>
        <AppText testID={`hud-${side}-hp`}>{hp}</AppText>
        {' · '}
        <AppText testID={`hud-${side}-focus`}>{focus}</AppText>
      </AppText>
      <PixelBar kind="hp" value={c.hp} max={c.maxHp} progress={motion.hp} />
      {c.status ? (
        <Animated.View style={[styles.chip, { borderColor: theme.danger, transform: [{ scale: motion.chip }] }]} testID={`hud-${side}-status`}>
          <AppText style={[styles.chipText, { color: theme.danger }]}>{t(`status.${c.status}`)}</AppText>
        </Animated.View>
      ) : null}
      {intent ? (
        <AppText style={[styles.intent, { color: ink.text }]} testID="battle-intent">
          {intent}
        </AppText>
      ) : null}
    </Plate>
  );
}

function ChoiceButton({ entry, detail, disabled, onPress, element }: {
  entry: MenuEntry;
  detail: string;
  disabled: boolean;
  onPress: () => void;
  element: ElementId | null;
}) {
  const label = detail ? `${entry.label}, ${detail}` : entry.label;
  const icon = useMemo(() => (element ? { grid: elementGrid(element), cellDp: 3 } : null), [element]);
  return (
    <FramePressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      testID="battle-choice"
      icon={icon}
      iconTestID={element ? `element-${element}-icon` : undefined}
      style={styles.choice}
      padX={2}
      padY={0}
    >
      {({ textColor }) => (
        <View style={styles.choiceText}>
          <AppText style={[styles.choiceLabel, { color: textColor }]} numberOfLines={2}>
            {entry.label}
          </AppText>
          {detail ? (
            <AppText style={[styles.choiceDetail, { color: textColor }]} numberOfLines={3}>
              {detail}
            </AppText>
          ) : null}
        </View>
      )}
    </FramePressable>
  );
}

/** The newest turn of the log as one message line, a polite live region (it stays outside the part a sheet hides). */
function BattleMessage({ log, landscape }: { log: BattleLog; landscape: boolean }) {
  const theme = useTheme();
  // iOS: the newest turn once (keyed by the turn count, so a language rewrite never repeats it).
  useAnnounce(log.fresh.length > 0 ? log.turns.length : null, log.fresh.join(' '));
  const fresh = log.fresh.join(' ');
  // After a rebuild (resume, language change) nothing is fresh: the last turn shows, but is not announced.
  const last = log.turns.length > 0 ? log.turns[log.turns.length - 1]!.join(' ') : '';
  const shown = fresh || last;
  const lines = landscape ? 1 : 2;
  return (
    <View
      style={[styles.message, shown ? { backgroundColor: theme.surface, borderColor: theme.border, borderTopWidth: 2 } : null]}
      testID="battle-message"
    >
      <View accessibilityLiveRegion="polite" testID="battle-log-fresh">
        {fresh ? (
          <AppText style={[styles.messageText, { color: theme.text }]} numberOfLines={lines} testID="battle-message-text">
            {fresh}
          </AppText>
        ) : null}
      </View>
      {!fresh && last ? (
        <AppText style={[styles.messageText, { color: theme.muted }]} numberOfLines={lines} testID="battle-message-text">
          {last}
        </AppText>
      ) : null}
    </View>
  );
}

/** The whole battle log, oldest first, in the Log sheet. */
function LogList({ log }: { log: BattleLog }) {
  const theme = useTheme();
  return (
    <View style={styles.log} testID="battle-log">
      {log.turns.flat().map((line, i) => (
        <AppText key={i} style={[styles.logLine, { color: theme.text }]} testID="battle-log-line">
          {line}
        </AppText>
      ))}
    </View>
  );
}

export function BattleView({ run, onEnd, onAbandon, onCancelAbandon, confirming, confirmPanel, header, trailer, scrollRef, testID }: BattleViewProps) {
  const theme = useTheme();
  const lang = useLang();
  const { session } = useRunSession();
  const reduceMotion = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const spec = useLayoutSpec('battle');
  const landscape = spec.orientation === 'landscape';
  const consoleMode = spec.mode === 'console';
  const primary = spec.regions.primary;
  // The run moves on as soon as the final turn is applied; the screen keeps the battle it opened with.
  const [opened] = useState(() => run);
  const initial = opened.phase.kind === 'battle' ? opened.phase.battle : null;
  if (!initial) throw new Error('BattleView needs a run in a battle phase');
  const key = useMemo(() => sceneKeyOf(initial.seed), [initial.seed]);
  const director = useMemo(() => createStageDirector(`${key.seed}|${initial.seed}`), [key.seed, initial.seed]);
  const onEvent = useCallback(
    (e: Parameters<typeof startEventEffects>[1], reduced: boolean) =>
      startEventEffects(director, e, reduced, { victory: t('result.victory'), defeat: t('result.defeat') }),
    [director],
  );
  const { scene, shown, motion } = useBattleScene(STAGE_SPRITE_SIZE, console, onEvent);
  const turns = useBattleTurns({ session, initial, scene, reducedMotion: reduceMotion, onEnd: () => onEnd() });
  const { busy, choices, log, focusRequest, controller } = turns;

  // A playing turn gets frames at the display rate; idle ambient life at most 30 fps.
  useEffect(() => {
    director.turnBusy = busy;
    director.wake();
  }, [busy, director]);

  // Language change: rebuild the texts now, or once when a pending turn settles.
  const firstLang = useRef(lang);
  useEffect(() => {
    if (lang === firstLang.current) return;
    firstLang.current = lang;
    controller.refreshText();
  }, [lang, controller]);

  // Sheets: the Settings sheet (with Abandon) and the Log sheet.
  const [logOpen, setLogOpen] = useState(false);
  const logRef = useRef<unknown>(null);
  const autoOpened = useRef(false);
  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;
  const closeSettings = useRef<() => void>(() => {});
  const abandonRow = confirming ? (
    (confirmPanel ?? null)
  ) : (
    <Button
      label={t('map.abandon')}
      onPress={() => {
        autoOpened.current = false;
        onAbandon();
      }}
      testID="abandon"
    />
  );
  const settings = useSettingsSheet({
    extra: (
      <>
        {abandonRow}
        {trailer}
      </>
    ),
    // Closing the sheet with the confirmation open (Close, Back, a tap outside) cancels it.
    onClose: () => {
      autoOpened.current = false;
      if (confirmingRef.current) onCancelAbandon?.();
    },
  });
  closeSettings.current = settings.close;
  const sheetOpen = settings.visible || logOpen;
  const backdrop = useSheetBackdropProps(sheetOpen);

  // Android back (or anything else) opened the confirmation with no sheet: show it where Abandon is.
  const wasConfirming = useRef(false);
  const settingsOpen = settings.open;
  const settingsVisible = settings.visible;
  const visibleRef = useRef(settingsVisible);
  visibleRef.current = settingsVisible;
  useEffect(() => {
    if (confirming && !wasConfirming.current && !visibleRef.current) {
      autoOpened.current = true;
      setLogOpen(false);
      settingsOpen();
    } else if (!confirming && wasConfirming.current && autoOpened.current) {
      // Answered "no" in a sheet nobody opened by hand: it goes away again.
      autoOpened.current = false;
      closeSettings.current();
    }
    wasConfirming.current = confirming;
  }, [confirming, settingsOpen]);

  // After a settled turn, screen-reader focus goes to the prompt, unless the abandon confirmation is
  // open; with a sheet open it waits for the sheet to close (the web does the same).
  const prompt = useRef<ComponentRef<typeof AppText>>(null);
  const sheetOpenRef = useRef(sheetOpen);
  sheetOpenRef.current = sheetOpen;
  const deferredFocus = useRef(false);
  const focusPrompt = () => {
    if (prompt.current) AccessibilityInfo.sendAccessibilityEvent(prompt.current, 'focus');
  };
  useEffect(() => {
    if (focusRequest === 0 || confirmingRef.current) return;
    if (sheetOpenRef.current) deferredFocus.current = true;
    else focusPrompt();
  }, [focusRequest]);
  useEffect(() => {
    if (sheetOpen || !deferredFocus.current) return;
    deferredFocus.current = false;
    if (!confirmingRef.current) focusPrompt();
  }, [sheetOpen]);

  const state = choices?.state ?? null;
  const model = choices?.model ?? null;
  const moves = model?.entries.filter((e) => e.action.type === 'move') ?? [];
  const swaps = model?.entries.filter((e) => e.action.type === 'swap') ?? [];
  const activeSpecies = state ? state.teams.player[state.active.player]?.speciesId : undefined;
  const moveIds = activeSpecies ? lookup(CONTENT).species(activeSpecies).moves : [];

  const renderGroup = (heading: string, entries: MenuEntry[], kind: 'move' | 'swap') => {
    if (entries.length === 0 || !state) return null;
    const rows: MenuEntry[][] = [];
    for (let i = 0; i < entries.length; i += CHOICE_COLUMNS) rows.push(entries.slice(i, i + CHOICE_COLUMNS));
    return (
      <View style={styles.group} testID={`choices-${kind}`}>
        <AppText style={[styles.groupHeading, { color: theme.muted }]} accessibilityRole="header">
          {heading}
        </AppText>
        <View style={styles.groupList}>
          {rows.map((row, r) => (
            <View key={r} style={styles.choiceRow}>
              {row.map((entry, c) => {
                const element = entry.action.type === 'move' ? lookup(CONTENT).move(moveIds[entry.action.moveIndex]!).element : null;
                return (
                  <View key={c} style={styles.cell}>
                    <ChoiceButton
                      entry={entry}
                      detail={choiceDetail(entry, state)}
                      disabled={entry.disabled || busy}
                      onPress={() => choices!.pick(entry.action)}
                      element={element}
                    />
                  </View>
                );
              })}
              {row.length < CHOICE_COLUMNS ? <View style={styles.cell} /> : null}
            </View>
          ))}
        </View>
      </View>
    );
  };

  // The stage fills what the plates leave of the primary region: measured once laid out, estimated
  // from the contract's primary rect before that (and in the fallback, where the region scrolls).
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const plateEstimate = Math.round(2 * 64 * Math.max(1, fontScale));
  const stageHeight = Math.max(consoleMode ? 48 : 120, Math.round(box && consoleMode ? box.height : primary.height - (consoleMode ? plateEstimate : 0)));
  const stageWidth = box?.width ?? primary.width;
  const stage = (
    <BattleStage
      zone={key.zone}
      seed={key.seed}
      shown={shown}
      motion={motion}
      director={director}
      reducedMotion={reduceMotion}
      maxHeight={stageHeight}
      initialWidth={stageWidth}
      // A short stage crops more sky: a band from the far creature's head down to the platforms.
      frame={stageHeight < SHORT_STAGE_DP ? { cropTop: COMPACT_CROP_TOP } : undefined}
      style={styles.stage}
    />
  );
  const enemyPlate = shown.enemy ? <CreaturePlate side="enemy" c={shown.enemy} motion={motion.enemy} intent={model?.intent ?? null} theme={theme} /> : null;
  const playerPlate = shown.player ? <CreaturePlate side="player" c={shown.player} motion={motion.player} intent={null} theme={theme} /> : null;
  const main = (
    <View style={consoleMode ? styles.mainFill : styles.main} testID="battle-screen">
      {header}
      {enemyPlate}
      <View
        style={consoleMode ? styles.stageBox : null}
        onLayout={
          consoleMode
            ? (e) => {
                const { width, height } = e.nativeEvent.layout;
                setBox((prev) => (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
              }
            : undefined
        }
      >
        {stage}
      </View>
      {playerPlate}
    </View>
  );
  const actions = (
    <View style={styles.actions} testID="battle-actions">
      <View style={styles.choices} accessibilityState={{ busy }} testID="battle-choices">
        {model?.prompt ? (
          <AppText ref={prompt} style={[styles.prompt, { color: theme.text }]} accessibilityRole="header" testID="battle-prompt">
            {model.prompt}
          </AppText>
        ) : null}
        {renderGroup(t('menu.moves'), moves, 'move')}
        {renderGroup(t('menu.team'), swaps, 'swap')}
      </View>
    </View>
  );

  // The chips show the party as it stands in this battle (HP changes live).
  const partyNow = (state ?? initial).teams.player;
  const party: PartyRow[] = partyNow.map((c) => ({ name: speciesLabel(c.speciesId), hp: c.hp, maxHp: c.maxHp }));
  const hud = (
    <TopBar
      screen="battle"
      zoneLabel={phaseHeading(opened)}
      party={party}
      onLog={() => setLogOpen(true)}
      logRef={logRef as never}
      onSettings={settings.open}
      settingsRef={settings.openerRef as never}
    />
  );

  return (
    <View style={styles.root}>
      <Screen
        ref={scrollRef}
        screen="battle"
        testID={testID}
        hud={hud}
        primary={main}
        actions={actions}
        backdrop={backdrop}
        overlay={<BattleMessage log={log} landscape={landscape} />}
      />
      {settings.sheet}
      <Sheet visible={logOpen} onClose={() => setLogOpen(false)} title={t('battle.log')} openerRef={logRef} testID="log-sheet">
        <LogList log={log} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  main: { gap: 8 },
  mainFill: { flex: 1, minHeight: 0, gap: 4, padding: 4 },
  stageBox: { flex: 1, minHeight: 0, justifyContent: 'center', overflow: 'hidden' },
  stage: { borderRadius: 4 },
  actions: { gap: 4, padding: 4, flexShrink: 1 },
  hud: { gap: 2 },
  hudTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 0 },
  hudElements: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hudSide: { fontSize: 12, fontWeight: '600' },
  hudSideName: { marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: 0.5 },
  hudName: { fontSize: 16, fontWeight: '700' },
  hudValue: { fontSize: 14 },
  chip: { alignSelf: 'flex-start', borderWidth: 2, paddingHorizontal: 8, paddingVertical: 0 },
  chipText: { fontSize: 13, fontWeight: '700' },
  intent: { fontSize: 14, fontWeight: '700' },
  message: { paddingHorizontal: 8 },
  messageText: { fontSize: 14, paddingVertical: 2 },
  log: { gap: 6 },
  logLine: { fontSize: 15 },
  choices: { gap: 4 },
  prompt: { fontSize: 15, fontWeight: '700' },
  group: { gap: 2 },
  groupHeading: { fontSize: 12, fontWeight: '700' },
  groupList: { gap: 4 },
  choiceRow: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, minWidth: 0 },
  choice: { alignItems: 'stretch' },
  choiceText: { flexShrink: 1, gap: 0 },
  choiceLabel: { fontSize: 15, fontWeight: '600' },
  choiceDetail: { fontSize: 12 },
});
