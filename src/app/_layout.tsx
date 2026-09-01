import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { AuthProvider } from '@/context/auth-context';

/** Always dark — Primal Physique has one fixed brand theme, not one that
 * follows the device's light/dark setting. */
export default function RootLayout() {
  return (
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
