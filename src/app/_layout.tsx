import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BrandLogo } from '@/components/brand-logo';
import { AuthProvider } from '@/context/auth-context';

/** Always dark — Primal Physique has one fixed brand theme, not one that
 * follows the device's light/dark setting. */
export default function RootLayout() {
  return (
    // react-native-gesture-handler and react-native-reanimated were
    // already dependencies (pulled in by expo-router/react-native-screens)
    // but never actually wired up until the photo compare tool needed real
    // pinch gestures — GestureHandlerRootView has to wrap the whole app,
    // not just the screen that uses it, or gestures can behave
    // inconsistently (especially inside modals/navigators).
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={DarkTheme}>
        <AuthProvider>
          {/* A single wrapping View so the logo's absolute positioning is
           * anchored to the full screen, not floating relative to nothing. */}
          <View style={styles.root}>
            <Stack screenOptions={{ headerShown: false }} />
            <BrandLogo />
          </View>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
