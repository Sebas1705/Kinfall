// End screen of a run in the console layout (no page scroll): the result and the score (buildEndModel
// and runScore, in @kinfall/core), like the web's screens/end.ts. The primary region is the result
// scene with the main score on a plate and a note; "New run" (starts again at once from a fresh seed,
// the save cleared first) and "Back to start" (clears the save and returns to the title) are the rail.
// The HUD carries the result as the screen heading (written out in text: "Run won" / "Run lost"), the
// "Run" button (the detailed stats and the run log in a sheet) and Settings. Sizes are in endMetrics,
// which the fit tests prove; in the fallback the primary region scrolls under a pinned HUD and rail.
import { CONTENT } from '@kinfall/core/content';
import { effectiveTextScale } from '@kinfall/core/layout/spec';
import { buildEndModel } from '@kinfall/core/models/end';
import { t } from '@kinfall/core/platform/i18n';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';

import { EndScene } from '../art/EndScene';
import { useLang } from '../platform/LangContext';
import { useReducedMotion } from '../platform/motionSetting';
import { useTextSize } from '../platform/textSizeSetting';
import { useRunSession } from '../run/useRunSession';
import { useTheme } from '../theme';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { fitText } from '../ui/fitText';
import { Hud } from '../ui/Hud';
import { Plate, usePlateText } from '../ui/PixelFrame';
import { RunLogMessage, RunLogPanel } from '../ui/RunLogPanel';
import { Screen } from '../ui/Screen';
import { Sheet } from '../ui/Sheet';
import { useLayoutSpec } from '../ui/useLayoutSpec';
import { useRunSheets } from '../ui/useRunSheets';
import { RAIL_GAP, messageHeight } from './battleMetrics';
import { MAIN_GAP, MAIN_PAD, NOTE_SIZE, RAIL_PAD, SCENE_MIN, SCORE_LABEL_SIZE, SCORE_VALUE_SIZE, noteLines, sceneHeight } from './endMetrics';
import type { PhaseViewProps } from './RunScreen';
import { buttonHeight } from './titleMetrics';

