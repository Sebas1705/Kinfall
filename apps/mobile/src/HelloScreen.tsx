import { CONTENT } from '@webgames/core/content';
import { createAsyncRunStorage, type AsyncStorageLike } from '@webgames/core/platform/asyncRunStorage';
import { getLang, setLang, t, type Lang } from '@webgames/core/platform/i18n';
import { hashRun } from '@webgames/core/sim/run/codec';
import type { RunState } from '@webgames/core/sim/run/types';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_SEED, runHelloWithState, type HelloResult } from './helloCore';
import { useA11ySettings } from './platform/a11ySettings';
import { defaultAsyncStorage } from './platform/asyncStorage';

type Outcome = { ok: true; value: HelloResult; run: RunState } | { ok: false; error: string };

const LANGS: Lang[] = ['es', 'en'];

/**
 * "Hello core": runs the shared engine on the device and prints the run hash for a seed, and
 * proves the platform adapters (language, run storage, accessibility settings).
 * Dev screen: its labels outside the core string tables are throwaway.
 */
export default function HelloScreen({ storage }: { storage?: AsyncStorageLike | null }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [status, setStatus] = useState<{ id: 'save' | 'load'; text: string } | null>(null);
  const a11y = useA11ySettings();
  const runStorage = useMemo(
    () => createAsyncRunStorage(storage === undefined ? defaultAsyncStorage() : storage, CONTENT),
    [storage],
  );
  const lang = getLang();

  const onRun = () => {
    try {
      const { summary, run } = runHelloWithState(seed.trim());
      setOutcome({ ok: true, value: summary, run });
    } catch (e) {
      setOutcome({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const onSave = async () => {
    if (outcome?.ok !== true) return;
    const result = await runStorage.save(outcome.run);
    setStatus({
      id: 'save',
      text: result.ok ? `Saved: ${hashRun(outcome.run)}` : t('save.failed', { reason: result.error }), // dev screen
    });
  };

  const onLoad = async () => {
    const result = await runStorage.load();
    let text: string;
    switch (result.kind) {
      case 'none':
        text = 'Load: none'; // dev screen
        break;
      case 'ok':
        text = `Load: ok ${hashRun(result.run)}`; // dev screen
        break;
      case 'corrupt':
        text = `Load: corrupt. ${t('title.corrupt', { reason: result.error })}`; // dev screen
        break;
      case 'unavailable':
        text = `Load: unavailable (${result.error})`; // dev screen
        break;
    }
    setStatus({ id: 'load', text });
  };

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          Hello core
        </Text>
        <Text style={styles.label} testID="language-line">
          {t('settings.language')}: {lang}
        </Text>
        <View style={styles.row}>
          {LANGS.map((code) => (
            <Pressable
              key={code}
              style={[styles.button, styles.rowButton, code !== lang && styles.buttonOff]}
              onPress={() => setLang(code)}
              accessibilityRole="button"
              accessibilityState={{ selected: code === lang }}
              testID={`lang-${code}`}
            >
              <Text style={styles.buttonText}>{code.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.line} testID="a11y-line">
          Reduce motion: {a11y.reduceMotion ? 'on' : 'off'} / Font scale: {a11y.fontScale}
        </Text>
        <Text style={styles.label} nativeID="seedLabel">
          Seed
        </Text>
        <TextInput
          style={styles.input}
          value={seed}
          onChangeText={setSeed}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabelledBy="seedLabel"
          accessibilityLabel="Seed"
          testID="seed-input"
        />
        <Pressable style={styles.button} onPress={onRun} accessibilityRole="button" testID="run-button">
          <Text style={styles.buttonText}>Run</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable
            style={[styles.button, styles.rowButton, outcome?.ok !== true && styles.buttonOff]}
            onPress={onSave}
            disabled={outcome?.ok !== true}
            accessibilityRole="button"
            testID="save-button"
          >
            <Text style={styles.buttonText}>Save last run</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.rowButton]} onPress={onLoad} accessibilityRole="button" testID="load-button">
            <Text style={styles.buttonText}>Load</Text>
          </Pressable>
        </View>
        {status && (
          <Text style={styles.line} selectable testID={`${status.id}-status`}>
            {status.text}
          </Text>
        )}
        {outcome?.ok === true && (
          <View testID="result">
            <Text style={styles.line}>Starter: {outcome.value.starterId}</Text>
            <Text style={styles.line} selectable testID="hash">
              Hash: {outcome.value.hash}
            </Text>
            <Text style={styles.line}>Result: {outcome.value.result}</Text>
            <Text style={styles.line}>Score: {outcome.value.score}</Text>
            <Text style={styles.line}>Steps: {outcome.value.steps}</Text>
          </View>
        )}
        {outcome?.ok === false && (
          <Text style={styles.error} accessibilityRole="alert" testID="error">
            Error: {outcome.error}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  body: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#111111' },
  label: { fontSize: 16, color: '#111111' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#555555',
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#111111',
  },
  button: {
    minHeight: 48,
    borderRadius: 6,
    backgroundColor: '#1f4fbf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOff: { backgroundColor: '#6b7280' },
  row: { flexDirection: 'row', gap: 12 },
  rowButton: { flex: 1 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  line: { fontSize: 16, color: '#111111', fontFamily: 'monospace' },
  error: { fontSize: 16, color: '#a40000' },
});
