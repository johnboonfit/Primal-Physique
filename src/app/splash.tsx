import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';

const DISPLAY_MS = 3000;

/**
 * Shown once, right after a successful login (see (auth)/login.tsx) — never
 * on an app relaunch with an already-persisted session, since that's not
 * "logging in." Fixed 3-second brand moment, then hands off to the same
 * '/home' target login already redirected to (home.tsx itself still
 * redirects a client to '/client', so that role split is untouched).
 */
export default function SplashScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/home');
    }, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" themeColor="textSecondary" style={styles.welcome}>
        Welcome To
      </ThemedText>
      <Image source={require('@/assets/images/logo.jpg')} style={styles.logo} contentFit="contain" />
      <ThemedText type="title" style={styles.wordmark}>
        PRIMAL PHYSIQUE
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.five,
  },
  welcome: {
    textAlign: 'center',
  },
  logo: {
    width: 240,
    height: 240,
  },
  wordmark: {
    color: Accent,
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 2,
  },
});