export function EndView({ run, onToTitle, confirmPanel, confirming, header, trailer, onCancelAbandon, scrollRef, testID }: PhaseViewProps) {
  const theme = useTheme();
  const spec = useLayoutSpec('end');
  const { fontScale } = useWindowDimensions();
  const appSize = useTextSize();
  const scale = effectiveTextScale(fontScale, appSize / 100);
  const landscape = spec.orientation === 'landscape';
  const consoleMode = spec.mode === 'console';
  const reduceMotion = useReducedMotion();
  const ink = usePlateText();
  useLang();
  const { session } = useRunSession();
  const model = buildEndModel(run, CONTENT);
  const sheets = useRunSheets({ confirming, confirmPanel, trailer, onCancelAbandon });
  const heading = useRef<ComponentRef<typeof AppText>>(null);
  /** One way out per end screen: a double tap never starts two runs. */
  const left = useRef(false);
  // The scene fills what the score and the note leave of the primary region: measured once laid out,
  // planned from the contract's primary rect before that (and in the fallback, where it scrolls).
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  // Arrival (also after a resume): the screen reader starts at the result.
  useEffect(() => {
    if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
  }, []);

  if (!model) return null;
  const won = model.result === 'won';

  const once = (fn: () => void) => () => {
    if (left.current) return;
    left.current = true;
    fn();
  };

  const noteN = noteLines(t('end.canRestart'), spec.regions.primary.width, scale);
  const planned = sceneHeight(spec.regions.primary.height, scale, landscape, noteN);
  const sceneH = consoleMode ? Math.max(SCENE_MIN, Math.round(box?.height ?? planned)) : 160;
  const sceneW = box?.width ?? spec.regions.primary.width;
  const reserve = consoleMode && landscape ? messageHeight(scale, 1) : 0;

  const scene = (
    <View
      style={consoleMode ? styles.sceneBox : null}
      onLayout={
        consoleMode
          ? (e) => {
              const { width, height } = e.nativeEvent.layout;
              setBox((prev) => (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
            }
          : undefined
      }
    >
      <EndScene
        zone={run.zone}
        seed={run.seed}
        won={won}
        title={t(won ? 'result.victory' : 'result.defeat')}
        lead={run.party[0]?.speciesId ?? null}
        reducedMotion={reduceMotion}
        maxHeight={sceneH}
        initialWidth={sceneW}
      />
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
      <View style={[consoleMode ? styles.mainFill : styles.main, consoleMode ? { paddingBottom: MAIN_PAD + reserve } : null]} testID="end-screen">
        {scene}
        <Plate accessible accessibilityLabel={`${t('end.score')}: ${model.score}`} testID="end-score">
          <View style={styles.score}>
            <AppText style={[styles.scoreLabel, { color: ink.text }]} {...fitText(consoleMode, 1, 0.7)}>
              {t('end.score')}
            </AppText>
            <AppText style={[styles.scoreValue, { color: ink.text }]} {...fitText(consoleMode, 1, 0.7)} testID="end-score-value">
              {String(model.score)}
            </AppText>
          </View>
        </Plate>
        <AppText style={[styles.note, { color: theme.text }]} numberOfLines={consoleMode ? noteN : undefined}>
          {t('end.canRestart')}
        </AppText>
      </View>
    </>
  );
  const buttonStyle = consoleMode ? { height: buttonHeight(scale) } : { minHeight: buttonHeight(scale) };
  const actions = (
    <View style={styles.rail}>
      <Button label={t('end.newRun')} variant="primary" onPress={once(() => session.newRun())} testID="end-new-run" style={buttonStyle} fit={consoleMode} />
      <Button label={t('end.toTitle')} onPress={once(onToTitle)} testID="end-to-title" style={buttonStyle} fit={consoleMode} />
    </View>
  );

  const hud = (
    <Hud
      screen="end"
      zoneLabel={model.title}
      titleRef={heading}
      titleTestID="end-heading"
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
        screen="end"
        testID={testID}
        hud={hud}
        primary={main}
        actions={actions}
        backdrop={sheets.backdrop}
        overlay={<RunLogMessage landscape={landscape} />}
      />
      {sheets.settings.sheet}
      <Sheet visible={sheets.detailsOpen} onClose={sheets.closeDetails} title={t('run.details')} openerRef={sheets.detailsRef} testID="run-sheet">
        <Plate style={styles.stats} testID="end-stats">
          {model.stats.map((s, i) => (
            <View key={i} style={styles.stat} accessible accessibilityLabel={`${s.label}: ${s.value}`} testID={`end-stat-${i}`}>
              <AppText style={[styles.statLabel, { color: ink.muted }]}>{s.label}</AppText>
              <AppText style={[styles.statValue, { color: ink.text }]}>{String(s.value)}</AppText>
            </View>
          ))}
        </Plate>
        <RunLogPanel />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  main: { gap: MAIN_GAP },
  mainFill: { flex: 1, minHeight: 0, gap: MAIN_GAP, padding: MAIN_PAD },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  sceneBox: { flex: 1, minHeight: 0, justifyContent: 'center', overflow: 'hidden' },
  score: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreLabel: { fontSize: SCORE_LABEL_SIZE, fontWeight: '700', flex: 1 },
  scoreValue: { fontSize: SCORE_VALUE_SIZE, fontWeight: '700' },
  note: { fontSize: NOTE_SIZE },
  rail: { padding: RAIL_PAD, gap: RAIL_GAP, flexShrink: 1 },
  stats: { gap: 8 },
  // The label wraps inside its own column at large text; the value stays on the right of its row.
  stat: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statLabel: { fontSize: 16, flex: 1 },
  statValue: { fontSize: 16, fontWeight: '700', textAlign: 'right' },
});
