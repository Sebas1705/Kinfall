// Map screen: the pure map model (buildMapModel, in @webgames/core) drawn with React Native.
// Layers stack vertically, step 1 first and the boss last; nodes wrap in rows. Every node names its
// type and state in text (never colour alone) and is a 48dp button.
import { CONTENT } from '@webgames/core/content';
import { buildMapModel, type MapModel } from '@webgames/core/models/map';
import { t } from '@webgames/core/platform/i18n';
import type { NodeType, RunState } from '@webgames/core/sim/run/types';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { TOUCH, useTheme, type Theme } from '../theme';
import { Button } from '../ui/Button';
import { PartyPanel } from '../ui/PartyPanel';

/** Type glyphs (text presentation): the label text always accompanies them. Same as the web map. */
export const GLYPH: Record<NodeType, string> = {
  wild: '⚔︎',
  elite: '✦',
  shrine: '✚',
  cache: '◈',
  mystery: '?',
  boss: '♛',
};

type MapNodeModel = MapModel['layers'][number]['nodes'][number];

/** Node button basis width (dp) at font scale 1. */
export const NODE_BASIS = 140;

function stateText(node: MapNodeModel): string {
  const base = t(`map.${node.state}`);
  return node.current ? `${base}, ${t('map.current')}` : base;
}

function NodeButton({ node, onPick, theme, basis }: { node: MapNodeModel; onPick: (id: string) => void; theme: Theme; basis: number }) {
  const state = stateText(node);
  const available = node.state === 'available';
  const bg = available ? theme.surface : theme.surface2;
  const border = node.current ? theme.text : available ? theme.accent : theme.border;
  return (
    <Pressable
      onPress={available ? () => onPick(node.id) : undefined}
      disabled={!available}
      accessibilityRole="button"
      accessibilityLabel={t('map.nodeLabel', { label: node.label, state })}
      accessibilityState={{ disabled: !available, selected: node.current }}
      testID={`node-${node.id}`}
      style={({ pressed }) => [
        styles.node,
        { flexBasis: basis, backgroundColor: bg, borderColor: pressed && available ? theme.focus : border, borderStyle: node.state === 'locked' ? 'dashed' : 'solid' },
        node.current && styles.nodeCurrent,
      ]}
    >
      <Text style={[styles.glyph, { color: available ? theme.accent : theme.muted }]} importantForAccessibility="no">
        {GLYPH[node.type]}
      </Text>
      <View style={styles.nodeText}>
        <Text style={[styles.nodeLabel, { color: available ? theme.text : theme.disabledText }]}>{node.label}</Text>
        <Text style={[styles.nodeState, { color: theme.muted }]}>{state}</Text>
      </View>
    </Pressable>
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
}

export function MapView({ run, trail, onPick, onAbandon, confirming }: MapViewProps) {
  const theme = useTheme();
  // Node width grows with the font scale, so large text gets one node per row instead of words
  // broken mid-way (two per row at the default size on a 360dp phone).
  const { fontScale } = useWindowDimensions();
  const basis = NODE_BASIS * Math.max(1, fontScale);
  const model = buildMapModel(run, CONTENT, trail);
  return (
    <View style={styles.map} testID="map-screen">
      <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header" testID="map-heading">
        {t('map.zone', { n: model.zoneNo, name: model.zoneName })}
      </Text>
      <PartyPanel party={model.party} speciesIds={run.party.map((m) => m.speciesId)} souls={model.souls} />
      <View style={styles.layers}>
        {model.layers.map((layer) => (
          <View key={layer.layer} style={styles.layer} testID={`layer-${layer.layer}`}>
            <Text style={[styles.step, { color: theme.text }]} accessibilityRole="header">
              {t('map.step', { n: layer.layer + 1 })}
            </Text>
            <View style={styles.nodes}>
              {layer.nodes.map((n) => (
                <NodeButton key={n.id} node={n} onPick={onPick} theme={theme} basis={basis} />
              ))}
            </View>
          </View>
        ))}
      </View>
      {confirming ? null : <Button label={t('map.abandon')} onPress={onAbandon} testID="abandon" />}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { gap: 16 },
  heading: { fontSize: 24, fontWeight: '700' },
  layers: { gap: 12 },
  layer: { gap: 6 },
  step: { fontSize: 16, fontWeight: '700' },
  nodes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  node: {
    flexGrow: 1,
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 2,
  },
  nodeCurrent: { borderWidth: 3 },
  glyph: { fontSize: 20, minWidth: 24, textAlign: 'center' },
  nodeText: { flexShrink: 1 },
  nodeLabel: { fontSize: 16, fontWeight: '600' },
  nodeState: { fontSize: 14 },
});
