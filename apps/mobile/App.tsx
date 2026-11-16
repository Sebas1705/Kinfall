import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_SEED, runHello, type HelloResult } from './src/helloCore';

type Outcome = { ok: true; value: HelloResult } | { ok: false; error: string };

/** "Hello core": runs the shared engine on the device and prints the run hash for a seed. */
export default function App() {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const onRun = () => {
    try {
      setOutcome({ ok: true, value: runHello(seed.trim()) });
    } catch (e) {
      setOutcome({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          Hello core
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
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  line: { fontSize: 16, color: '#111111', fontFamily: 'monospace' },
  error: { fontSize: 16, color: '#a40000' },
});
