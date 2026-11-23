// Event screens of a run (recruit, shrine, cache, mystery) in the console layout (no page scroll):
// the pure event model (buildEventModel, in @kinfall/core) drawn with React Native, like the web's
// screens/event.ts. The primary region holds the event's little pixel scene (vignette, when there is
// room) beside a short description, the offer card of a recruit and the "party is full" note; the
// choices are the rail (one column in landscape, in a rail wider than the contract's so that five
// choices with details fit; two columns in portrait). The choices are exactly the legal run actions,
// plus evolve entries that are disabled with their reason in text when souls are short. A pick goes
// through the run session (applied, logged, autosaved). The HUD carries the title (the screen
// heading), the party chips, the "Run" button (party details and the run log in a sheet) and
// Settings (which also shows the abandon confirmation when Android back asks).
//
// On arrival, screen-reader focus goes to the model's initial choice: the first enabled one, or
// "Let it go" when a full party would make a stray activation replace a member.
//
// Every height is bounded (a capped number of lines per text, fixed choice cells) and shared with
// eventMetrics, which the fit tests prove. When the window does not fit the contract the Screen falls
// back to a pinned HUD and rail with the primary region scrolling.
import { eventVignette, zoneIdOf } from '@kinfall/core/art/scene';
import { CONTENT } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import { effectiveTextScale } from '@kinfall/core/layout/spec';
import { buildEventModel, type EventChoice, type EventModel } from '@kinfall/core/models/event';
import { t } from '@kinfall/core/platform/i18n';
import type { RunAction, RunState } from '@kinfall/core/sim/run/types';
import { useEffect, useMemo, useRef, type ComponentRef, type Ref } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CreatureSprite } from '../art/CreatureSprite';
import { ElementIcon } from '../art/ElementIcon';
import { GridImage } from '../art/GridImage';
import { useLang } from '../platform/LangContext';
import { useTextSize } from '../platform/textSizeSetting';
import { useRunSession } from '../run/useRunSession';
import { useTheme, type Theme } from '../theme';
import { AppText } from '../ui/AppText';
import { Hud } from '../ui/Hud';
import { PartyPanel } from '../ui/PartyPanel';
import { FramePressable, Plate, usePlateText } from '../ui/PixelFrame';
import { RunLogMessage, RunLogPanel } from '../ui/RunLogPanel';
import { fitText } from '../ui/fitText';
import { Screen } from '../ui/Screen';
import { Sheet } from '../ui/Sheet';
import { useLayoutSpec } from '../ui/useLayoutSpec';
import { useRunSheets } from '../ui/useRunSheets';
import { messageHeight } from './battleMetrics';
import {
  CHOICE_DETAIL_SIZE,
  CHOICE_GAP,
  CHOICE_LABEL_SIZE,
  CHOICE_PAD,
  COLUMNS_PORTRAIT,
  DESC_SIZE,
  cellWidth,
  detailLines as detailLinesOf,
  labelLines as labelLinesOf,
  MAIN_GAP,
  MAIN_PAD,
  NOTE_SIZE,
  OFFER_DETAIL_SIZE,
  OFFER_NAME_SIZE,
  OFFER_SPRITE,
  bodyPlan,
  choiceHeight,
  railWidth,
} from './eventMetrics';
import type { PhaseViewProps } from './RunScreen';

type PressableRef = ComponentRef<typeof View>;

/** True for a choice that replaces a party member (shown with the warning stripe). */
export function isReplace(action: RunAction): boolean {
  return action.type === 'recruit' && action.take && action.replaceIndex !== undefined;
}

/** What a screen reader reads for a choice: its label, then its detail (cost, effect or reason). */
export function choiceLabel(choice: EventChoice): string {
  return choice.detail ? `${choice.label}, ${choice.detail}` : choice.label;
}

/** The event's little scene (shrine, cache, mystery, recruit camp) in a plate; decorative. */
function Vignette({ kind, zone, seed, cell }: { kind: EventModel['kind']; zone: number; seed: string; cell: number }) {
  const grid = useMemo(() => eventVignette(kind, zoneIdOf(zone), seed), [kind, zone, seed]);
  return (
    <Plate style={styles.vignette} pad={0}>
      <GridImage grid={grid} cellDp={cell} testID="event-vignette" />
    </Plate>
  );
}

