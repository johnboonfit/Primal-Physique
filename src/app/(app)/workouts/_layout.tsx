import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/**
 * Wraps every screen under /workouts. Only coach accounts can create or
 * view workouts right now, so a client hitting this URL directly (or a
 * link we forgot to hide) gets bounced to home instead of seeing an empty
 * or broken screen.
 */
export default function WorkoutsLayout() {
  const { profile, loadingProfile } = useAuth();

  // Only block on a profile we don't have yet — not on a later re-fetch
  // (e.g. after a token refresh on app resume) of a profile we already
  // have, which would otherwise unmount this Stack and reset it to its
  // first screen every time.
  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
