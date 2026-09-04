import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';

const ONBOARDING_ROUTES: Record<Exclude<OnboardingStatus, 'complete'>, string> = {
  needs_parq: '/parq',
  needs_health_review: '/health-advisory',
};

/**
 * Step 1. A returning, already-signed-in visitor who navigates here
 * (back button, a stale bookmark) gets sent straight to wherever they
 * actually are in the flow rather than seeing the intro again — this
 * screen itself has nothing worth resuming, since it's stateless.
 */
export default function WelcomeScreen() {
  const { session, profile, loadingProfile } = useAuth();
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!session || profile?.role !== 'client') return;
    let cancelled = false;
    setChecking(true);
    getOnboardingStatus(session.user.id)
      .then((status) => {
        if (!cancelled) setOnboardingStatus(status);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, profile?.role]);

  if (session && profile?.role === 'coach') {
    return <Redirect href="/home" />;
  }
  if (session && profile?.role === 'client') {
    if (checking || onboardingStatus === null) return null;
    if (onboardingStatus !== 'complete') return <Redirect href={ONBOARDING_ROUTES[onboardingStatus] as never} />;
    return <Redirect href="/client" />;
  }
  if (loadingProfile) return null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.brand}>
          PRIMAL PHYSIQUE
        </ThemedText>

        <ThemedView style={styles.glowWrap}>
          <ThemedText type="title" style={styles.title}>
            Let&apos;s get you started
          </ThemedText>
        </ThemedView>

        <ThemedText themeColor="textSecondary" style={styles.body}>
          Creating your account takes about a minute. Right after, we&apos;ll ask a few standard health-screening
          questions (a PAR-Q) — the same pre-exercise screen used across the fitness industry — before your training
          begins.
        </ThemedText>

        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={() => router.push('/signup')}>
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            Get started
          </ThemedText>
        </Pressable>

        <Pressable style={styles.linkButton} onPress={() => router.replace('/login')}>
          <ThemedText type="linkPrimary">Already have an account? Log in</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  brand: {
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: Spacing.three,
  },
  glowWrap: {
    ...Glow.oxblood,
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
  linkButton: {
    alignSelf: 'center',
    marginTop: Spacing.two,
  },
});
