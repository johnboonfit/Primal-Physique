import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/**
 * Wraps every screen under /exercise-library. Coach-only for now, same
 * as /workouts and /programmes — the library itself has no owner (any
 * signed-in user can read the data), but this chunk only builds the
 * coach's browse screen. A client-facing view can reuse the same
 * read-only data later without any database change.
 */
export default function ExerciseLibraryLayout() {
  const { profile, loadingProfile } = useAuth();

  // Only block on a profile we don't have yet — not on a later re-fetch
  // (e.g. after a token refresh on app resume) of a profile we already
  // have, which would otherwise unmount this Stack and reset it to its
  // first screen every time.
  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
