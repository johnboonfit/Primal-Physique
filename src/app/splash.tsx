import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const DISPLAY_MS = 3000;

// Real aspect ratio of primal-wordmark.png (981x144, background already
// removed — see the dated README section) — keeps it from stretching at
// any width.
const WORDMARK_ASPECT_RATIO = 981 / 144;
const WORDMARK_WIDTH = 320;

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
      <Image source={require('@/assets/images/primal-wordmark.png')} style={styles.wordmark} contentFit="contain" />
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
  wordmark: {
    width: WORDMARK_WIDTH,
    height: WORDMARK_WIDTH / WORDMARK_ASPECT_RATIO,
  },
});
