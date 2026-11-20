// Map screen: the pure map model (buildMapModel, in @kinfall/core) drawn with React Native.
// A banner of the zone's scene sits under the heading; layers stack vertically along a dotted
// path, step 1 first and the boss last; nodes wrap in rows. Every node is a framed 48dp button with
// its pixel icon (a distinct silhouette per type) and names its type and state in text (never
// colour alone): the current node wears the plate, locked ones are flat. In two panes (tablets,
// foldables, landscape) the party and the run log sit on the left and the map on the right.
import { CONTENT } from '@kinfall/core/content';
import { buildMapModel, type MapModel } from '@kinfall/core/models/map';
import { t } from '@kinfall/core/platform/i18n';
import type { RunState } from '@kinfall/core/sim/run/types';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ArtScene } from '../art/ArtScene';
import { nodeIconGrid } from '../art/sceneCache';
import { useReducedMotion } from '../platform/motionSetting';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui/Button';
import { PartyPanel } from '../ui/PartyPanel';
import { FramePressable } from '../ui/PixelFrame';
import { frameCell } from '../ui/frames';
import { useLayout } from '../ui/windowSize';

type MapNodeModel = MapModel['layers'][number]['nodes'][number];

/** Node button basis width (dp) at font scale 1. */
export const NODE_BASIS = 140;
/** Rows of the zone scene the banner shows (the horizon and the landmarks). */
export const BANNER = { cropTop: 34, rows: 62 } as const;

function stateText(node: MapNodeModel): string {
  const base = t(`map.${node.state}`);
  return node.current ? `${base}, ${t('map.current')}` : base;
}

function NodeButton({ node, onPick, basis }: { node: MapNodeModel; onPick: (id: string) => void; basis: number }) {
  const state = stateText(node);
  const available = node.state === 'available';
  // Locked nodes show their icon dimmed (their state is in text too).
  const icon = useMemo(() => ({ grid: nodeIconGrid(node.type), cellDp: 2, alpha: available || node.current ? 1 : 0.55 }), [node.type, available, node.current]);
  return (
    <FramePressable
      onPress={() => onPick(node.id)}
      disabled={!available}
      kind={node.current ? 'plate' : 'button'}
      accessibilityLabel={t('map.nodeLabel', { label: node.label, state })}
      accessibilityState={{ disabled: !available, selected: node.current }}
      testID={`node-${node.id}`}
      icon={icon}
      iconTestID={`node-icon-${node.type}`}
      style={[styles.node, { flexBasis: basis }]}
    >
      {({ textColor }) => (
        <View style={styles.nodeText}>
          <Text style={[styles.nodeLabel, { color: textColor }]}>{node.label}</Text>
          <Text style={[styles.nodeState, { color: textColor }]}>{state}</Text>
        </View>
      )}
    </FramePressable>
  );
}

/** The step marker and the dotted path segment down to the next step (decorative). */
function PathMarker({ last, done, theme }: { last: boolean; done: boolean; theme: Theme }) {
  const cell = frameCell().dp;
  return (
    <View style={styles.rail} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.marker, { width: cell * 5, height: cell * 5, borderWidth: cell, borderColor: theme.text, backgroundColor: done ? theme.accent : theme.bg }]} />
      {last ? null : (
        <View style={styles.dots}>
          {Array.from({ length: 24 }, (_, i) => (
            <View key={i} style={{ width: cell, height: cell, marginVertical: cell, backgroundColor: theme.border }} />
          ))}
        </View>
      )}
    </View>
  );
}

export interface MapViewProps {
  run: RunState;
  trail: readonly string[];
  onPick: (nodeId: string) => void;
  /** First step of the two-step abandon (the Run screen shows the confirmation). */
  onAbandon: () => void;
  /** Hides the abandon button while its confirmation is open. */
  confirming: boolean;
  /** The abandon confirmation, drawn where the Abandon button was while `confirming`. */
  confirmPanel?: ReactNode;
  /** The run log panel (after the map, or under the party in two panes). */
  log?: ReactNode;
}

export function MapView({ run, trail, onPick, onAbandon, confirming, confirmPanel, log }: MapViewProps) {
  const theme = useTheme();
  const { twoPane, width: widthClass } = useLayout();
  const reduceMotion = useReducedMotion();
  // Node width grows with the font scale, so large text gets one node per row instead of words
  // broken mid-way (two per row at the default size on a 360dp phone).
  const { fontScale, width } = useWindowDimensions();
  const basis = NODE_BASIS * Math.max(1, fontScale);
  const model = buildMapModel(run, CONTENT, trail);
  const heading = (
    <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header" testID="map-heading">
      {t('map.zone', { n: model.zoneNo, name: model.zoneName })}
    </Text>
  );
  const banner = (
    <ArtScene
      zone={run.zone}
      seed={run.seed}
      reducedMotion={reduceMotion}
      maxHeight={110}
      frame={{ banner: BANNER }}
      initialWidth={twoPane ? width / 2 : width}
      style={!twoPane && widthClass === 'compact' ? styles.bleed : null}
      testID="map-banner"
    />
  );
  const party = <PartyPanel party={model.party} speciesIds={run.party.map((m) => m.speciesId)} souls={model.souls} />;
  const abandon = confirming ? (confirmPanel ?? null) : <Button label={t('map.abandon')} onPress={onAbandon} testID="abandon" />;
  const last = model.layers.length - 1;
  const layers = (
    <View style={styles.layers}>
      {model.layers.map((layer, li) => {
        const done = layer.nodes.every((n) => n.state !== 'available' && n.state !== 'locked') || layer.nodes.some((n) => n.current);
        return (
          <View key={layer.layer} style={styles.layerRow} testID={`layer-${layer.layer}`}>
            <PathMarker last={li === last} done={done} theme={theme} />
            <View style={styles.layer}>
              <Text style={[styles.step, { color: theme.text }]} accessibilityRole="header">
                {t('map.step', { n: layer.layer + 1 })}
              </Text>
              <View style={styles.nodes}>
                {layer.nodes.map((n) => (
                  <NodeButton key={n.id} node={n} onPick={onPick} basis={basis} />
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
  if (twoPane) {
    return (
      <View style={styles.map} testID="map-screen">
        {heading}
        <View style={styles.panes} testID="map-two-pane">
          <View style={[styles.pane, styles.paneSide]}>
            {banner}
            {party}
            {log}
          </View>
          <View style={[styles.pane, styles.paneMain]}>
            {layers}
            {abandon}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.map} testID="map-screen">
      {heading}
      {banner}
      {party}
      {layers}
      {abandon}
      {log}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { gap: 16 },
  panes: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  pane: { gap: 16, minWidth: 0 },
  paneSide: { flex: 2 },
  paneMain: { flex: 3 },
  heading: { fontSize: 24, fontWeight: '700' },
  bleed: { marginHorizontal: -16 },
  layers: { gap: 4 },
  layerRow: { flexDirection: 'row', gap: 10 },
  rail: { width: 14, alignItems: 'center', paddingTop: 3, overflow: 'hidden', position: 'relative' },
  marker: {},
  // Absolute, so the path never makes a step taller than its nodes.
  dots: { position: 'absolute', top: 18, bottom: 0, left: 0, right: 0, alignItems: 'center', overflow: 'hidden' },
  layer: { flex: 1, gap: 6, paddingBottom: 10 },
  step: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  nodes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  node: { flexGrow: 1 },
  nodeText: { flexShrink: 1 },
  nodeLabel: { fontSize: 16, fontWeight: '600' },
  nodeState: { fontSize: 14 },
});
