import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

/**
 * Wraps the login and signup screens. If someone is already logged in and
 * navigates here (e.g. by going back), bounce them to their home instead
 * of showing the login form again — coaches to /home, clients to /client.
 */
export default function AuthLayout() {
  const { session, initializing, profile, loadingProfile } = useAuth();

  if (initializing || (session && loadingProfile)) return null;
  if (session) return <Redirect href={profile?.role === 'client' ? '/client' : '/home'} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
