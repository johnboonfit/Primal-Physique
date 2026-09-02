import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/** Coach-only, same pattern as /workouts and /assignments. */
export default function HabitsLayout() {
  const { profile, loadingProfile } = useAuth();

  // Only block on a profile we don't have yet — not on a later re-fetch
  // (e.g. after a token refresh on app resume) of a profile we already
  // have, which would otherwise unmount this Stack and reset it to its
  // first screen every time.
  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
