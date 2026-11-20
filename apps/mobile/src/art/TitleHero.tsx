// The title hero: the Ashen Marsh at dusk with the chosen starter on the near platform and an
// unknown foe's silhouette on the far one, the KINFALL wordmark over the sky. The scene is
// decorative; the wordmark is the one labelled image ("Kinfall", from i18n `app.title`).
import { wordmark } from '@kinfall/core/art/scene';
import { CONTENT } from '@kinfall/core/content';
import { t } from '@kinfall/core/platform/i18n';
import type { Side } from '@kinfall/core/sim/state';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { ArtScene } from './ArtScene';
import { GridImage } from './GridImage';
import type { SceneCreature } from './paintScene';
import { creatureGrid } from './sceneCache';

/** Fixed seed of the title scene, so the title always looks the same. */
export const TITLE_SEED = 'kinfall-title';
const LOGO = wordmark();
/** The far platform's foe: the first species that is not a starter, drawn as a silhouette. */
const FOE = CONTENT.species.find((s) => !CONTENT.starters.includes(s.id))?.id ?? CONTENT.species[0]!.id;

export interface TitleHeroProps {
  starter: string;
  reducedMotion: boolean;
  /** Width the hero gets before the first layout (dp). */
  initialWidth: number;
  style?: StyleProp<ViewStyle>;
}

/** Wordmark cell size in dp: 3 on phones, 4 from 600dp (the spec's 2 and 3 at web pixel sizes). */
export function logoCell(width: number): number {
  return width >= 600 ? 4 : 3;
}

export function TitleHero({ starter, reducedMotion, initialWidth, style }: TitleHeroProps) {
  const { width, height } = useWindowDimensions();
  const creatures = useMemo<Partial<Record<Side, SceneCreature | null>>>(
    () => ({ player: { grid: creatureGrid(starter) }, enemy: { grid: creatureGrid(FOE), silhouette: true } }),
    [starter],
  );
  return (
    <View style={[styles.hero, style]} testID="title-hero">
      <ArtScene
        zone={0}
        seed={TITLE_SEED}
        reducedMotion={reducedMotion}
        creatures={creatures}
        maxHeight={Math.max(160, height * 0.36)}
        frame={{ cropTop: 4 }}
        initialWidth={initialWidth}
        testID="title-scene"
      />
      <View style={styles.logo} pointerEvents="none">
        <GridImage grid={LOGO.grid} cellDp={logoCell(width)} accessibilityLabel={t(LOGO.labelKey)} testID="app-name" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'relative' },
  logo: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
});
