import { CONTENT } from '@kinfall/core/content';
import {
  checkBattleGolden,
  checkRunGolden,
  combineSelfTest,
  selfTestSummary,
  type SelfTestResult,
} from '@kinfall/core/sim/selfTest';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Imported straight from core's golden files (Metro bundles JSON and watches the workspace root),
// never copied: a copy could drift from the files the Node and browser golden tests replay.
import battleGolden from '../../../../packages/core/tests/golden/battle.golden.json';
import runGolden from '../../../../packages/core/tests/golden/run.golden.json';
import { engineInfoLines, getEngineInfo } from '../platform/engineInfo';
import { DARK, useTheme } from '../theme';

export interface SelfTestReport {
  result: SelfTestResult;
  summary: string;
  elapsedMs: number;
  battleMs: number;
  runMs: number;
  engine: string[];
}

type State = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; report: SelfTestReport };

const now: () => number =
  typeof globalThis.performance?.now === 'function' ? () => globalThis.performance.now() : () => Date.now();

/** Lets React commit and the UI thread draw (the spinner) before the next synchronous replay. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    const next = () => setTimeout(resolve, 0);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(next);
    else next();
  });
}

/** Replays both golden files on this JS engine, yielding between them, and logs the outcome. */
export async function runSelfTest(): Promise<SelfTestReport> {
  await yieldToUi();
  const t0 = now();
  const battle = checkBattleGolden(battleGolden, CONTENT);
  const battleMs = now() - t0;
  await yieldToUi();
  const t1 = now();
  const run = checkRunGolden(runGolden, CONTENT);
  const runMs = now() - t1;
  const result = combineSelfTest(battle, run);
  const summary = selfTestSummary(result);
  const engine = engineInfoLines(getEngineInfo());
  const elapsedMs = Math.round(battleMs + runMs);
  const report = { result, summary, elapsedMs, battleMs: Math.round(battleMs), runMs: Math.round(runMs), engine };
  // Readable without the UI: adb logcat -s ReactNativeJS
  console.log(`[selftest] ${summary} elapsed=${elapsedMs}ms (battle ${report.battleMs}ms, run ${report.runMs}ms)`);
  console.log(`[selftest] engine ${engine.join(' | ')}`);
  return report;
}

const short = (v: unknown) => JSON.stringify(v);

/**
 * Dev screen: proves the engine is deterministic on this device by replaying every golden battle
 * and run (Jest runs on Node, so only this proves Hermes). Labels are plain English on purpose.
 */
