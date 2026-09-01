import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/**
 * Wraps every screen that requires a logged-in user. If there's no session
 * (e.g. it expired, or someone typed the URL directly on web), send them
 * back to login instead of rendering the protected screen.
 */
export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return null;
  if (!session) return <Redirect href="/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
