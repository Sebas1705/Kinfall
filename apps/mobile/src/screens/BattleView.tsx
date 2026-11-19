// Battle screen of a run, touch only and one-handed: the rival on top (HUD left, creature right),
// the player's creature below (creature left, HUD right), then the choices, the persistent "Abandon
// run" button and the turn log last (so a growing log never moves the buttons). Turns run through core's turn
// controller (useBattleTurns) and the Animated scene (useBattleScene). HP, focus and status are
// always written out as text, never colour alone.
//
// Three layouts (src/ui/windowSize.ts):
// - stacked: one scrolling column (phones at normal text sizes);
// - compact: when large text or a short window would push the choices below the creatures, the
//   HUDs shrink (smaller creatures, HP and focus on one line) and the choices and Abandon are pinned
//   at the bottom of the screen, so they are always reachable without scrolling the scene away;
// - two panes: on tablets, unfolded foldables and phones in landscape the scene and the log sit on
//   the left and the choices on the right.
// The abandon confirmation replaces the Abandon button where it was.
import { CONTENT, type ElementId } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import type { MenuEntry } from '@kinfall/core/models/menu';
import { moveName, speciesName, t } from '@kinfall/core/platform/i18n';
import type { RunState } from '@kinfall/core/sim/run/types';
import type { BattleState, Side } from '@kinfall/core/sim/state';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';

import { CreatureSprite } from '../art/CreatureSprite';
import { ElementIcon } from '../art/ElementIcon';
import { useBattleTurns, type BattleLog } from '../battle/useBattleController';
import { useBattleScene, type SideMotion } from '../battle/useBattleScene';
import type { ShownCreature } from '../battle/sceneModel';
import { useA11ySettings } from '../platform/a11ySettings';
import { useAnnounce } from '../platform/announce';
import { useLang } from '../platform/LangContext';
import { phaseHeading } from '../run/session';
import { useRunSession } from '../run/useRunSession';
import { TOUCH, useTheme, type Theme } from '../theme';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { useLayout } from '../ui/windowSize';

/** Turns of the battle log kept on screen (the latest one is the live region). */
export const BATTLE_LOG_VISIBLE = 4;

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

/** Sprite scale for the window width: 72dp creatures on small phones, 96dp otherwise; 48dp in the compact layout. */
export function spriteScaleFor(width: number, compact = false): number {
  if (compact) return 2;
  return width < 400 ? 3 : 4;
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

function Meter({ value, max, color, theme, motion }: { value: number; max: number; color: string; theme: Theme; motion?: Animated.Value }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={[styles.track, { backgroundColor: theme.surface2, borderColor: theme.border }]} importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[styles.fill, { backgroundColor: color, transform: [{ scaleX: motion ?? ratio }] }]}
      />
    </View>
  );
}

function Hud({ side, c, motion, intent, theme, compact }: { side: Side; c: ShownCreature; motion: SideMotion; intent: string | null; theme: Theme; compact: boolean }) {
  const sideName = t(side === 'player' ? 'hud.player' : 'hud.enemy');
  const hp = `${t('hud.hp')} ${c.hp}/${c.maxHp}`;
  const focus = `${t('hud.focus')} ${c.focus}/${c.maxFocus}`;
  return (
    <View
      style={[styles.hud, { borderColor: theme.border, backgroundColor: theme.surface }]}
      accessible
      accessibilityLabel={intent ? `${hudLabel(side, c)} ${intent}` : hudLabel(side, c)}
      testID={`hud-${side}`}
    >
      {compact ? (
        <Text style={[styles.hudName, { color: theme.text }]}>
          <Text style={[styles.hudSide, { color: theme.muted }]}>{`${sideName} · `}</Text>
          <Text testID={`hud-${side}-name`}>{speciesLabel(c.speciesId)}</Text>
        </Text>
      ) : (
        <>
          <Text style={[styles.hudSide, { color: theme.muted }]}>{sideName}</Text>
          <Text style={[styles.hudName, { color: theme.text }]} testID={`hud-${side}-name`}>
            {speciesLabel(c.speciesId)}
          </Text>
        </>
      )}
      {compact ? (
        <>
          <Text style={[styles.hudValue, { color: theme.text }]}>
            <Text testID={`hud-${side}-hp`}>{hp}</Text>
            {' · '}
            <Text testID={`hud-${side}-focus`}>{focus}</Text>
          </Text>
          <Meter value={c.hp} max={c.maxHp} color={theme.good} theme={theme} motion={motion.hp} />
        </>
      ) : (
        <>
          <Text style={[styles.hudValue, { color: theme.text }]} testID={`hud-${side}-hp`}>
            {hp}
          </Text>
          <Meter value={c.hp} max={c.maxHp} color={theme.good} theme={theme} motion={motion.hp} />
          <Text style={[styles.hudValue, { color: theme.text }]} testID={`hud-${side}-focus`}>
            {focus}
          </Text>
          <Meter value={c.focus} max={c.maxFocus} color={theme.accent} theme={theme} />
        </>
      )}
      {c.status ? (
        <Animated.View
          style={[styles.chip, { borderColor: theme.danger, transform: [{ scale: motion.chip }] }]}
          testID={`hud-${side}-status`}
        >
          <Text style={[styles.chipText, { color: theme.danger }]}>{t(`status.${c.status}`)}</Text>
        </Animated.View>
      ) : null}
      {intent ? (
        <Text style={[styles.intent, { color: theme.text }]} testID="battle-intent">
          {intent}
        </Text>
      ) : null}
    </View>
  );
}

