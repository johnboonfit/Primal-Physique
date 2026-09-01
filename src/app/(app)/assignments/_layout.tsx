import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/**
 * Wraps every screen under /assignments. Coach-only for the same reason as
 * /workouts — a client hitting this URL directly gets sent home instead
 * of seeing a screen meant for coaches.
 */
export default function AssignmentsLayout() {
  const { profile, loadingProfile } = useAuth();

  if (loadingProfile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
