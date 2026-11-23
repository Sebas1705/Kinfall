// Map screen in the console layout (no page scroll): the zone drawn as a fixed board in the primary
// region, one column per layer (step 1 first, the boss last: at most 7 columns of at most 3 nodes),
// side by side in both orientations (a portrait phone is 360 dp wide, 7 columns of a 48 dp touch
// target); the rail holds the readout of the focused node and a legend; the HUD carries the zone,
// the party chips, the "Run" button (party details and the run log in a sheet) and Settings (with
// Abandon and its confirmation, like the battle).
//
// A node is a 48 dp framed button with its pixel icon, and under it the short type name (the first
// word of its label) as real text. The state is never colour alone: a locked node is flat and its
// icon dimmed, a cleared one carries a check, the current one a dot and the plate; the accessible
// name is the full "type: state" and the visible name under the icon is hidden from readers so it
// is not read twice. The selection model is unchanged: activating an available node moves there.
//
// The log is a one-line message over the board's bottom edge (the newest line, a polite live region
// OUTSIDE the part a sheet hides, see Screen's `overlay` and `backdrop`). When the window does not
// fit the contract (200% text, tiny windows) the Screen falls back to a pinned HUD and rail with
// the board scrolling in between. Sizes are in mapMetrics, which the fit tests prove.
import { CONTENT } from '@kinfall/core/content';
import { buildMapModel, type MapModel } from '@kinfall/core/models/map';
import { t } from '@kinfall/core/platform/i18n';
import type { RunState } from '@kinfall/core/sim/run/types';
import { effectiveTextScale } from '@kinfall/core/layout/spec';
import { useMemo, useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';

import { GridImage } from '../art/GridImage';
import { nodeIconGrid } from '../art/sceneCache';
import { useLang } from '../platform/LangContext';
import { useTextSize } from '../platform/textSizeSetting';
import { useTheme } from '../theme';
import { AppText } from '../ui/AppText';
import { fitText } from '../ui/fitText';
import { Hud } from '../ui/Hud';
import { PartyPanel } from '../ui/PartyPanel';
import { FramePressable, Plate, usePlateText } from '../ui/PixelFrame';
import { RunLogMessage, RunLogPanel } from '../ui/RunLogPanel';
import { Screen } from '../ui/Screen';
import { Sheet } from '../ui/Sheet';
import { useLayoutSpec } from '../ui/useLayoutSpec';
import { useRunSheets } from '../ui/useRunSheets';
import { messageHeight } from './battleMetrics';
import {
  BOARD_PAD,
  NAME_GAP,
  NAME_MIN_SCALE,
  NAME_SIZE,
  nameHeight,
  NODE_GAP,
  NODE_MIN,
  LEGEND_SIZE,
  READOUT_LABEL_SIZE,
  READOUT_STATE_SIZE,
  RAIL_GAP,
  RAIL_PAD,
  STEP_GAP,
  STEP_SIZE,
  columnWidth,
  nodeWidth,
} from './mapMetrics';

type MapNodeModel = MapModel['layers'][number]['nodes'][number];

/** Cell size (dp) of a node icon: 16 cells at 2 dp fill the 48 dp frame's content box exactly. */
const ICON_CELL = 2;
const ICON_BOX = 16 * ICON_CELL;

function stateText(node: MapNodeModel): string {
  const base = t(`map.${node.state}`);
  return node.current ? `${base}, ${t('map.current')}` : base;
}

/** The short type name under a node's icon: the first word of its label. */
export function shortName(node: MapNodeModel): string {
  return node.label.split(' ')[0] ?? node.label;
}

interface NodeCellProps {
  node: MapNodeModel;
  onPick: (id: string) => void;
  width: number;
  scale: number;
  onFocusChange: (id: string, focused: boolean) => void;
}

function NodeCell({ node, onPick, width, scale, onFocusChange }: NodeCellProps) {
  const theme = useTheme();
  const state = stateText(node);
  const available = node.state === 'available';
  const cleared = node.state === 'cleared';
  const grid = useMemo(() => nodeIconGrid(node.type), [node.type]);
  const dim = available || node.current ? 1 : 0.55;
  return (
    <View style={[styles.cell, { width }]}>
      <FramePressable
        onPress={() => onPick(node.id)}
        disabled={!available}
        kind={node.current ? 'plate' : 'button'}
        accessibilityLabel={t('map.nodeLabel', { label: node.label, state })}
        accessibilityState={{ disabled: !available, selected: node.current }}
        testID={`node-${node.id}`}
        style={[styles.node, { width, height: NODE_MIN, minHeight: NODE_MIN }]}
        padX={0}
        padY={0}
        onFocusChange={(focused) => onFocusChange(node.id, focused)}
      >
        {({ textColor }) => (
          <View style={styles.icon}>
            <GridImage grid={grid} cellDp={ICON_CELL} style={{ opacity: dim }} testID={`map-icon-${node.type}`} />
            {/* A state cue that is not colour: a check on cleared nodes, a dot on the current one. */}
            {cleared ? (
              <Text style={[styles.mark, styles.markTop, { color: textColor }]} allowFontScaling={false} importantForAccessibility="no" accessibilityElementsHidden>
                {'✓'}
              </Text>
            ) : null}
            {node.current ? (
              <Text style={[styles.mark, styles.markBottom, { color: textColor }]} allowFontScaling={false} importantForAccessibility="no" accessibilityElementsHidden>
                {'●'}
              </Text>
            ) : null}
          </View>
        )}
      </FramePressable>
      {/* One line that follows the text size and shrinks to fit; hidden from readers, the node's name has it. */}
      <View style={[styles.nameBox, { height: nameHeight(scale) }]} importantForAccessibility="no" accessibilityElementsHidden>
        <AppText
          style={[styles.name, { color: available || node.current ? theme.text : theme.muted }]}
          {...fitText(true, 1, NAME_MIN_SCALE)}
          ellipsizeMode="clip"
          testID={`node-name-${node.id}`}
        >
          {shortName(node)}
        </AppText>
      </View>
    </View>
  );
}

/** The rail: the name and state of the node under the focus (or the next one to pick), and the legend. */
function Readout({ node, fixed }: { node: MapNodeModel | null; fixed: boolean }) {
  const ink = usePlateText();
  const theme = useTheme();
  return (
    // Purely visual: every node already has its accessible name.
    <View style={styles.rail} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="map-rail">
      <Plate style={styles.readout} testID="map-readout" pad={0}>
        <AppText style={[styles.readoutLabel, { color: ink.text }]} {...fitText(fixed, 1, 0.7)} testID="map-readout-label">
          {node?.label ?? ''}
        </AppText>
        <AppText style={[styles.readoutState, { color: ink.muted }]} {...fitText(fixed, 1, 0.7)} testID="map-readout-state">
          {node ? stateText(node) : ''}
        </AppText>
      </Plate>
      <AppText style={[styles.legend, { color: theme.muted }]} numberOfLines={fixed ? 2 : undefined} testID="map-legend">
        {`✓ ${t('map.cleared')}   ● ${t('map.current')}`}
      </AppText>
    </View>
  );
}

export interface MapViewProps {
  run: RunState;
  trail: readonly string[];
  onPick: (nodeId: string) => void;
  /** First step of the two-step abandon (the Run screen shows the confirmation). */
  onAbandon: () => void;
  /** The Settings sheet closed while the confirmation was open: the Run screen drops it. */
  onCancelAbandon?: () => void;
  /** The abandon confirmation is open (it shows in the Settings sheet, in place of Abandon). */
  confirming: boolean;
  confirmPanel?: ReactNode;
  /** Above the board (the save warning). */
  header?: ReactNode;
  /** In the Settings sheet, under the Abandon button (the seed line). */
  trailer?: ReactNode;
  /** The scroll area of the fallback layout (the Run screen scrolls it to the top on a phase change). */
  scrollRef?: Ref<ScrollViewInstance>;
  testID?: string;
}

export function MapView({ run, trail, onPick, onAbandon, onCancelAbandon, confirming, confirmPanel, header, trailer, scrollRef, testID }: MapViewProps) {
  useLang();
  const theme = useTheme();
  const spec = useLayoutSpec('map');
  const { fontScale } = useWindowDimensions();
  const appSize = useTextSize();
  const scale = effectiveTextScale(fontScale, appSize / 100);
  const landscape = spec.orientation === 'landscape';
  const consoleMode = spec.mode === 'console';
  const model = buildMapModel(run, CONTENT, trail);
  const sheets = useRunSheets({ confirming, confirmPanel, trailer, onAbandon, onCancelAbandon });
  const [focused, setFocused] = useState<string | null>(null);

  const nodes = model.layers.flatMap((l) => l.nodes);
  const shown = nodes.find((n) => n.id === focused) ?? nodes.find((n) => n.state === 'available') ?? nodes.find((n) => n.current) ?? nodes[0] ?? null;
  const onFocusChange = (id: string, on: boolean) => setFocused((prev) => (on ? id : prev === id ? null : prev));

  // In the fallback the board sits in the scrolling area, whose 16 dp side padding it cancels with a
  // negative margin, so the columns keep the width the console has (48 dp targets at 360 dp wide).
  const column = columnWidth(spec.regions.primary.width);
  const nodeW = nodeWidth(column);

  const board = (
    <View
      style={[consoleMode ? styles.boardFill : [styles.board, styles.boardBleed], { paddingBottom: BOARD_PAD + (consoleMode && landscape ? messageHeight(scale, 1) : 0) }]}
      testID="map-screen"
    >
      {model.layers.map((layer) => (
        <View key={layer.layer} style={[styles.column, { width: column }]} testID={`layer-${layer.layer}`}>
          <AppText
            style={[styles.step, { color: theme.text }]}
            accessibilityRole="header"
            {...fitText(true, 1, 0.7)}
          >
            {t('map.step', { n: layer.layer + 1 })}
          </AppText>
          <View style={styles.nodes}>
            {layer.nodes.map((n) => (
              <NodeCell key={n.id} node={n} onPick={onPick} width={nodeW} scale={scale} onFocusChange={onFocusChange} />
            ))}
          </View>
        </View>
      ))}
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
      {board}
    </>
  );

  const hud = (
    <Hud
      screen="map"
      zoneLabel={t('map.zone', { n: model.zoneNo, name: model.zoneName })}
      titleTestID="map-heading"
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
        screen="map"
        testID={testID}
        hud={hud}
        primary={main}
        actions={<Readout node={shown} fixed={consoleMode} />}
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
  board: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: BOARD_PAD },
  boardFill: { flex: 1, minHeight: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: BOARD_PAD },
  boardBleed: { marginHorizontal: -16 },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  column: { alignItems: 'center', justifyContent: 'center', gap: STEP_GAP },
  step: { fontSize: STEP_SIZE, fontWeight: '700', textAlign: 'center' },
  nodes: { gap: NODE_GAP, alignItems: 'center' },
  cell: { alignItems: 'center', gap: NAME_GAP },
  node: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  icon: { width: ICON_BOX, height: ICON_BOX },
  mark: { position: 'absolute', fontSize: 11, lineHeight: 11, fontWeight: '700' },
  markTop: { top: -4, right: -4 },
  markBottom: { bottom: -4, left: -4 },
  nameBox: { alignSelf: 'stretch', overflow: 'hidden' },
  name: { fontSize: NAME_SIZE, fontWeight: '600', textAlign: 'center' },
  rail: { padding: RAIL_PAD, gap: RAIL_GAP },
  readout: { gap: 0 },
  readoutLabel: { fontSize: READOUT_LABEL_SIZE, fontWeight: '700', textAlign: 'center' },
  readoutState: { fontSize: READOUT_STATE_SIZE, textAlign: 'center' },
  legend: { fontSize: LEGEND_SIZE, textAlign: 'center' },
});
