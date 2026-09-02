import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/** Coach-only, same pattern as /workouts, /habits, and /programmes. */
export default function FormsLayout() {
  const { profile, loadingProfile } = useAuth();

  // Only block on a profile we don't have yet — not on a later re-fetch
  // (e.g. after a token refresh on app resume) of a profile we already
  // have. Unmounting this Stack on every re-fetch would reset navigation
  // back to /forms every time the app came back from the background.
  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
