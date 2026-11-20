// Event screens of a run (recruit, shrine, cache, mystery): the pure event model (buildEventModel,
// in @kinfall/core) drawn with React Native, like the web's screens/event.ts, with the event's
// little pixel scene (vignette) on top. The choices are exactly the legal run actions, plus evolve
// entries that are disabled with their reason in text when souls are short. A pick goes through
// the run session (applied, logged, autosaved).
//
// On arrival, screen-reader focus goes to the model's initial choice: the first enabled one, or
// "Let it go" when a full party would make a stray activation replace a member.
import { eventVignette, VIGNETTE_HEIGHT, VIGNETTE_WIDTH, zoneIdOf } from '@kinfall/core/art/scene';
import { CONTENT } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import { buildEventModel, type EventChoice, type EventModel } from '@kinfall/core/models/event';
import { t } from '@kinfall/core/platform/i18n';
import type { RunAction, RunState } from '@kinfall/core/sim/run/types';
import { useEffect, useMemo, useRef, type ComponentRef, type Ref } from 'react';
import { AccessibilityInfo, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CreatureSprite } from '../art/CreatureSprite';
import { ElementIcon } from '../art/ElementIcon';
import { GridImage } from '../art/GridImage';
import { useLang } from '../platform/LangContext';
import { useRunSession } from '../run/useRunSession';
import { TOUCH, useTheme, type Theme } from '../theme';
import { PartyPanel } from '../ui/PartyPanel';
import { FramePressable, Plate, usePlateText } from '../ui/PixelFrame';
import { useLayout } from '../ui/windowSize';
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

/**
 * Vignette cell size (dp): the 64x40-cell scene as wide as the column allows, but at most a fifth of
 * the window height (so the choices stay near the top on short phones), 2 to 5.
 */
export function vignetteCell(width: number, height = Infinity): number {
  return Math.max(2, Math.min(5, Math.floor(width / VIGNETTE_WIDTH), Math.floor((height * 0.2) / VIGNETTE_HEIGHT)));
}

/** The event's little scene (shrine, cache, mystery, recruit camp) in a plate; decorative. */
function Vignette({ kind, zone, seed, width, height }: { kind: EventModel['kind']; zone: number; seed: string; width: number; height: number }) {
  const grid = useMemo(() => eventVignette(kind, zoneIdOf(zone), seed), [kind, zone, seed]);
  return (
    <Plate style={styles.vignette} pad={0}>
      <GridImage grid={grid} cellDp={vignetteCell(width, height)} testID="event-vignette" />
    </Plate>
  );
}

function OfferCard({ offer }: { offer: NonNullable<EventModel['offer']> }) {
  const ink = usePlateText();
  const elements = lookup(CONTENT).species(offer.speciesId).elements;
  const hp = `${t('hud.hp')} ${offer.hp}/${offer.maxHp}`;
  return (
    <Plate accessible accessibilityLabel={`${offer.name}, ${offer.elements}, ${hp}`} testID="event-offer">
      <View style={styles.offer} testID="event-offer-row">
        <CreatureSprite species={offer.speciesId} scale={3} />
        <View style={styles.offerText}>
          <Text style={[styles.offerName, { color: ink.text }]}>{offer.name}</Text>
          <View style={styles.elementRow}>
            {elements.map((e) => (
              <ElementIcon key={e} element={e} scale={2} />
            ))}
            <Text style={[styles.detail, { color: ink.muted }]}>{offer.elements}</Text>
          </View>
          <Text style={[styles.detail, { color: ink.muted }]} testID="event-offer-hp">
            {hp}
          </Text>
        </View>
      </View>
    </Plate>
  );
}

function ChoiceButton({ choice, index, onPress, theme, ref }: {
  choice: EventChoice;
  index: number;
  onPress: () => void;
  theme: Theme;
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
      style={styles.choice}
      padX={replace ? 14 : 6}
    >
      {({ textColor }) => (
        <View style={styles.choiceBody}>
          {/* A replace choice carries a warning stripe; its label says "Replace" in words. */}
          {replace ? <View style={[styles.stripe, { backgroundColor: theme.danger }]} testID={`event-choice-${index}-warning`} /> : null}
          <Text style={[styles.choiceLabel, { color: textColor }]}>{choice.label}</Text>
          {choice.detail ? <Text style={[styles.detail, { color: textColor }]}>{choice.detail}</Text> : null}
        </View>
      )}
    </FramePressable>
  );
}

export function EventView({ run, confirming, confirmPanel, log }: PhaseViewProps) {
  const theme = useTheme();
  const { twoPane } = useLayout();
  const { width, height } = useWindowDimensions();
  useLang();
  const { session } = useRunSession();
  const model = buildEventModel(run, CONTENT);
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

  // The vignette fills the column at a whole cell size (inside the plate's frame).
  const column = twoPane ? Math.min(width, 1200) * 0.6 - 72 : Math.min(width, 720) - 72;
  const party = <PartyPanel party={model.party} speciesIds={run.party.map((m) => m.speciesId)} souls={model.souls} />;
  const main = (
    <>
      <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header" testID="event-heading">
        {model.title}
      </Text>
      <Vignette kind={model.kind} zone={run.zone} seed={run.seed} width={column} height={height} />
      <Text style={[styles.desc, { color: theme.text }]} testID="event-desc">
        {model.description}
      </Text>
      {model.offer ? <OfferCard offer={model.offer} /> : null}
      {model.note ? (
        <Text style={[styles.note, { color: theme.text, borderColor: theme.danger }]} testID="event-note">
          {model.note}
        </Text>
      ) : null}
      <View style={styles.choices} testID="event-choices">
        {model.choices.map((c, i) => (
          <ChoiceButton
            key={i}
            ref={i === model.focusIndex && !c.disabled ? initial : undefined}
            choice={c}
            index={i}
            onPress={() => pick(c.action)}
            theme={theme}
          />
        ))}
      </View>
      {/* Android back opened it: it shows by the choices it would cut short. */}
      {confirming ? (confirmPanel ?? null) : null}
    </>
  );

  if (twoPane) {
    return (
      <View style={[styles.event, styles.panes]} testID="event-screen">
        <View style={[styles.pane, styles.paneMain]}>{main}</View>
        <View style={[styles.pane, styles.paneSide]} testID="event-side">
          {party}
          {log}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.event} testID="event-screen">
      {main}
      {party}
      {log}
    </View>
  );
}

const styles = StyleSheet.create({
  event: { gap: 16 },
  panes: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  pane: { gap: 16, minWidth: 0 },
  paneMain: { flex: 3 },
  paneSide: { flex: 2 },
  heading: { fontSize: 24, fontWeight: '700' },
  desc: { fontSize: 16 },
  note: { fontSize: 16, fontWeight: '600', borderLeftWidth: 4, paddingLeft: 10 },
  vignette: { alignSelf: 'center' },
  offer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  offerText: { flexGrow: 1, flexShrink: 1, flexBasis: 160, gap: 4 },
  offerName: { fontSize: 18, fontWeight: '700' },
  elementRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  choices: { gap: 10 },
  choice: { minHeight: TOUCH },
  choiceBody: { gap: 2 },
  stripe: { position: 'absolute', left: -12, top: 2, bottom: 2, width: 5 },
  choiceLabel: { fontSize: 17, fontWeight: '600' },
  detail: { fontSize: 15 },
});