function OfferCard({ offer, fixed }: { offer: NonNullable<EventModel['offer']>; fixed: boolean }) {
  const ink = usePlateText();
  const elements = lookup(CONTENT).species(offer.speciesId).elements;
  const hp = `${t('hud.hp')} ${offer.hp}/${offer.maxHp}`;
  return (
    <Plate accessible accessibilityLabel={`${offer.name}, ${offer.elements}, ${hp}`} testID="event-offer">
      <View style={[styles.offer, fixed ? null : styles.offerWrap]} testID="event-offer-row">
        <CreatureSprite species={offer.speciesId} scale={OFFER_SPRITE / 24} />
        <View style={[styles.offerText, fixed ? null : styles.offerTextWrap]}>
          <AppText style={[styles.offerName, { color: ink.text }]} {...fitText(fixed, 1, 0.7)}>
            {offer.name}
          </AppText>
          <View style={styles.elementRow}>
            {elements.map((e) => (
              <ElementIcon key={e} element={e} scale={2} />
            ))}
            <AppText style={[styles.offerDetail, { color: ink.muted }]} {...fitText(fixed, 1, 0.7)}>
              {`${offer.elements} · `}
              <AppText testID="event-offer-hp">{hp}</AppText>
            </AppText>
          </View>
        </View>
      </View>
    </Plate>
  );
}

function ChoiceButton({ choice, index, onPress, theme, height, detailLines, labelLines, fixed, ref }: {
  choice: EventChoice;
  index: number;
  onPress: () => void;
  theme: Theme;
  /** The cell's fixed height (console); the fallback sizes it by its text. */
  height: number;
  detailLines: number;
  labelLines: number;
  fixed: boolean;
  ref?: Ref<PressableRef>;
}) {
  const { disabled } = choice;
  const replace = isReplace(choice.action);
  return (
    <FramePressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={choiceLabel(choice)}
      testID={`event-choice-${index}`}
      style={[styles.choice, fixed ? { height } : null, { minHeight: 48 }]}
      padX={replace ? 10 : 2}
      padY={0}
    >
      {({ textColor }) => (
        <View style={styles.choiceBody}>
          {/* A replace choice carries a warning stripe; its label says "Replace" in words. */}
          {replace ? <View style={[styles.stripe, { backgroundColor: theme.danger }]} testID={`event-choice-${index}-warning`} /> : null}
          <AppText style={[styles.choiceLabel, { color: textColor }]} {...fitText(fixed, labelLines, 0.7)}>
            {choice.label}
          </AppText>
          {choice.detail ? (
            <AppText style={[styles.detail, { color: textColor }]} {...fitText(fixed, detailLines, 0.75)}>
              {choice.detail}
            </AppText>
          ) : null}
        </View>
      )}
    </FramePressable>
  );
}

