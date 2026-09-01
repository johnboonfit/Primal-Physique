import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/**
 * Wraps the login and signup screens. If someone is already logged in and
 * navigates here (e.g. by going back), bounce them to the home screen
 * instead of showing the login form again.
 */
export default function AuthLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return null;
  if (session) return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