function Creature({ c, motion, scale, theme }: { c: ShownCreature; motion: SideMotion; scale: number; theme: Theme }) {
  const size = 24 * scale;
  // A hit blinks the sprite (its opacity dips with the flash value), on top of the faint/swap fade.
  const opacity = useMemo(
    () => Animated.multiply(motion.opacity, motion.flash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.15] })),
    [motion],
  );
  return (
    <Animated.View
      style={[styles.creature, { width: size, height: size, transform: [{ translateX: motion.x }, { translateY: motion.y }] }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID={`creature-${c.speciesId}`}
    >
      {/* Heal pulse: a soft glow behind the creature. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow, { backgroundColor: theme.good, opacity: motion.pulse }]} />
      <Animated.View style={{ opacity }}>
        <CreatureSprite species={c.speciesId} scale={scale} />
      </Animated.View>
    </Animated.View>
  );
}

function ChoiceButton({ entry, detail, disabled, onPress, element, theme }: {
  entry: MenuEntry;
  detail: string;
  disabled: boolean;
  onPress: () => void;
  element: ElementId | null;
  theme: Theme;
}) {
  const label = detail ? `${entry.label}, ${detail}` : entry.label;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID="battle-choice"
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: disabled ? theme.surface2 : theme.surface, borderColor: pressed && !disabled ? theme.focus : disabled ? theme.border : theme.accent },
      ]}
    >
      {element ? <ElementIcon element={element} scale={3} /> : null}
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, { color: disabled ? theme.disabledText : theme.text }]}>{entry.label}</Text>
        {detail ? <Text style={[styles.choiceDetail, { color: disabled ? theme.disabledText : theme.muted }]}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

function LogPanel({ log, theme }: { log: BattleLog; theme: Theme }) {
  // iOS: the newest turn once (keyed by the turn count, so a language rewrite never repeats it).
  useAnnounce(log.fresh.length > 0 ? log.turns.length : null, log.fresh.join(' '));
  if (log.turns.length === 0) return null;
  const hasFresh = log.fresh.length > 0;
  const older = (hasFresh ? log.turns.slice(0, -1) : log.turns).slice(-(BATTLE_LOG_VISIBLE - (hasFresh ? 1 : 0)));
  return (
    <View style={[styles.log, { borderColor: theme.border, backgroundColor: theme.surface }]} testID="battle-log">
      <Text style={[styles.logHeading, { color: theme.text }]} accessibilityRole="header">
        {t('battle.log')}
      </Text>
      {older.flat().map((line, i) => (
        <Text key={`o${i}`} style={[styles.logLine, { color: theme.muted }]} testID="battle-log-line">
          {line}
        </Text>
      ))}
      <View accessibilityLiveRegion="polite" testID="battle-log-fresh">
        {log.fresh.map((line, i) => (
          <Text key={`n${i}`} style={[styles.logLine, { color: theme.text }]} testID="battle-log-line">
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function BattleView({ run, onEnd, onAbandon, confirming, confirmPanel, header, trailer, scrollRef, testID }: BattleViewProps) {
  const theme = useTheme();
  const lang = useLang();
  const { session } = useRunSession();
  const { reduceMotion } = useA11ySettings();
  const { width } = useWindowDimensions();
  const layout = useLayout();
  const compact = layout.compactBattle;
  const scale = spriteScaleFor(width, compact);
  const { scene, shown, motion } = useBattleScene(24 * scale);
  // The run moves on as soon as the final turn is applied; the screen keeps the battle it opened with.
  const [opened] = useState(() => run);
  const initial = opened.phase.kind === 'battle' ? opened.phase.battle : null;
  if (!initial) throw new Error('BattleView needs a run in a battle phase');
  const turns = useBattleTurns({ session, initial, scene, reducedMotion: reduceMotion, onEnd: () => onEnd() });
  const { busy, choices, log, focusRequest, controller } = turns;

  // Language change: rebuild the texts now, or once when a pending turn settles.
  const firstLang = useRef(lang);
  useEffect(() => {
    if (lang === firstLang.current) return;
    firstLang.current = lang;
    controller.refreshText();
  }, [lang, controller]);

  // After a settled turn, screen-reader focus goes to the choices, unless the abandon confirmation is open.
  const prompt = useRef<ComponentRef<typeof Text>>(null);
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
        <Text style={[styles.groupHeading, { color: theme.muted }]} accessibilityRole="header">
          {heading}
        </Text>
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
                theme={theme}
              />
            );
          })}
        </View>
      </View>
    );

  const heading = (
    <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header" testID="battle-heading">
      {phaseHeading(opened)}
    </Text>
  );
  const sceneView = (
    <>
      {shown.enemy ? (
        <View style={styles.row}>
          <Hud side="enemy" c={shown.enemy} motion={motion.enemy} intent={model?.intent ?? null} theme={theme} compact={compact} />
          <Creature c={shown.enemy} motion={motion.enemy} scale={scale} theme={theme} />
        </View>
      ) : null}
      {shown.player ? (
        <View style={[styles.row, styles.rowPlayer]}>
          <Creature c={shown.player} motion={motion.player} scale={scale} theme={theme} />
          <Hud side="player" c={shown.player} motion={motion.player} intent={null} theme={theme} compact={compact} />
        </View>
      ) : null}
    </>
  );
  const actions = (
    <View style={styles.actions} testID="battle-actions">
      <View style={styles.choices} accessibilityState={{ busy }} testID="battle-choices">
        {model?.prompt ? (
          <Text ref={prompt} style={[styles.prompt, { color: theme.text }]} accessibilityRole="header" testID="battle-prompt">
            {model.prompt}
          </Text>
        ) : null}
        {renderGroup(t('menu.moves'), moves, 'move')}
        {renderGroup(t('menu.team'), swaps, 'swap')}
      </View>
      {confirming ? (confirmPanel ?? null) : <Button label={t('map.abandon')} onPress={onAbandon} testID="abandon" />}
    </View>
  );
  // Below the choices (or beside them), so a growing log never moves the buttons under the thumb.
  const logPanel = <LogPanel log={log} theme={theme} />;

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
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowPlayer: { flexWrap: 'wrap-reverse' },
  hud: { flexGrow: 1, flexShrink: 1, flexBasis: 170, borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  hudSide: { fontSize: 13, fontWeight: '600' },
  hudName: { fontSize: 18, fontWeight: '700' },
  hudValue: { fontSize: 15 },
  track: { height: 10, borderRadius: 5, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%', width: '100%', transformOrigin: 'left' },
  chip: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2, marginTop: 2 },
  chipText: { fontSize: 14, fontWeight: '700' },
  intent: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  creature: { alignSelf: 'center' },
  glow: { borderRadius: 999 },
  log: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 2 },
  logHeading: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  logLine: { fontSize: 15 },
  choices: { gap: 12 },
  prompt: { fontSize: 18, fontWeight: '700' },
  group: { gap: 6 },
  groupHeading: { fontSize: 14, fontWeight: '700' },
  groupList: { gap: 8 },
  choice: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 2,
  },
  choiceText: { flexShrink: 1, gap: 2 },
  choiceLabel: { fontSize: 17, fontWeight: '600' },
  choiceDetail: { fontSize: 14 },
});