export default function SelfTest({ onBack, autoRun = false }: { onBack: () => void; autoRun?: boolean }) {
  const theme = useTheme();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const active = useRef(true);
  const engine = useMemo(() => engineInfoLines(getEngineInfo()), []);

  const start = useCallback(() => {
    setState((s) => (s.kind === 'running' ? s : { kind: 'running' }));
    runSelfTest().then((report) => {
      if (active.current) setState({ kind: 'done', report });
    });
  }, []);

  useEffect(() => {
    active.current = true;
    if (autoRun) start();
    return () => {
      active.current = false;
    };
  }, [autoRun, start]);

  const running = state.kind === 'running';
  const report = state.kind === 'done' ? state.report : null;
  const result = report?.result;
  const runLabel = report ? 'Run again' : 'Run self test';
  const passed = (checks: { ok: boolean }[]) => checks.filter((c) => c.ok).length;
  const mismatch = result?.firstMismatch
    ? result.firstMismatch.kind === 'battle'
      ? result.battle[result.firstMismatch.index]
      : result.run[result.firstMismatch.index]
    : undefined;
  const colour = { color: theme.text };
  const dark = theme === DARK;
  const verdictColour = result?.ok ? (dark ? '#6fdc92' : '#0b6b2e') : dark ? '#ff8a80' : '#a40000';

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} testID="selftest">
      <View style={styles.body}>
        <Text style={[styles.title, colour]} accessibilityRole="header">
          Self test
        </Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.button, styles.rowButton, running && styles.buttonOff]}
            onPress={start}
            disabled={running}
            accessibilityRole="button"
            // No `busy` state: Android leaves the button's description stuck on "busy" afterwards.
            // The explicit label keeps the description in step with the visible text.
            accessibilityLabel={runLabel}
            accessibilityState={{ disabled: running }}
            testID="selftest-run"
          >
            <Text style={styles.buttonText}>{runLabel}</Text>
          </Pressable>
          <Pressable
            style={[styles.back, styles.rowButton, { borderColor: theme.border }]}
            onPress={onBack}
            accessibilityRole="button"
            testID="selftest-back"
          >
            <Text style={[styles.backText, colour]}>Back</Text>
          </Pressable>
        </View>
        {running && (
          <View style={styles.row} testID="selftest-running">
            <ActivityIndicator />
            <Text style={[styles.line, colour]}>Replaying golden files...</Text>
          </View>
        )}
        {report && result && (
          <View style={styles.section} testID="selftest-report">
            <Text
              style={[styles.verdict, { color: verdictColour }]}
              accessibilityRole="alert"
              testID="selftest-verdict"
            >
              {result.ok ? 'PASS' : 'FAIL'}
            </Text>
            <Text style={[styles.line, colour]} testID="selftest-battle-count">
              Battle {passed(result.battle)}/{result.battle.length}
            </Text>
            <Text style={[styles.line, colour]} testID="selftest-run-count">
              Run {passed(result.run)}/{result.run.length}
            </Text>
            <Text style={[styles.line, colour]} testID="selftest-elapsed">
              Elapsed: {report.elapsedMs} ms (battle {report.battleMs} ms, run {report.runMs} ms)
            </Text>
            {result.firstMismatch && (
              <View style={styles.section} testID="selftest-mismatch">
                <Text style={[styles.line, colour]}>
                  First mismatch: {result.firstMismatch.kind} #{result.firstMismatch.index}
                </Text>
                <Text style={[styles.mono, colour]} selectable>
                  Expected: {short(mismatch?.expected ?? null)}
                </Text>
                <Text style={[styles.mono, colour]} selectable>
                  Actual: {short(mismatch?.actual ?? null)}
                </Text>
                {mismatch?.error !== undefined && (
                  <Text style={[styles.mono, colour]} selectable>
                    Error: {mismatch.error}
                  </Text>
                )}
              </View>
            )}
            {result.errors.map((e) => (
              <Text key={e} style={[styles.mono, colour]} testID="selftest-error">
                Error: {e}
              </Text>
            ))}
            {result.battle.map((c) => (
              <Text key={`b${c.index}`} style={[styles.mono, colour]}>
                {c.ok ? 'ok  ' : 'FAIL'} battle #{c.index} {c.name} {c.actual?.finalHash ?? '-'}
              </Text>
            ))}
            {result.run.map((c) => (
              <Text key={`r${c.index}`} style={[styles.mono, colour]}>
                {c.ok ? 'ok  ' : 'FAIL'} run #{c.index} {c.seed}/{c.starterId} {c.actual?.finalHash ?? '-'}
              </Text>
            ))}
            <Text style={[styles.mono, colour]} selectable testID="selftest-summary">
              {report.summary}
            </Text>
          </View>
        )}
        <View style={styles.section} testID="selftest-engine">
          <Text style={[styles.subtitle, colour]}>Engine</Text>
          {engine.map((line) => (
            <Text key={line} style={[styles.mono, colour]} selectable>
              {line}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: 16, paddingTop: 56, paddingBottom: 48, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 18, fontWeight: '600' },
  section: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowButton: { flex: 1 },
  button: {
    minHeight: 48,
    borderRadius: 6,
    backgroundColor: '#1f4fbf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOff: { backgroundColor: '#6b7280' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  back: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 6 },
  backText: { fontSize: 16, fontWeight: '600' },
  verdict: { fontSize: 44, fontWeight: '800', letterSpacing: 2 },
  line: { fontSize: 16 },
  mono: { fontSize: 13, fontFamily: 'monospace' },
});
