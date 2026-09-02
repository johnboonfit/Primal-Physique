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

  if (loadingProfile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
