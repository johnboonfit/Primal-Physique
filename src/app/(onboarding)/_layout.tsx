import { Stack } from 'expo-router';

/**
 * No blanket redirect here, unlike (auth) and (app)'s section layouts —
 * this group deliberately serves two different audiences: welcome/signup
 * (no session yet) and parq/health-advisory (a real session, mid-
 * onboarding). Each screen decides for itself what it needs; see each
 * one's own guard.
 */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
