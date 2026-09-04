import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { getOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';

const ONBOARDING_ROUTES: Record<Exclude<OnboardingStatus, 'complete'>, string> = {
  needs_parq: '/parq',
  needs_health_review: '/health-advisory',
};

/**
 * The very first screen the app opens to. It doesn't show anything itself —
 * it just checks whether we already have a logged-in session (and, if so,
 * which role that account is) and sends the user to the right place:
 * the coach's home, the client's tabs, or the login screen. For a client,
 * that also means checking onboarding status first — a client who hasn't
 * finished PARQ (or is health-flagged and hasn't acknowledged it yet)
 * lands back on exactly that step, not Home.
 */
export default function Index() {
  const { session, initializing, profile, loadingProfile } = useAuth();

  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);

  useEffect(() => {
    if (!session || profile?.role !== 'client') return;
    let cancelled = false;
    setCheckingOnboarding(true);
    getOnboardingStatus(session.user.id)
      .then((status) => {
        if (!cancelled) setOnboardingStatus(status);
      })
      .finally(() => {
        if (!cancelled) setCheckingOnboarding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, profile?.role]);

  if (initializing || (session && loadingProfile)) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (profile?.role === 'client') {
    if (checkingOnboarding || onboardingStatus === null) {
      return (
        <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </ThemedView>
      );
    }
    if (onboardingStatus !== 'complete') {
      return <Redirect href={ONBOARDING_ROUTES[onboardingStatus] as never} />;
    }
    return <Redirect href="/client" />;
  }

  return <Redirect href="/home" />;
}
