// Battle screen of a run, touch only and one-handed: the rival's HUD plate, the battle stage (the
// run's zone scene with both creatures on their platforms, effects and floating numbers; Skia,
// hidden from screen readers), the player's HUD plate, then the choices, the persistent "Abandon
// run" button and the turn log last (so a growing log never moves the buttons). Turns run through
// core's turn controller (useBattleTurns) and the Animated scene (useBattleScene), whose events also
// start the stage's effects. HP, focus and status are always written out as text, never colour
// alone.
//
// Three layouts (src/ui/windowSize.ts):
// - stacked: one scrolling column (phones at normal text sizes); the stage runs edge to edge;
// - compact: when large text or a short window would push the choices below the creatures, the
//   HUDs shrink (HP and focus on one line), the stage gets a smaller share of the height and the
//   choices and Abandon are pinned at the bottom of the screen;
// - two panes: on tablets, unfolded foldables and phones in landscape the stage, the HUDs and the
//   log sit on the left and the choices on the right.
// The abandon confirmation replaces the Abandon button where it was.
import { CONTENT, type ElementId } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import type { MenuEntry } from '@kinfall/core/models/menu';
import { speciesName, t } from '@kinfall/core/platform/i18n';
import type { RunState } from '@kinfall/core/sim/run/types';
import type { BattleState, Side } from '@kinfall/core/sim/state';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { AppText } from '../ui/AppText';

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
import { Button } from '../ui/Button';
import { FramePressable, Plate, usePlateText } from '../ui/PixelFrame';
import { PixelBar } from '../ui/PixelBar';
import { Screen } from '../ui/Screen';
import { useLayout } from '../ui/windowSize';

/** Turns of the battle log kept on screen (the latest one is the live region). */
export const BATTLE_LOG_VISIBLE = 4;

/** Sky rows the compact battle crops (the band keeps both creatures and their platforms). */
export const COMPACT_CROP_TOP = 50;

/** Share of the window height the stage may take: stacked, compact and two-pane layouts. */
export const STAGE_HEIGHT_SHARE = { stacked: 0.42, compact: 0.28, twoPane: 0.5 } as const;

export interface BattleViewProps {
  /** The run as it was when the battle screen opened (its phase is this battle). */
  run: RunState;
  /** The battle is over and its last turn has played: the Run screen shows the next phase. */
  onEnd: () => void;
  /** First step of the two-step abandon (the Run screen shows the confirmation). */
  onAbandon: () => void;
  /** Hides the abandon button while its confirmation is open (focus is then left alone). */
  confirming: boolean;
  /** The abandon confirmation, drawn where the Abandon button was while `confirming`. */
  confirmPanel?: ReactNode;
  /** Above the battle (the save warning). */
  header?: ReactNode;
  /** Below everything (the seed line). */
  trailer?: ReactNode;
  /** The main scroll area (the Run screen scrolls it to the top on a phase change). */
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

function Hud({ side, c, motion, intent, theme, compact }: { side: Side; c: ShownCreature; motion: SideMotion; intent: string | null; theme: Theme; compact: boolean }) {
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
      pad={compact ? 2 : 4}
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
      {compact ? (
        <>
          <AppText style={[styles.hudValue, { color: ink.text }]}>
            <AppText testID={`hud-${side}-hp`}>{hp}</AppText>
            {' · '}
            <AppText testID={`hud-${side}-focus`}>{focus}</AppText>
          </AppText>
          <PixelBar kind="hp" value={c.hp} max={c.maxHp} progress={motion.hp} />
        </>
      ) : (
        <View style={styles.meters}>
          <View style={styles.meter}>
            <AppText style={[styles.hudValue, { color: ink.text }]} testID={`hud-${side}-hp`}>
              {hp}
            </AppText>
            <PixelBar kind="hp" value={c.hp} max={c.maxHp} progress={motion.hp} />
          </View>
          <View style={styles.meter}>
            <AppText style={[styles.hudValue, { color: ink.text }]} testID={`hud-${side}-focus`}>
              {focus}
            </AppText>
            <PixelBar kind="focus" value={c.focus} max={c.maxFocus} />
          </View>
        </View>
      )}
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
    >
      {({ textColor }) => (
        <View style={styles.choiceText}>
          <AppText style={[styles.choiceLabel, { color: textColor }]}>{entry.label}</AppText>
          {detail ? <AppText style={[styles.choiceDetail, { color: textColor }]}>{detail}</AppText> : null}
        </View>
      )}
    </FramePressable>
  );
}

