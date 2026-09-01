import { DarkTheme, Stack, ThemeProvider } from 'expo-router';

import { AuthProvider } from '@/context/auth-context';

/** Always dark — Primal Physique has one fixed brand theme, not one that
 * follows the device's light/dark setting. */
export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </ThemeProvider>
  );
}
