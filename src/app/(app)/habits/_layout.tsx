import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/** Coach-only, same pattern as /workouts and /assignments. */
export default function HabitsLayout() {
  const { profile, loadingProfile } = useAuth();

  if (loadingProfile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
