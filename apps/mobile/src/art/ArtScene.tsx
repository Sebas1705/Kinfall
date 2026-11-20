// One Skia canvas for a whole zone scene: backdrop with parallax sway and cloud drift, ambient
// life, optionally the platforms and creatures, and the effects of a StageDirector (battle events,
// or a one-shot victory / defeat flourish). It draws through a single frame loop that runs at most
// 30 fps while only ambient life moves, at the display rate while effects or a turn play, never in
// the background or on a blurred screen, and only once (still) with reduced motion.
//
// The canvas is decorative: hidden from screen readers (everything it shows is also in text) and
// it never takes touches.
import type { Side } from '@kinfall/core/sim/state';
import { SkiaPictureView, type SkPicture } from '@shopify/react-native-skia';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PixelRatio, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { recordFrame } from './artStats';
import { useFrameLoop } from './frameLoop';
import { paintScene, type SceneCreature } from './paintScene';
import { cachedScene } from './sceneCache';
import { artAvailable, recordPicture } from './skia';
import type { StageDirector } from './stageDirector';
import { stageFrame, type FrameOptions } from './stageLayout';

interface SurfaceHandle {
  show(picture: SkPicture | null): void;
}

/** The native picture view; only it re-renders per frame (the parent never does). */
const PictureSurface = memo(
  forwardRef<SurfaceHandle, { width: number; height: number }>(function PictureSurface({ width, height }, ref) {
    const [picture, setPicture] = useState<SkPicture | null>(null);
    useImperativeHandle(ref, () => ({ show: setPicture }), []);
    if (!artAvailable()) return <View style={{ width, height }} />;
    return <SkiaPictureView picture={picture ?? undefined} androidWarmup pointerEvents="none" style={{ width, height }} />;
  }),
);

export interface ArtSceneProps {
  zone: number;
  seed: string;
  reducedMotion: boolean;
  /** Platforms and creatures (omit for a landscape only). */
  creatures?: Partial<Record<Side, SceneCreature | null>>;
  /** Effects, poses and the turn flag (battle, end scene). */
  director?: StageDirector | null;
  /** Largest height of the scene (dp); the scale shrinks to fit it. */
  maxHeight: number;
  frame?: FrameOptions;
  /** Width to assume before the first layout (dp). */
  initialWidth: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Last N draw times decide whether ambient life is dropped to keep up (low-end phones). */
const SLOW_FRAME_MS = 24;

export function ArtScene({ zone, seed, reducedMotion, creatures, director, maxHeight, frame: frameOpts, initialWidth, style, testID }: ArtSceneProps) {
  const [width, setWidth] = useState(initialWidth);
  const ratio = PixelRatio.get();
  const sc = useMemo(() => cachedScene(zone, seed), [zone, seed]);
  const frame = useMemo(
    () => stageFrame(Math.round(width * ratio), Math.round(maxHeight * ratio), frameOpts),
    // The options are small literals; compare them by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, ratio, maxHeight, JSON.stringify(frameOpts ?? null)],
  );
  const surface = useRef<SurfaceHandle>(null);
  const started = useRef<number | null>(null);
  const slow = useRef(0);

  // Everything the paint callback reads, kept current without re-creating the loop.
  const live = useRef({ sc, frame, creatures, director, reducedMotion, ratio });
  live.current = { sc, frame, creatures, director, reducedMotion, ratio };

  const enabled = artAvailable();
  const wake = useFrameLoop(
    {
      draw(now) {
        const l = live.current;
        if (started.current === null) started.current = now;
        const begin = Date.now();
        const fx = l.director ? l.director.fx.frame(l.director.now()) : null;
        const pic = recordPicture(l.frame.widthPx / l.ratio, l.frame.heightPx / l.ratio, (canvas) =>
          paintScene(
            canvas,
            {
              scene: l.sc.scene,
              ambient: l.sc.ambient,
              frame: l.frame,
              tMs: now - started.current!,
              reducedMotion: l.reducedMotion,
              staged: l.creatures !== undefined,
              creatures: l.creatures ?? {},
              ...(l.director ? { poses: l.director.poses } : {}),
              fx,
              dropAmbient: slow.current > 3,
            },
            l.ratio,
          ),
        );
        // A slow frame counts up, a fast one down: ambient life goes first when the phone lags.
        const took = Date.now() - begin;
        slow.current = took > SLOW_FRAME_MS ? Math.min(10, slow.current + 1) : Math.max(0, slow.current - 1);
        surface.current?.show(pic);
        recordFrame(testID ?? 'scene', now, took);
      },
      moving() {
        const l = live.current;
        const busy = l.director ? l.director.fx.busy(l.director.now()) || l.director.turnBusy : false;
        return !l.reducedMotion || busy;
      },
      fast() {
        const l = live.current;
        if (!l.director || l.reducedMotion) return false;
        return l.director.turnBusy || l.director.fx.busy(l.director.now());
      },
    },
    enabled,
  );

  useEffect(() => {
    director?.setWake(wake);
    return () => director?.setWake(null);
  }, [director, wake]);

  // Any change of what is drawn: one fresh frame now (and the loop if anything moves).
  useEffect(() => {
    wake();
  }, [wake, sc, frame, creatures, reducedMotion]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - width) >= 1) setWidth(w);
  };

  const heightDp = frame.heightPx / ratio;
  return (
    <View
      onLayout={onLayout}
      style={[{ height: heightDp, overflow: 'hidden' }, style]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID={testID}
    >
      <PictureSurface ref={surface} width={frame.widthPx / ratio} height={heightDp} />
    </View>
  );
}
