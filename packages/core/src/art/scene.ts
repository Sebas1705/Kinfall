// Public entry of the scene art: `import { sceneForZone, effectFor, ... } from '@kinfall/core/art/scene'`.
// Everything is platform-neutral data (pixel grids, nine-slices, emitter configs, keyframes) plus
// pure samplers; the web (Pixi) and mobile (Skia) renderers draw it. See
// docs/superpowers/specs/2026-11-20-visual-style-design.md for the style and the renderer contract.
export * from './scene/ambient';
export * from './scene/backdrop';
export * from './scene/color';
export { cosmeticRng, type CosmeticRng } from './scene/cosmeticRng';
export * from './scene/damageNumbers';
export * from './scene/effects';
export * from './scene/frames';
export * from './scene/icons';
export * from './scene/logo';
export * from './scene/palettes';
export * from './scene/platform';
export * from './scene/registry';
export * from './scene/sampler';
export * from './scene/sprites';
export * from './scene/vignettes';
