import { CONTENT } from '@kinfall/core/content';
import { createAsyncRunStorage } from '@kinfall/core/platform/asyncRunStorage';
import { getLang, type Lang } from '@kinfall/core/platform/i18n';
import { useEffect, useRef, useState } from 'react';
import { Appearance, Linking, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator, navigationRef } from './src/navigation/AppNavigator';
import { defaultAsyncStorage } from './src/platform/asyncStorage';
import { useApplyImmersive } from './src/platform/immersive';
import { loadImmersiveSetting } from './src/platform/immersiveSetting';
import { LangContext } from './src/platform/LangContext';
import { installMobileI18n } from './src/platform/mobileI18n';
import { loadMotionSetting } from './src/platform/motionSetting';
import { loadTextSizeSetting } from './src/platform/textSizeSetting';
import { randomSeed } from './src/platform/random';
import { createRunSession, type RunSession } from './src/run/session';
import { RunSessionProvider } from './src/run/useRunSession';
import { selfTestEnvFlag, shouldAutorunSelfTest } from './src/selfTestAutorun';
import { DARK, LIGHT } from './src/theme';

async function initialUrl(): Promise<string | null> {
  try {
    return (await Linking.getInitialURL()) ?? null;
  } catch {
    return null;
  }
}

export interface AppProps {
  /** Tests inject a session over their own storage; the app builds one over AsyncStorage. */
  session?: RunSession;
  /** Show the title screen's "Dev tools" link (default: __DEV__, so never in production builds). */
  devTools?: boolean;
}

function defaultSession(): RunSession {
  return createRunSession({ content: CONTENT, storage: createAsyncRunStorage(defaultAsyncStorage(), CONTENT), randomSeed });
}

/**
 * Installs the saved language before showing anything, so the first frame is already in the
 * right language; `lang` state re-renders every screen when it changes. The dev self test opens
 * and runs by itself when EXPO_PUBLIC_SELFTEST_AUTORUN=1 or when the app is opened with a
 * `selftest` URL (see src/selfTestAutorun.ts); never otherwise.
 */
export function AppShell({ session: injected, devTools }: AppProps) {
  useApplyImmersive();
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang | null>(null);
  const [session] = useState<RunSession>(() => injected ?? defaultSession());
  /** Self-test autorun requested before the navigator was ready (0 = none). */
  const pendingAutoRun = useRef(0);
  const autoRuns = useRef(0);

  const openSelfTest = (n: number) => {
    if (navigationRef.isReady()) navigationRef.navigate('SelfTest', { autoRun: n });
    else pendingAutoRun.current = n;
  };

  useEffect(() => {
    let active = true;
    const request = () => openSelfTest(++autoRuns.current);
    Promise.all([installMobileI18n({ onChange: (l) => setLangState(l) }), initialUrl(), loadMotionSetting(), loadTextSizeSetting(), loadImmersiveSetting()]).then(([, url]) => {
      if (!active) return;
      setLangState(getLang());
      if (shouldAutorunSelfTest(url, selfTestEnvFlag())) request();
      setReady(true);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (active && shouldAutorunSelfTest(url, undefined)) request();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: Appearance.getColorScheme() === 'dark' ? DARK.bg : LIGHT.bg }} />;
  return (
    <SafeAreaProvider>
      <LangContext.Provider value={lang}>
        <RunSessionProvider session={session}>
          <AppNavigator
            devTools={devTools}
            onReady={() => {
              const n = pendingAutoRun.current;
              pendingAutoRun.current = 0;
              if (n > 0) navigationRef.navigate('SelfTest', { autoRun: n });
            }}
          />
        </RunSessionProvider>
      </LangContext.Provider>
    </SafeAreaProvider>
  );
}

/** The registered root component (no props: the real session and storage). */
export default function App() {
  return <AppShell />;
}