function LogPanel({ log }: { log: BattleLog }) {
  const ink = usePlateText();
  // iOS: the newest turn once (keyed by the turn count, so a language rewrite never repeats it).
  useAnnounce(log.fresh.length > 0 ? log.turns.length : null, log.fresh.join(' '));
  if (log.turns.length === 0) return null;
  const hasFresh = log.fresh.length > 0;
  const older = (hasFresh ? log.turns.slice(0, -1) : log.turns).slice(-(BATTLE_LOG_VISIBLE - (hasFresh ? 1 : 0)));
  return (
    <Plate style={styles.log} testID="battle-log">
      <AppText style={[styles.logHeading, { color: ink.text }]} accessibilityRole="header">
        {t('battle.log')}
      </AppText>
      {older.flat().map((line, i) => (
        <AppText key={`o${i}`} style={[styles.logLine, { color: ink.muted }]} testID="battle-log-line">
          {line}
        </AppText>
      ))}
      <View accessibilityLiveRegion="polite" testID="battle-log-fresh">
        {log.fresh.map((line, i) => (
          <AppText key={`n${i}`} style={[styles.logLine, { color: ink.text }]} testID="battle-log-line">
            {line}
          </AppText>
        ))}
      </View>
    </Plate>
  );
}

export function BattleView({ run, onEnd, onAbandon, confirming, confirmPanel, header, trailer, scrollRef, testID }: BattleViewProps) {
  const theme = useTheme();
  const lang = useLang();
  const { session } = useRunSession();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const layout = useLayout();
  const compact = layout.compactBattle;
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

  // After a settled turn, screen-reader focus goes to the choices, unless the abandon confirmation is open.
  const prompt = useRef<ComponentRef<typeof AppText>>(null);
  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;
  useEffect(() => {
    if (focusRequest === 0 || confirmingRef.current || !prompt.current) return;
    AccessibilityInfo.sendAccessibilityEvent(prompt.current, 'focus');
  }, [focusRequest]);

  const state = choices?.state ?? null;
  const model = choices?.model ?? null;
  const moves = model?.entries.filter((e) => e.action.type === 'move') ?? [];
  const swaps = model?.entries.filter((e) => e.action.type === 'swap') ?? [];
  const activeSpecies = state ? state.teams.player[state.active.player]?.speciesId : undefined;
  const moveIds = activeSpecies ? lookup(CONTENT).species(activeSpecies).moves : [];

  const renderGroup = (heading: string, entries: MenuEntry[], kind: 'move' | 'swap') =>
    entries.length === 0 || !state ? null : (
      <View style={styles.group} testID={`choices-${kind}`}>
        <AppText style={[styles.groupHeading, { color: theme.muted }]} accessibilityRole="header">
          {heading}
        </AppText>
        <View style={styles.groupList}>
          {entries.map((entry, i) => {
            const element = entry.action.type === 'move' ? lookup(CONTENT).move(moveIds[entry.action.moveIndex]!).element : null;
            return (
              <ChoiceButton
                key={`${kind}${i}`}
                entry={entry}
                detail={choiceDetail(entry, state)}
                disabled={entry.disabled || busy}
                onPress={() => choices!.pick(entry.action)}
                element={element}
              />
            );
          })}
        </View>
      </View>
    );

  const heading = (
    <AppText style={[styles.heading, { color: theme.text }]} accessibilityRole="header" testID="battle-heading">
      {phaseHeading(opened)}
    </AppText>
  );
  const share = layout.twoPane ? STAGE_HEIGHT_SHARE.twoPane : compact ? STAGE_HEIGHT_SHARE.compact : STAGE_HEIGHT_SHARE.stacked;
  // Phones: the stage runs edge to edge (the screen's 16dp side padding is bled out).
  const bleed = !layout.twoPane && layout.width === 'compact';
  const paneWidth = layout.twoPane ? Math.min(width, 1200) * (5 / 9) - 40 : Math.min(width, 720 + 32) - (bleed ? 0 : 32);
  const stage = (
    <BattleStage
      zone={key.zone}
      seed={key.seed}
      shown={shown}
      motion={motion}
      director={director}
      reducedMotion={reduceMotion}
      maxHeight={Math.max(120, height * share)}
      initialWidth={paneWidth}
      // Compact: a short band from the far creature's head down to the platforms.
      frame={compact ? { cropTop: COMPACT_CROP_TOP } : undefined}
      style={bleed ? styles.bleed : styles.framed}
    />
  );
  const enemyHud = shown.enemy ? <Hud side="enemy" c={shown.enemy} motion={motion.enemy} intent={model?.intent ?? null} theme={theme} compact={compact} /> : null;
  const playerHud = shown.player ? <Hud side="player" c={shown.player} motion={motion.player} intent={null} theme={theme} compact={compact} /> : null;
  // The stage sits between the two plates; in the compact layout (little room above the pinned
  // choices) both plates come first, so HP and focus are on the first screen and the stage after.
  const sceneView = compact ? (
    <View style={styles.scene}>
      {enemyHud}
      {playerHud}
      {stage}
    </View>
  ) : (
    <View style={styles.scene}>
      {enemyHud}
      {stage}
      {playerHud}
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
      {confirming ? (confirmPanel ?? null) : <Button label={t('map.abandon')} onPress={onAbandon} testID="abandon" />}
    </View>
  );
  // Below the choices (or beside them), so a growing log never moves the buttons under the thumb.
  const logPanel = <LogPanel log={log} />;

  if (layout.twoPane) {
    return (
      <Screen ref={scrollRef} testID={testID}>
        {header}
        <View style={styles.battle} testID="battle-screen">
          {heading}
          <View style={styles.panes} testID="battle-two-pane">
            <View style={[styles.pane, styles.paneScene]}>
              {sceneView}
              {logPanel}
            </View>
            <View style={[styles.pane, styles.paneActions]}>{actions}</View>
          </View>
        </View>
        {trailer}
      </Screen>
    );
  }
  return (
    <Screen ref={scrollRef} testID={testID} footer={compact ? actions : undefined} footerTestID="battle-footer">
      {header}
      <View style={styles.battle} testID="battle-screen">
        {heading}
        {sceneView}
        {compact ? null : actions}
        {logPanel}
      </View>
      {trailer}
    </Screen>
  );
}

