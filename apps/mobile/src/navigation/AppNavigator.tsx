// One native stack: Title -> Run, plus the dev screens (hello core, gallery, self test). The Run
// route draws every run phase itself, so the stack never grows during a run. Headers are off: each
// screen has its own heading, and the Run route has no back button (Android back asks to abandon).
import {
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useFocusEffect,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { useColorScheme } from 'react-native';

import HelloScreen from '../HelloScreen';
import { useRunSession } from '../run/useRunSession';
import { RunScreen } from '../screens/RunScreen';
import Gallery from '../screens/Gallery';
import SelfTest from '../screens/SelfTest';
import { TitleScreen } from '../screens/TitleScreen';
import { DARK, LIGHT } from '../theme';

export type RootStackParamList = {
  Title: undefined;
  Run: undefined;
  Hello: undefined;
  Gallery: undefined;
  /** `autoRun` > 0 runs the self test on mount; a new number reruns it. */
  SelfTest: { autoRun?: number } | undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();

export interface AppNavigatorProps {
  /** Show the "Dev tools" link on the title screen (default: __DEV__). */
  devTools?: boolean;
  onReady?: () => void;
}

function TitleRoute({ navigation, devTools }: NativeStackScreenProps<RootStackParamList, 'Title'> & { devTools: boolean }) {
  const { session } = useRunSession();
  // Coming back to the title (from the dev tools, say) re-reads the slot: Continue and the notices stay true.
  useFocusEffect(
    useCallback(() => {
      void session.refreshSaved();
    }, [session]),
  );
  return (
    <TitleScreen
      onRunReady={() => navigation.navigate('Run')}
      onOpenDevTools={devTools ? () => navigation.navigate('Hello') : undefined}
    />
  );
}

function RunRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Run'>) {
  return <RunScreen onExit={() => navigation.popTo('Title')} />;
}

function HelloRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Hello'>) {
  return <HelloScreen onOpenGallery={() => navigation.navigate('Gallery')} onOpenSelfTest={() => navigation.navigate('SelfTest')} />;
}

function GalleryRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Gallery'>) {
  return <Gallery onBack={() => navigation.goBack()} />;
}

function SelfTestRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SelfTest'>) {
  const autoRun = route.params?.autoRun ?? 0;
  return (
    <SelfTest
      key={autoRun}
      autoRun={autoRun > 0}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Title'))}
    />
  );
}

export function AppNavigator({ devTools = __DEV__, onReady }: AppNavigatorProps) {
  const dark = useColorScheme() === 'dark';
  const palette = dark ? DARK : LIGHT;
  const navTheme: NavTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      primary: palette.accent,
      background: palette.bg,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.danger,
    },
  };
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={onReady}>
      <Stack.Navigator initialRouteName="Title" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
        <Stack.Screen name="Title">{(props) => <TitleRoute {...props} devTools={devTools} />}</Stack.Screen>
        <Stack.Screen name="Run" component={RunRoute} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Hello" component={HelloRoute} />
        <Stack.Screen name="Gallery" component={GalleryRoute} />
        <Stack.Screen name="SelfTest" component={SelfTestRoute} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
