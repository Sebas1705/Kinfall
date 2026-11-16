import { useEffect, useState } from 'react';
import { View } from 'react-native';

import HelloScreen from './src/HelloScreen';
import { installMobileI18n } from './src/platform/mobileI18n';

/**
 * Installs the saved language before showing anything, so the first frame is already in the
 * right language. `lang` state only exists to re-render the tree when the language changes.
 */
export default function App() {
  const [ready, setReady] = useState(false);
  const [, setLangVersion] = useState(0);

  useEffect(() => {
    let active = true;
    installMobileI18n({ onChange: () => setLangVersion((n) => n + 1) }).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  return <HelloScreen />;
}