export function EventView({ run, confirming, confirmPanel, header, trailer, onCancelAbandon, scrollRef, testID }: PhaseViewProps) {
  const theme = useTheme();
  const spec = useLayoutSpec('event');
  const { fontScale } = useWindowDimensions();
  useLang();
  const appSize = useTextSize();
  const scale = effectiveTextScale(fontScale, appSize / 100);
  const landscape = spec.orientation === 'landscape';
  const consoleMode = spec.mode === 'console';
  const { session } = useRunSession();
  const model = buildEventModel(run, CONTENT);
  // Android back opened the abandon confirmation: it shows in the Settings sheet (no Abandon button here).
  const sheets = useRunSheets({ confirming, confirmPanel, trailer, onCancelAbandon });
  /** The run a pick was applied to: a second tap before the next phase draws is ignored. */
  const acted = useRef<RunState | null>(null);
  const initial = useRef<PressableRef>(null);
  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;

  // Arrival (also after a resume): focus the initial choice for screen readers.
  useEffect(() => {
    if (confirmingRef.current || !initial.current) return;
    AccessibilityInfo.sendAccessibilityEvent(initial.current, 'focus');
  }, []);

  if (!model) return null;

  const pick = (action: RunAction) => {
    if (acted.current === run) return;
    if (session.act(action).ok) acted.current = run;
  };

  // The rail is wider than the contract's in landscape; the primary region gets what it leaves.
  const rail = landscape ? railWidth(spec.regions.content.width, spec.regions.actions.width) : 0;
  const reserve = consoleMode && landscape ? messageHeight(scale, 1) : 0;
  const bodyWidth = consoleMode ? (landscape ? spec.regions.content.width - rail : spec.regions.primary.width) : spec.regions.primary.width - 32;
  const plan = consoleMode
    ? bodyPlan(bodyWidth, spec.regions.primary.height - reserve, scale, { desc: model.description, offer: model.offer !== undefined, note: model.note })
    : { cell: 2, descLines: 0, noteLines: 0, height: 0 };
  // Lines of each choice's detail, from the same estimate the fit tests prove (the cell's fixed height follows).
  const cellW = cellWidth(landscape, landscape ? rail : spec.regions.content.width);
  const linesOf = (c: EventChoice) => Math.max(1, detailLinesOf(c, cellW, scale));
  const labelsOf = (c: EventChoice) => labelLinesOf(c, cellW, scale);
  const cell = (c: EventChoice) => choiceHeight(scale, c.detail ? linesOf(c) : 0, labelsOf(c));

  const text = (
    <View style={styles.text}>
      <AppText style={[styles.desc, { color: theme.text }]} numberOfLines={consoleMode ? plan.descLines : undefined} testID="event-desc">
        {model.description}
      </AppText>
      {model.offer ? <OfferCard offer={model.offer} fixed={consoleMode} /> : null}
      {model.note ? (
        <AppText style={[styles.note, { color: theme.text, borderColor: theme.danger }]} numberOfLines={consoleMode ? plan.noteLines : undefined} testID="event-note">
          {model.note}
        </AppText>
      ) : null}
    </View>
  );
  const main = (
    <>
      {consoleMode ? (
        <View style={styles.banner} pointerEvents="box-none">
          {header}
        </View>
      ) : (
        header
      )}
      <View style={[consoleMode ? styles.bodyFill : styles.body, consoleMode ? { paddingBottom: MAIN_PAD + reserve } : null]} testID="event-screen">
        {plan.cell > 0 ? <Vignette kind={model.kind} zone={run.zone} seed={run.seed} cell={plan.cell} /> : null}
        {text}
      </View>
    </>
  );

  // The choices: a column in landscape, rows of two in portrait (the exit goes last, as in the model).
  const button = (c: EventChoice, i: number, height: number) => (
    <ChoiceButton
      key={i}
      ref={i === model.focusIndex && !c.disabled ? initial : undefined}
      choice={c}
      index={i}
      onPress={() => pick(c.action)}
      theme={theme}
      height={height}
      detailLines={linesOf(c)}
      labelLines={labelsOf(c)}
      fixed={consoleMode}
    />
  );
  const rows: Array<Array<[EventChoice, number]>> = [];
  const perRow = landscape ? 1 : COLUMNS_PORTRAIT;
  model.choices.forEach((c, i) => {
    if (i % perRow === 0) rows.push([]);
    rows[rows.length - 1]!.push([c, i]);
  });
  const actions = (
    <View style={styles.choices} testID="event-choices">
      {rows.map((row, r) => {
        const height = Math.max(...row.map(([c]) => cell(c)));
        return (
          <View key={r} style={styles.choiceRow}>
            {row.map(([c, i]) => (
              <View key={i} style={styles.choiceCell}>
                {button(c, i, height)}
              </View>
            ))}
            {row.length < perRow ? <View style={styles.choiceCell} /> : null}
          </View>
        );
      })}
    </View>
  );

  const hud = (
    <Hud
      screen="event"
      zoneLabel={model.title}
      titleTestID="event-heading"
      party={model.party}
      onExtra={sheets.openDetails}
      extraRef={sheets.detailsRef}
      extraLabel={t('run.open')}
      extraTestID="hud-run"
      onSettings={sheets.settings.open}
      settingsRef={sheets.settings.openerRef}
    />
  );
  return (
    <View style={styles.root}>
      <Screen
        ref={scrollRef}
        screen="event"
        testID={testID}
        hud={hud}
        primary={main}
        actions={actions}
        actionsWidth={landscape ? rail : undefined}
        backdrop={sheets.backdrop}
        overlay={<RunLogMessage landscape={landscape} />}
      />
      {sheets.settings.sheet}
      <Sheet visible={sheets.detailsOpen} onClose={sheets.closeDetails} title={t('run.details')} openerRef={sheets.detailsRef} testID="run-sheet">
        <PartyPanel party={model.party} speciesIds={run.party.map((m) => m.speciesId)} souls={model.souls} />
        <RunLogPanel />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { gap: MAIN_GAP, alignItems: 'center' },
  bodyFill: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: MAIN_GAP, padding: MAIN_PAD, overflow: 'hidden' },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  text: { flex: 1, minWidth: 0, gap: MAIN_GAP, justifyContent: 'center', alignSelf: 'stretch' },
  desc: { fontSize: DESC_SIZE },
  note: { fontSize: NOTE_SIZE, fontWeight: '600', borderLeftWidth: 4, paddingLeft: 10 },
  vignette: { alignSelf: 'center', flexShrink: 0 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  offerWrap: { flexWrap: 'wrap' },
  offerText: { flex: 1, minWidth: 0 },
  offerTextWrap: { flexBasis: 160 },
  offerName: { fontSize: OFFER_NAME_SIZE, fontWeight: '700' },
  elementRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offerDetail: { fontSize: OFFER_DETAIL_SIZE, flexShrink: 1 },
  choices: { padding: CHOICE_PAD, gap: CHOICE_GAP },
  choiceRow: { flexDirection: 'row', gap: CHOICE_GAP },
  choiceCell: { flex: 1, minWidth: 0 },
  choice: { justifyContent: 'center' },
  choiceBody: { gap: 0 },
  stripe: { position: 'absolute', left: -7, top: 0, bottom: 0, width: 4 },
  choiceLabel: { fontSize: CHOICE_LABEL_SIZE, fontWeight: '600' },
  detail: { fontSize: CHOICE_DETAIL_SIZE },
});
