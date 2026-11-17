import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import HelloScreen from './src/HelloScreen';
import Gallery from './src/screens/Gallery';
import SelfTest from './src/screens/SelfTest';
import { installMobileI18n } from './src/platform/mobileI18n';
import { selfTestEnvFlag, shouldAutorunSelfTest } from './src/selfTestAutorun';

type Screen = 'hello' | 'gallery' | 'selftest';

async function initialUrl(): Promise<string | null> {
  try {
    return (await Linking.getInitialURL()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Installs the saved language before showing anything, so the first frame is already in the
 * right language. `lang` state only exists to re-render the tree when the language changes.
 * The dev self test opens and runs by itself when EXPO_PUBLIC_SELFTEST_AUTORUN=1 or when the
 * app is opened with a `selftest` URL (see src/selfTestAutorun.ts); never otherwise.
 */
export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('hello'); // no navigation library until Task 7
  const [autoRun, setAutoRun] = useState(0); // bumps on every autorun request, so a new link reruns
  const [, setLangVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const request = () => {
      setScreen('selftest');
      setAutoRun((n) => n + 1);
    };
    Promise.all([installMobileI18n({ onChange: () => setLangVersion((n) => n + 1) }), initialUrl()]).then(
      ([, url]) => {
        if (!active) return;
        if (shouldAutorunSelfTest(url, selfTestEnvFlag())) request();
        setReady(true);
      },
    );
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (active && shouldAutorunSelfTest(url, undefined)) request();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  if (screen === 'gallery') return <Gallery onBack={() => setScreen('hello')} />;
  if (screen === 'selftest')
    return (
      <SelfTest
        key={autoRun}
        autoRun={autoRun > 0}
        onBack={() => {
          setAutoRun(0); // opening it again from the button must not auto-run
          setScreen('hello');
        }}
      />
    );
  return <HelloScreen onOpenGallery={() => setScreen('gallery')} onOpenSelfTest={() => setScreen('selftest')} />;
}
