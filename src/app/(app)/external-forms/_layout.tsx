import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/** Coach-only, same pattern as /forms, /workouts, /habits, and /programmes. */
export default function ExternalFormsLayout() {
  const { profile, loadingProfile } = useAuth();

  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