const styles = StyleSheet.create({
  battle: { gap: 12 },
  panes: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  pane: { gap: 12, minWidth: 0 },
  paneScene: { flex: 5 },
  paneActions: { flex: 4 },
  actions: { gap: 12 },
  heading: { fontSize: 24, fontWeight: '700' },
  scene: { gap: 8 },
  bleed: { marginHorizontal: -16 },
  framed: { borderRadius: 4 },
  hud: { gap: 4 },
  hudTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  hudElements: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hudSide: { fontSize: 13, fontWeight: '600' },
  hudSideName: { marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: 0.5 },
  hudName: { fontSize: 18, fontWeight: '700' },
  hudValue: { fontSize: 15 },
  meters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  meter: { flexGrow: 1, flexBasis: 130, gap: 2 },
  chip: { alignSelf: 'flex-start', borderWidth: 2, paddingHorizontal: 10, paddingVertical: 2, marginTop: 2 },
  chipText: { fontSize: 14, fontWeight: '700' },
  intent: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  log: { gap: 2 },
  logHeading: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  logLine: { fontSize: 15 },
  choices: { gap: 12 },
  prompt: { fontSize: 18, fontWeight: '700' },
  group: { gap: 6 },
  groupHeading: { fontSize: 14, fontWeight: '700' },
  groupList: { gap: 10 },
  choice: { alignItems: 'stretch' },
  choiceText: { flexShrink: 1, gap: 2 },
  choiceLabel: { fontSize: 17, fontWeight: '600' },
  choiceDetail: { fontSize: 14 },
});
