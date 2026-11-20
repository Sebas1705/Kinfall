// One call per zone: everything a renderer needs to stage a battle in that zone.
import { ambientFor, type AmbientConfig } from './ambient';
import { zoneBackdrop, type ZoneBackdrop } from './backdrop';
import { ZONE_PALETTES, type ZoneId, type ZonePalette } from './palettes';
import { groundPlatform, STAGE, type GroundPlatform } from './platform';

export interface ZoneScene {
  zone: ZoneId;
  seed: string;
  palette: ZonePalette;
  backdrop: ZoneBackdrop;
  platforms: { player: GroundPlatform; enemy: GroundPlatform };
  ambient: AmbientConfig;
  stage: typeof STAGE;
}

/** Maps a run's zone index to an art zone (indices past the last zone reuse the last one). */
export function zoneIdOf(zoneIndex: number): ZoneId {
  if (!Number.isFinite(zoneIndex) || zoneIndex <= 0) return 0;
  return zoneIndex >= 2 ? 2 : 1;
}

/**
 * The full scene of a zone for a seed (use the run seed, so a run always looks the same).
 * Pure and deterministic; never touches the simulation's random numbers. Cache the result:
 * it allocates about 60 k palette indices.
 */
export function sceneForZone(zoneIndex: number, seed: string | number): ZoneScene {
  const zone = zoneIdOf(zoneIndex);
  return {
    zone,
    seed: String(seed),
    palette: ZONE_PALETTES[zone],
    backdrop: zoneBackdrop(zone, seed),
    platforms: { player: groundPlatform(zone, seed, STAGE.player.platform), enemy: groundPlatform(zone, seed, STAGE.enemy.platform) },
    ambient: ambientFor(zone),
    stage: STAGE,
  };
}
